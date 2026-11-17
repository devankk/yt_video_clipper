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
def debug_env(client: str = "web_embedded", skip_webpage: bool = True, timeout: int = 25):
    import shutil, sys, os
    import yt_dlp
    deno_found = None
    try:
        import deno
        deno_found = deno.find_deno_bin()
    except Exception as e:
        deno_found = f"deno import error: {e}"

    result = "not tested"
    try:
        opts = {
            'quiet': True,
            'skip_download': True,
            'live_from_start': True,
            'force_ipv4': True,
            'socket_timeout': timeout,
            'extractor_args': {'youtube': {'player_client': [client]}}
        }
        if skip_webpage:
            opts['extractor_args']['youtube']['player_skip'] = ['webpage']
        if deno_found and os.path.exists(deno_found):
            opts['js_runtimes'] = {'deno': {'path': str(deno_found)}}

        with yt_dlp.YoutubeDL(opts) as ydl:
            inf = ydl.extract_info("https://www.youtube.com/watch?v=IsBp4KlwRsU", download=False)
            fmts = len(inf.get('formats', []))
            result = f"SUCCESS: {inf.get('title')[:30]} ({fmts} fmts)"
    except Exception as e:
        result = str(e).splitlines()[0]

    return {
        "client": client,
        "skip_webpage": skip_webpage,
        "timeout": timeout,
        "shutil_deno": shutil.which("deno"),
        "deno_found": str(deno_found),
        "result": result
    }

# Mount frontend static directories
app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")

@app.get("/")
async def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")
