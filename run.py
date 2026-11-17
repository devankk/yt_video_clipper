"""
Application Server Launcher
"""
import os
import sys
import traceback

# Optional self-contained FFmpeg setup for headless environments
try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
except Exception as e:
    print(f"Notice: static_ffmpeg setup: {e}")

if __name__ == "__main__":
    try:
        import uvicorn
        from backend.config import PORT
        host = os.environ.get("HOST", "0.0.0.0")
        port = int(os.environ.get("PORT", PORT or 8000))
        print(f"Starting server on http://{host}:{port}")
        uvicorn.run("backend.app:app", host=host, port=port, reload=False)
    except Exception as e:
        traceback.print_exc()
        sys.exit(1)
