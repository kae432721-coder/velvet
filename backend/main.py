import hashlib
import asyncio
import re
import sqlite3
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, Response
from fastapi.staticfiles import StaticFiles
from ytmusicapi import YTMusic
import yt_dlp

try:
    from JioSaavn import JioSaavnClient
    HAS_SAAVN = True
except Exception:
    HAS_SAAVN = False

APP_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = APP_DIR / "frontend"
MUSIC_DIR = Path.home() / "Music" / "Velvet"
DB_PATH = APP_DIR / "velvet.db"

MUSIC_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Velvet Music Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ytm = YTMusic()


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS downloads (
                id TEXT PRIMARY KEY,
                source TEXT,
                title TEXT,
                artist TEXT,
                album TEXT,
                duration INTEGER,
                thumbnail TEXT,
                filepath TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS history (
                id TEXT PRIMARY KEY,
                source TEXT,
                title TEXT,
                artist TEXT,
                thumbnail TEXT,
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                id TEXT PRIMARY KEY,
                source TEXT,
                title TEXT,
                artist TEXT,
                thumbnail TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id INTEGER,
                track_id TEXT,
                source TEXT,
                title TEXT,
                artist TEXT,
                thumbnail TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (playlist_id, track_id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS play_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id TEXT,
                title TEXT,
                artist TEXT,
                thumbnail TEXT,
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)


init_db()


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/*?:"<>|]', "", name).strip()[:120]


def upscale_thumb(url: str) -> str:
    if not url:
        return ""
    return re.sub(r"w\d+-h\d+", "w544-h544", url)


def get_local_file(track_id: str) -> Optional[Path]:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("SELECT filepath FROM downloads WHERE id = ?", (track_id,)).fetchone()
        if row and Path(row[0]).exists():
            return Path(row[0])
    return None


@app.get("/api/health")
def health():
    return {"status": "ok", "saavn": HAS_SAAVN, "music_dir": str(MUSIC_DIR)}


@app.get("/api/search")
async def search(
    q: str = Query(..., min_length=1),
    source: str = Query("both", pattern="^(both|saavn|ytm)$"),
    limit: int = Query(15, ge=1, le=30),
):
    results = []

    if source in ("both", "saavn") and HAS_SAAVN:
        try:
            async with JioSaavnClient() as client:
                songs = await client.search_songs(q, limit=limit)
                for s in songs or []:
                    sid = str(s.get("id", ""))
                    if not sid:
                        continue
                    results.append({
                        "id": f"saavn_{sid}",
                        "raw_id": sid,
                        "source": "saavn",
                        "title": s.get("name") or s.get("song") or s.get("title", "Unknown"),
                        "artist": s.get("primaryArtists") or s.get("primary_artists", "Unknown"),
                        "album": s.get("album", {}).get("name", "") if isinstance(s.get("album"), dict) else str(s.get("album", "")),
                        "duration": int(s.get("duration", 0) or 0),
                        "thumbnail": s.get("image")[-1]["url"] if isinstance(s.get("image"), list) and s.get("image") else str(s.get("image", "")),
                        "downloaded": get_local_file(f"saavn_{sid}") is not None,
                    })
        except Exception as e:
            print(f"[Saavn search error]: {e}")

    if source in ("both", "ytm"):
        try:
            yt_res = await asyncio.to_thread(ytm.search, q, filter="songs", limit=limit)
            for item in yt_res or []:
                vid = item.get("videoId")
                if not vid:
                    continue
                artists = ", ".join(a["name"] for a in item.get("artists", [])) or "Unknown"
                thumbs = item.get("thumbnails", [])
                thumb = upscale_thumb(thumbs[-1]["url"] if thumbs else "")
                results.append({
                    "id": f"ytm_{vid}",
                    "raw_id": vid,
                    "source": "ytm",
                    "title": item.get("title", "Unknown"),
                    "artist": artists,
                    "album": item.get("album", {}).get("name", "") if item.get("album") else "",
                    "duration": item.get("duration_seconds", 0) or 0,
                    "thumbnail": thumb,
                    "downloaded": get_local_file(f"ytm_{vid}") is not None,
                })
        except Exception as e:
            print(f"[YTM search error]: {e}")

    return {"query": q, "count": len(results), "results": results}


async def resolve_stream_url(track_id: str) -> str:
    if track_id.startswith("saavn_") and HAS_SAAVN:
        raw_id = track_id.replace("saavn_", "", 1)
        async with JioSaavnClient() as client:
            song = await client.get_song(raw_id)
            if isinstance(song, list) and song:
                song = song[0]
            urls = song.get("downloadUrl") or song.get("media_url")
            if isinstance(urls, list) and urls:
                return urls[-1].get("url") or urls[-1].get("link")
            if isinstance(urls, str):
                return urls

    if track_id.startswith("ytm_"):
        vid = track_id.replace("ytm_", "", 1)

        def extract():
            clients = [None, ["mweb"], ["android_vr"]]
            last_err = None
            for client in clients:
                ydl_opts = {
                    "format": "bestaudio/best",
                    "quiet": True,
                    "no_warnings": True,
                    "socket_timeout": 12,
                    "retries": 2,
                }
                if client:
                    ydl_opts["extractor_args"] = {"youtube": {"player_client": client}}
                try:
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(f"https://music.youtube.com/watch?v={vid}", download=False)
                        url = info.get("url") if info else None
                        if not url:
                            continue
                        hdrs = dict(info.get("http_headers") or {"User-Agent": "Mozilla/5.0"})
                        # Verify the CDN actually allows streaming this URL (not 403)
                        test_hdrs = {**hdrs, "Range": "bytes=0-1"}
                        with httpx.Client(follow_redirects=True, timeout=6.0) as probe:
                            pr = probe.get(url, headers=test_hdrs)
                            if pr.status_code in (200, 206):
                                if not hasattr(resolve_stream_url, "headers"):
                                    resolve_stream_url.headers = {}
                                resolve_stream_url.headers[url] = hdrs
                                return url
                            last_err = f"{client or 'default'} returned HTTP {pr.status_code}"
                except Exception as e:
                    last_err = e
            raise HTTPException(status_code=502, detail=f"Stream unavailable: {last_err}")

        return await asyncio.to_thread(extract)

    raise HTTPException(status_code=404, detail="Unable to resolve stream URL")


@app.get("/api/stream/{track_id}")
async def stream_track(track_id: str, request: Request):
    local_path = get_local_file(track_id)
    if local_path:
        return FileResponse(local_path, headers={"Cache-Control": "no-store"})

    url = await resolve_stream_url(track_id)
    headers = dict(getattr(resolve_stream_url, "headers", {}).get(url, {"User-Agent": "Mozilla/5.0"}))
    if "range" in request.headers:
        headers["Range"] = request.headers["range"]

    timeout = httpx.Timeout(connect=15.0, read=None, write=None, pool=15.0)
    client = httpx.AsyncClient(follow_redirects=True, timeout=timeout)
    req = client.build_request("GET", url, headers=headers)
    r = await client.send(req, stream=True)

    resp_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Type": r.headers.get("content-type", "audio/webm"),
    }
    for h in ("content-length", "content-range"):
        if h in r.headers:
            resp_headers[h.title()] = r.headers[h]

    async def iter_stream():
        try:
            async for chunk in r.aiter_bytes(chunk_size=65536):
                yield chunk
        finally:
            await r.aclose()
            await client.aclose()

    return StreamingResponse(iter_stream(), status_code=r.status_code, headers=resp_headers)


@app.post("/api/download/{track_id}")
async def download_track(
    track_id: str,
    title: str = Query("Unknown"),
    artist: str = Query("Unknown"),
    album: str = Query(""),
    duration: int = Query(0),
    thumbnail: str = Query(""),
):
    existing = get_local_file(track_id)
    if existing:
        return {"status": "already_downloaded", "id": track_id, "filepath": str(existing)}

    safe_name = sanitize_filename(f"{artist} - {title}")
    source = "saavn" if track_id.startswith("saavn_") else "ytm"

    try:
        if source == "ytm":
            vid = track_id.replace("ytm_", "", 1)
            out_tmpl = str(MUSIC_DIR / f"{safe_name}.%(ext)s")
            final_path = str(MUSIC_DIR / f"{safe_name}.m4a")
            ydl_opts = {
                "format": "bestaudio/best",
                "outtmpl": out_tmpl,
                "retries": 10,
                "fragment_retries": 10,
                "postprocessors": [
                    {"key": "FFmpegExtractAudio", "preferredcodec": "m4a", "preferredquality": "0"},
                    {"key": "FFmpegMetadata", "add_metadata": True},
                ],
                "postprocessor_args": {"ffmpeg": ["-movflags", "+faststart"]},
                "quiet": False,
                "no_warnings": False,
            }

            def run_dl():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.extract_info(f"https://music.youtube.com/watch?v={vid}", download=True)
                    return final_path

            filepath = await asyncio.to_thread(run_dl)
        else:
            url = await resolve_stream_url(track_id)
            ext = "m4a" if ".mp4" in url or ".m4a" in url else "mp3"
            filepath = str(MUSIC_DIR / f"{safe_name}.{ext}")
            async with httpx.AsyncClient(timeout=60) as client:
                r = await client.get(url)
                r.raise_for_status()
                Path(filepath).write_bytes(r.content)

        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO downloads
                   (id, source, title, artist, album, duration, thumbnail, filepath)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (track_id, source, title, artist, album, duration, thumbnail, filepath),
            )
        return {"status": "downloaded", "id": track_id, "filepath": filepath}
    except Exception as e:
        print(f"[DOWNLOAD ERROR] {track_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/download-file/{track_id}")
def get_downloaded_file(track_id: str):
    local_path = get_local_file(track_id)
    if not local_path:
        raise HTTPException(status_code=404, detail="File not downloaded yet")
    return FileResponse(local_path, filename=local_path.name, media_type="application/octet-stream")


@app.delete("/api/downloads/{track_id}")
def delete_download(track_id: str):
    local_path = get_local_file(track_id)
    if local_path and local_path.exists():
        local_path.unlink()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM downloads WHERE id = ?", (track_id,))
    return {"status": "deleted", "id": track_id}


@app.get("/api/downloads")
def list_downloads():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM downloads ORDER BY added_at DESC").fetchall()
    return {"downloads": [dict(r) for r in rows if Path(r["filepath"]).exists()]}


@app.get("/api/lyrics")
async def get_lyrics(title: str, artist: str = ""):
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                "https://lrclib.net/api/search",
                params={"track_name": title, "artist_name": artist},
                headers={"User-Agent": "VelvetLocalPlayer/1.0"},
            )
            if r.status_code == 200:
                items = r.json()
                for item in items:
                    if item.get("syncedLyrics"):
                        return {
                            "synced": True,
                            "lyrics": item["syncedLyrics"],
                            "plain": item.get("plainLyrics", ""),
                        }
                if items and items[0].get("plainLyrics"):
                    return {"synced": False, "lyrics": "", "plain": items[0]["plainLyrics"]}
    except Exception:
        pass
    return {"synced": False, "lyrics": "", "plain": ""}


@app.get("/api/home")
async def get_home(lang: str = Query("English")):
    queries = {
        "English": ("Top English Hits 2026", "New English Pop Releases", "Trending Global Songs"),
        "Hindi": ("Top Hindi Hits 2026", "Bollywood Romantic Hits", "Trending Hindi Songs"),
        "Punjabi": ("Top Punjabi Hits 2026", "Karan Aujla Diljit Hits", "Trending Punjabi Songs"),
        "Haryanvi": ("Top Haryanvi Hits 2026", "New Haryanvi Songs", "Trending Haryanvi DJ Songs"),
    }
    hero_q, shelf1_q, shelf2_q = queries.get(lang, queries["English"])

    async def quick_ytm(q: str, limit: int = 10):
        def _search():
            for _ in range(2):
                try:
                    return type(ytm)().search(q, filter="songs", limit=limit)
                except Exception:
                    continue
            return []
        res = await asyncio.to_thread(_search)
        out = []
        for item in (res or [])[:limit]:
            vid = item.get("videoId")
            if not vid:
                continue
            thumbs = item.get("thumbnails", [])
            out.append({
                "id": f"ytm_{vid}",
                "raw_id": vid,
                "source": "ytm",
                "title": item.get("title", "Unknown"),
                "artist": ", ".join(a["name"] for a in item.get("artists", [])) or "Unknown",
                "album": item.get("album", {}).get("name", "") if item.get("album") else "",
                "duration": item.get("duration_seconds", 0) or 0,
                "thumbnail": upscale_thumb(thumbs[-1]["url"] if thumbs else ""),
                "downloaded": get_local_file(f"ytm_{vid}") is not None,
            })
        return out

    hero_tracks, shelf1, shelf2 = await asyncio.gather(
        quick_ytm(hero_q, 8),
        quick_ytm(shelf1_q, 10),
        quick_ytm(shelf2_q, 10),
    )

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        recent = [dict(r) for r in conn.execute("SELECT * FROM history ORDER BY played_at DESC LIMIT 12").fetchall()]

    return {
        "lang": lang,
        "hero": {
            "title": f"{lang} Hits",
            "subtitle": f"KICK BACK TO THE BEST NEW AND TRENDING {lang.upper()} TRACKS",
            "tracks": hero_tracks,
        },
        "recent": recent,
        "shelves": [
            {"title": shelf1_q, "tracks": shelf1},
            {"title": shelf2_q, "tracks": shelf2},
        ],
    }


@app.post("/api/history")
def add_history(track: dict):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """INSERT OR REPLACE INTO history (id, source, title, artist, thumbnail, played_at)
               VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            (track["id"], track.get("source", "ytm"), track["title"], track["artist"], track.get("thumbnail", "")),
        )
        conn.execute(
            """INSERT INTO play_log (track_id, title, artist, thumbnail)
               VALUES (?, ?, ?, ?)""",
            (track["id"], track["title"], track["artist"], track.get("thumbnail", "")),
        )
    return {"status": "ok"}


@app.get("/api/favorites")
def get_favorites():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM favorites ORDER BY added_at DESC").fetchall()
    return {"favorites": [dict(r) for r in rows]}


@app.post("/api/favorites/toggle")
def toggle_favorite(track: dict):
    with sqlite3.connect(DB_PATH) as conn:
        exists = conn.execute("SELECT 1 FROM favorites WHERE id = ?", (track["id"],)).fetchone()
        if exists:
            conn.execute("DELETE FROM favorites WHERE id = ?", (track["id"],))
            return {"favorited": False}
        conn.execute(
            """INSERT INTO favorites (id, source, title, artist, thumbnail)
               VALUES (?, ?, ?, ?, ?)""",
            (track["id"], track.get("source", "ytm"), track["title"], track["artist"], track.get("thumbnail", "")),
        )
        return {"favorited": True}


@app.get("/api/playlists")
def list_playlists():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        pls = [dict(r) for r in conn.execute("SELECT * FROM playlists ORDER BY created_at DESC").fetchall()]
        for pl in pls:
            tracks = [dict(t) for t in conn.execute(
                "SELECT track_id as id, source, title, artist, thumbnail FROM playlist_tracks WHERE playlist_id = ? ORDER BY added_at DESC",
                (pl["id"],),
            ).fetchall()]
            pl["tracks"] = tracks
            pl["count"] = len(tracks)
    return {"playlists": pls}


@app.post("/api/playlists")
def create_playlist(payload: dict):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Playlist name required")
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute("INSERT INTO playlists (name) VALUES (?)", (name,))
        pid = cur.lastrowid
    return {"id": pid, "name": name}


@app.delete("/api/playlists/{pid}")
def delete_playlist(pid: int):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?", (pid,))
        conn.execute("DELETE FROM playlists WHERE id = ?", (pid,))
    return {"status": "deleted"}


@app.post("/api/playlists/{pid}/tracks")
def add_to_playlist(pid: int, track: dict):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_id, source, title, artist, thumbnail)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (pid, track["id"], track.get("source", "ytm"), track["title"], track["artist"], track.get("thumbnail", "")),
        )
    return {"status": "added"}


@app.delete("/api/playlists/{pid}/tracks/{track_id}")
def remove_from_playlist(pid: int, track_id: str):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?", (pid, track_id))
    return {"status": "removed"}


@app.get("/api/stats")
def get_stats():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        total_plays = conn.execute("SELECT COUNT(*) FROM play_log").fetchone()[0]
        unique_tracks = conn.execute("SELECT COUNT(DISTINCT track_id) FROM play_log").fetchone()[0]
        top_tracks = [dict(r) for r in conn.execute("""
            SELECT track_id as id, title, artist, thumbnail, COUNT(*) as plays
            FROM play_log GROUP BY track_id ORDER BY plays DESC LIMIT 10
        """).fetchall()]
        top_artists = [dict(r) for r in conn.execute("""
            SELECT artist, COUNT(*) as plays
            FROM play_log GROUP BY artist ORDER BY plays DESC LIMIT 8
        """).fetchall()]
    return {
        "total_plays": total_plays,
        "unique_tracks": unique_tracks,
        "top_tracks": top_tracks,
        "top_artists": top_artists,
    }


@app.get("/api/image-proxy")
async def image_proxy(url: str = Query(...)):
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            r.raise_for_status()
            return Response(
                content=r.content,
                media_type=r.headers.get("content-type", "image/jpeg"),
                headers={"Cache-Control": "public, max-age=86400"},
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/scan-local")
def scan_local_folder(payload: dict):
    from mutagen import File as MutagenFile

    raw_dir = (payload.get("path") or str(Path.home() / "Music")).strip()
    folder = Path(raw_dir).expanduser().resolve()
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=400, detail=f"Folder not found: {folder}")

    exts = {".mp3", ".m4a", ".flac", ".wav", ".ogg", ".opus"}
    added = 0

    with sqlite3.connect(DB_PATH) as conn:
        for file_path in folder.rglob("*"):
            if not file_path.is_file() or file_path.suffix.lower() not in exts:
                continue
            tid = "local_" + hashlib.md5(str(file_path).encode()).hexdigest()[:12]
            title = file_path.stem
            artist = "Local File"
            album = file_path.parent.name
            duration = 0

            try:
                audio_meta = MutagenFile(file_path, easy=True)
                if audio_meta:
                    if audio_meta.get("title"): title = str(audio_meta["title"][0])
                    if audio_meta.get("artist"): artist = str(audio_meta["artist"][0])
                    if audio_meta.get("album"): album = str(audio_meta["album"][0])
                    if getattr(audio_meta, "info", None):
                        duration = int(getattr(audio_meta.info, "length", 0) or 0)
            except Exception:
                pass

            conn.execute(
                """INSERT OR IGNORE INTO downloads
                   (id, source, title, artist, album, duration, thumbnail, filepath)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (tid, "local", title, artist, album, duration, "", str(file_path)),
            )
            added += 1

    return {"status": "ok", "scanned_folder": str(folder), "files_indexed": added}


if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
