"""
Application Server Launcher
"""
import os
import sys
import uvicorn
from backend.config import HOST, PORT

try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
except ImportError:
    pass

if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", PORT))
    print(f"Starting YouTube Live Stream Video Cutter on http://{host}:{port}")
    uvicorn.run("backend.app:app", host=host, port=port, reload=False)
