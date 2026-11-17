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

# Mount frontend static directories
app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")

@app.get("/")
async def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")
