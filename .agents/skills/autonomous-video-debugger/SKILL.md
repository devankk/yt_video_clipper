---
name: autonomous-video-debugger
description: >-
  Autonomous end-to-end bug fixing, investigation, and verification engine for YouTube Live Stream Video Cutter.
  Trigger this skill whenever the user reports any bug, regression, unexpected behavior,
  or performance issue. Independently reproduces bugs, inspects code, APIs, FFmpeg pipelines,
  and timeline states, runs automated tests, verifies against localhost (port 8000),
  and guarantees regression-free resolution without manual prompting.
metadata:
  icon: bug
  version: "1.0.0"
  project: YouTube Live Stream Video Cutter
  workspace: "d:/New folder (5)/yt video clipper"
  slash_command: "/autonomous-video-debugger"
---

# Autonomous Video Debugger & Verification Engine

When this skill is invoked with an issue report or test failure, **immediately begin autonomous investigation and repair**. Do not require the user to paste debugging guidelines again. Do not stop after the first attempted fix. Iterate continuously until all verification checks pass.

---

## 1. Permanent Project Constraints & Invariants

You must strictly obey these non-negotiable constraints across every debugging session:

1. **Adhere to Core Skill:** Always follow architectural rules in `.agents/skills/yt-video-cutter/SKILL.md`.
2. **Work Exclusively on Localhost:** All runtime verification must happen against `http://localhost:8000`.
3. **Strict Safety Rule:**
   - **NEVER RUN `git push`** without the user explicitly commanding `"push"` or `"push to github"`.
4. **Protect User Exports:**
   - Never delete existing exported clips unless specifically asked.
   - For reproduction tests, create dedicated temporary test folders (e.g. `tests/tmp_repro/`).
5. **Preserve Performance Targets:**
   - Slicing a 1–2 minute clip from a 4-hour livestream must take **under 15 seconds**.
   - Active memory consumption must remain $< 100\text{ MB}$.
6. **Windows Shell Invariant:**
   - Always wrap PowerShell / Windows commands in `cmd /c "..."`.
7. **Never Falsely Report Successful Tests:**
   - Every claim of success must be backed by real command exit codes (`code 0`), passing assertions, and verified log outputs.

---

## 2. Autonomous Execution Protocol

### Step 1: Reproduce the Issue
- Replicate the reported issue under controlled conditions.
- Write a minimal, deterministic reproduction script in `tests/` or test the exact API endpoint.
- Confirm the bug exists and note the exact failure mode (FFmpeg exit code, HTTP status, or UI state anomaly).

### Step 2: Root Cause Investigation
- Trace the data and execution path through:
  * **Extraction:** `backend/core/extractor.py` (yt-dlp format resolution, client emulation, cache).
  * **Video Processing:** `backend/core/video_processor.py` (FFmpeg arguments, `-ss` placement, stream copy vs transcode, stderr logs).
  * **Job Manager:** `backend/core/job_manager.py` (async task execution, SSE event streaming, error propagation).
  * **API Routes:** `backend/routes/video.py`, `backend/routes/clip.py`, `backend/routes/download.py`.
  * **Timeline & Player:** `frontend/js/timeline.js`, `frontend/js/player.js`.

> [!IMPORTANT]
> **Datacenter Anti-Bot (`Failed to extract any player response`) Diagnosis:**
> - If an export or metadata extraction fails on a cloud host (Render/AWS) with `ERROR: [youtube] ...: Failed to extract any player response`:
>   1. **Do NOT confuse frontend player success with backend extraction:** The YouTube IFrame player runs inside the user's browser (residential IP) and will play smoothly even when the cloud backend is blocked.
>   2. **Root cause:** YouTube strictly blocks anonymous video stream extraction from cloud datacenter ASN ranges.
>   3. **Resolution paths:**
>      - Supply YouTube Cookies via `cookies.txt` or `YOUTUBE_COOKIES` environment variable.
>      - Ensure `live_from_start: True` is enabled in `yt-dlp` options for completed livestreams.
>      - Surface clear, friendly guidance in the UI informing the user to provide cookies for cloud exports or use local mode (`python run.py`).

### Step 3: Implement the Fix
- Make surgical, production-grade code adjustments.
- Do not ask for user approval for ordinary, reversible local code edits.
- Only prompt the user if an action involves destructive data deletion or breaking architecture changes.

### Step 4: Run Automated Tests
```bash
cmd /c "python -m pytest tests/ -v"
```

### Step 5: Test Application on Localhost
- **Backend Import & Health:**
  ```bash
  cmd /c "python -c \"import sys; sys.path.insert(0, 'backend'); import app; print(app.app.title)\""
  ```
- Verify API endpoints respond with HTTP 200.

### Step 6: Autonomous Retry Loop
- If any test fails, if a build error occurs, or if the reproduction script still fails:
  * **DO NOT STOP.**
  * Re-read the failure output, isolate the new discrepancy, refine the implementation, and re-test.
  * Repeat this cycle until the verification criteria pass cleanly.
