# YouTube Live Stream Video Cutter

A high-performance web application designed to extract 1–2 minute clips from completed multi-hour YouTube livestreams and standard videos without downloading the full video files.

Built with **FastAPI**, **yt-dlp**, and **FFmpeg**, the application utilizes direct HTTP range seeks and parallel DASH segment fetching to clip video fragments in seconds.

---

## Key Features

- **Zero-Download HTTP Range Streaming:** Extracts clips in 2–5 seconds from 5+ hour livestreams without downloading gigabytes of video.
- **Embedded Player Preview:** Synchronized playback preview with live timestamp boundary enforcement via the YouTube IFrame API.
- **Interactive Multi-Clip Timeline:** Zoomable canvas timeline with draggable start/end handles, time ruler, and active region highlighting.
- **Multi-Clip Batch Management:** Queue multiple clip ranges, edit clip names inline, and export all clips packaged together in a single ZIP archive.
- **Quality & Format Selection:** Choose from all available stream resolutions up to 1080p60 / 1440p / 4K.
- **Dual Processing Modes:**
  - *Smart Frame-Accurate (CRF 18):* Re-encodes boundary frames for frame-accurate cuts with audio/video synchronization.
  - *Ultra-Fast Stream Copy:* Zero re-encoding for near-instant cuts on keyframe boundaries.

---

## Tech Stack

- **Backend:** Python 3.10+, FastAPI, Uvicorn, yt-dlp, FFmpeg
- **Frontend:** Vanilla JavaScript (ES6+), HTML5 Canvas, Dark/Orange DAW design system

---

## Prerequisites

- [Python 3.10+](https://www.python.org/)
- [FFmpeg](https://ffmpeg.org/) installed and available in your system `PATH`

---

## Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/devankk/yt_video_clipper.git
   cd yt_video_clipper
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Start the application:**
   ```bash
   python run.py
   ```

4. **Open in your browser:**
   ```
   http://127.0.0.1:8000
   ```

---

## Automated Tests

Run the test suite:
```bash
python tests/test_backend.py
python tests/test_e2e_api.py
python tests/test_quality_options.py
```
