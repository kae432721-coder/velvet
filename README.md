# Velvet

A self-hosted, local-first music streaming, downloading, and library web app with a pitch-black UI, dual-engine audio backend, Web Audio studio, and terminal CLI (`vcli`).

## Features
- **Dual Audio Engine:** Fast 320kbps streaming via JioSaavn with YouTube Music (`ytmusicapi` + `yt-dlp`) fallback.
- **Offline Downloads & Local Scanner:** Save tracks locally as `.m4a` with embedded metadata/thumbnails, or index existing `.mp3`/`.m4a`/`.flac` folders.
- **Dual Fullscreen Modes:** Synchronized `.lrc` lyrics (with Devanagari support) and Focus Mode with a real-time Web Audio frequency visualizer.
- **OKLCH Gradient Studio:** 10 dark-mode presets, custom gradient builder, and real-time dominant album-art color extraction.
- **Audio Studio:** 5-band equalizer with presets, Slowed + Reverb toggle, adjustable crossfade (0–6s), and Sleep Timer.
- **Library & Queue:** Custom SQLite playlists, Play Next / Queue reordering, Liked Songs, and local Listening Stats.
- **Terminal Client (`vcli`):** Search, stream via `ffplay`, and download tracks directly from the command line.

## Prerequisites
- Python 3.10+
- `ffmpeg`

## Quick Start

### Linux / macOS
```bash
git clone https://github.com/kae432721-coder/velvet.git
cd velvet
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
./start.sh
```
Open `http://127.0.0.1:8000` in your browser.

### Windows (PowerShell)
```powershell
winget install Gyan.FFmpeg
git clone https://github.com/kae432721-coder/velvet.git
cd velvet
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```
Double-click `Start-Velvet.bat` to launch the server silently and open Velvet in a standalone Edge app window.

## Terminal CLI (`vcli`)
```bash
source venv/bin/activate
python cli.py
```

## Keyboard Shortcuts
- `Space` — Play / Pause
- `Ctrl + K` — Quick Search Modal
- `Left / Right` — Seek -5s / +5s
- `M` — Mute / Unmute
