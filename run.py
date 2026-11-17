"""
Application Server Launcher
"""
import sys
import uvicorn
from backend.config import HOST, PORT

if __name__ == "__main__":
    print(f"Starting YouTube Live Stream Video Cutter on http://{HOST}:{PORT}")
    uvicorn.run("backend.app:app", host=HOST, port=PORT, reload=True)
