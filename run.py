"""
Application Server Launcher
"""
import os
import sys
import uvicorn
from backend.config import PORT

if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", PORT or 8000))
    print(f"Starting server on http://{host}:{port}", flush=True)
    uvicorn.run("backend.app:app", host=host, port=port, reload=False)
