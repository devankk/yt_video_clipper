"""
Application Configuration for YouTube Live Stream Video Cutter
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"
EXPORTS_DIR = BASE_DIR / "exports"
TEMP_DIR = BASE_DIR / "temp"

# Ensure runtime directories exist
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Cache TTL for extracted YouTube metadata (seconds) - 2 hours
METADATA_CACHE_TTL = 7200

# Server settings
HOST = "127.0.0.1"
PORT = 8000
