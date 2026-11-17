"""
Video Metadata & Ingestion API Routes
"""
import shutil
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from backend.models import VideoInfoRequest, VideoInfoResponse, VideoFormatInfo
from backend.core.extractor import extractor, format_seconds
from backend.config import TEMP_DIR

router = APIRouter(prefix="/api", tags=["video"])

@router.post("/video-info", response_model=VideoInfoResponse)
async def get_video_info(req: VideoInfoRequest):
    """
    Fetch metadata, duration, and format options for any YouTube URL.
    Returns in < 0.01s on repeated calls via in-memory caching.
    """
    try:
        url = req.url.strip()
        if not url:
            raise HTTPException(status_code=400, detail="Please enter a valid YouTube video or livestream URL.")

        info_resp, _ = extractor.get_video_info(url)
        return info_resp
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load video metadata: {str(e)}")

@router.post("/upload-video", response_model=VideoInfoResponse)
async def upload_local_video(file: UploadFile = File(...)):
    """
    Accept user-provided video files (MP4, MKV, WebM) for local authorized processing.
    """
    try:
        clean_filename = f"upload_{file.filename}"
        dest_path = TEMP_DIR / clean_filename
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Inspect with ffprobe
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration:stream=width,height,r_frame_rate,vcodec',
            '-of', 'default=noprint_wrappers=1',
            str(dest_path)
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        duration = 0.0
        width = 1920
        height = 1080

        for line in res.stdout.splitlines():
            if line.startswith("duration="):
                try:
                    duration = float(line.split("=")[1])
                except Exception:
                    pass
            elif line.startswith("width="):
                width = int(line.split("=")[1])
            elif line.startswith("height="):
                height = int(line.split("=")[1])

        return VideoInfoResponse(
            video_id=f"local_{dest_path.stem}",
            title=file.filename or "Local Video",
            duration=duration,
            duration_formatted=format_seconds(duration),
            thumbnail=None,
            channel="Local File",
            is_live=False,
            is_completed_live=False,
            formats=[VideoFormatInfo(
                format_id="local_orig",
                resolution=f"{width}x{height}",
                fps=30,
                vcodec="h264",
                acodec="aac",
                ext="mp4"
            )]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process uploaded video: {str(e)}")
