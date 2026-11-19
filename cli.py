#!/usr/bin/env python3
import os, sys, subprocess, httpx

API = "http://127.0.0.1:8000"

def restore_tty():
    os.system("stty sane 2>/dev/null")

def play_track(t):
    print(f"\n▶ Playing: {t['title']} — {t['artist']}  (press 'q' or Ctrl+C to stop)")
    try:
        subprocess.run(
            ["ffplay", "-nodisp", "-autoexit", "-nostats", "-loglevel", "error", f"{API}/api/stream/{t['id']}"]
        )
    except KeyboardInterrupt:
        print("\n⏹ Stopped.")
    finally:
        restore_tty()

def download_track(t):
    print(f"\n⬇ Downloading: {t['title']} — {t['artist']}...")
    try:
        r = httpx.post(
            f"{API}/api/download/{t['id']}",
            params={
                "title": t["title"],
                "artist": t["artist"],
                "album": t.get("album", ""),
                "duration": t.get("duration", 0),
                "thumbnail": t.get("thumbnail", ""),
            },
            timeout=120,
        )
        if r.is_success:
            print(f"✔ Saved: {r.json().get('filepath')}")
        else:
            print(f"✖ Error {r.status_code}: {r.text}")
    except Exception as e:
        print(f"✖ Download failed: {e}")

def do_search(query):
    try:
        r = httpx.get(f"{API}/api/search", params={"q": query, "source": "ytm", "limit": 10}, timeout=20).json()
        results = r.get("results", [])
        if not results:
            print("No results found.")
            return []
        for i, t in enumerate(results, 1):
            mark = " [OFFLINE]" if t.get("downloaded") else ""
            print(f" {i:2}. {t['title']} — {t['artist']}{mark}")
        print("\nType a number (e.g. 1) to play, 'd 1' to download, or another song name to search.")
        return results
    except Exception as e:
        print(f"Search failed: {e}")
        return []

def interactive(initial_query=None):
    print("Velvet CLI — type a song name to search, 'offline' for downloads, or 'q' to quit.")
    last_results = do_search(initial_query) if initial_query else []

    while True:
        try:
            inp = input("\nvelvet> ").strip()
        except KeyboardInterrupt:
            print()
            continue
        except EOFError:
            print("\nBye!")
            break

        if not inp:
            continue
        if inp.lower() in ("q", "quit", "exit"):
            break

        if inp.isdigit() and last_results:
            idx = int(inp) - 1
            if 0 <= idx < len(last_results):
                play_track(last_results[idx])
            else:
                print("Invalid number.")
            continue

        if inp.lower().startswith("d ") and inp[2:].strip().isdigit() and last_results:
            idx = int(inp[2:].strip()) - 1
            if 0 <= idx < len(last_results):
                download_track(last_results[idx])
            else:
                print("Invalid number.")
            continue

        if inp.lower() == "offline":
            try:
                r = httpx.get(f"{API}/api/downloads", timeout=10).json()
                last_results = r.get("downloads", [])
                if not last_results:
                    print("No offline tracks yet.")
                for i, t in enumerate(last_results, 1):
                    print(f" {i:2}. {t['title']} — {t['artist']} [OFFLINE]")
                print("\nType a number (e.g. 1) to play.")
            except Exception as e:
                print(f"Failed to load offline list: {e}")
            continue

        last_results = do_search(inp)

if __name__ == "__main__":
    if len(sys.argv) >= 2:
        q = " ".join(sys.argv[2:] if sys.argv[1] == "search" else sys.argv[1:])
        interactive(q)
    else:
        interactive()
