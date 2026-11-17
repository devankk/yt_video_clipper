"""
Main FastAPI Application Entrypoint
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.config import FRONTEND_DIR
from backend.routes.video import router as video_router
from backend.routes.clip import router as clip_router
from backend.routes.download import router as download_router

app = FastAPI(
    title="YouTube Live Stream Video Cutter",
    description="High-performance, zero-download HTTP range clipper for multi-hour YouTube livestreams",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(video_router)
app.include_router(clip_router)
app.include_router(download_router)

@app.get("/health")
async def health_check():
    return {"status": "ok", "app": "YouTube Live Stream Video Cutter"}

@app.get("/api/debug-env")
async def debug_env():
    import shutil, sys, os
    deno_found = None
    try:
        import deno
        deno_found = deno.find_deno_bin()
    except Exception as e:
        deno_found = f"deno import error: {e}"

    import yt_dlp
    test_result = "not tested"
    try:
        opts = {
            'quiet': True,
            'skip_download': True,
            'live_from_start': True,
            'force_ipv4': True,
            'socket_timeout': 8,
            'extractor_args': {'youtube': {'player_client': ['web_embedded'], 'player_skip': ['webpage']}}
        }
        if deno_found and isinstance(deno_found, str) and os.path.exists(deno_found):
            try:
                os.chmod(deno_found, 0o755)
            except Exception:
                pass
            opts['js_runtimes'] = {'deno': {'path': str(deno_found)}}

        with yt_dlp.YoutubeDL(opts) as ydl:
            inf = ydl.extract_info("https://www.youtube.com/watch?v=IsBp4KlwRsU", download=False)
            test_result = f"SUCCESS: {inf.get('title')} ({len(inf.get('formats', []))} fmts)"
    except Exception as e:
        test_result = f"ERROR: {e}"

    return {
        "python": sys.version,
        "shutil_deno": shutil.which("deno"),
        "deno_found": str(deno_found),
        "yt_dlp_version": yt_dlp.version.__version__,
        "test_result": test_result
    }

# Mount frontend static directories
app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")

@app.get("/")
async def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")
