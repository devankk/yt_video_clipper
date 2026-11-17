"""
Clip Export & Background Processing API Routes
"""
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from backend.models import ExportClipRequest, ExportBatchRequest, JobStatusResponse
from backend.core.extractor import extractor, extract_video_id
from backend.core.video_processor import processor, sanitize_filename
from backend.core.job_manager import job_manager
from backend.config import EXPORTS_DIR

router = APIRouter(prefix="/api", tags=["clips"])

def run_clip_export(job_id: str, raw_info: dict, clip, mode: str, quality: str = "highest"):
    job = job_manager.get_job(job_id)
    if not job:
        return
    try:
        job.status = "processing"
        clean_title = sanitize_filename(raw_info.get("title", "Clip"))
        filename = f"{clean_title}_{int(clip.start_time)}s_to_{int(clip.end_time)}s_{quality}.mp4"
        out_file = EXPORTS_DIR / filename

        def progress_cb(pct: int, msg: str):
            job.update(pct, msg)

        processor.process_clip(raw_info, clip, out_file, mode=mode, quality=quality, progress_callback=progress_cb)

        file_size = out_file.stat().st_size if out_file.exists() else 0
        duration = clip.end_time - clip.start_time

        job.complete(
            download_url=f"/api/download/{filename}",
            filename=filename,
            file_size=file_size,
            duration=duration
        )
    except Exception as e:
        job.fail(str(e))

def run_batch_export(job_id: str, raw_info: dict, clips: list, base_title: str, mode: str, quality: str = "highest"):
    job = job_manager.get_job(job_id)
    if not job:
        return
    try:
        job.status = "processing"

        def batch_progress_cb(pct: int, msg: str, curr: int, total: int):
            job.update(pct, msg)

        exported_files, zip_path = processor.process_batch(
            raw_info, clips, base_title, mode=mode, quality=quality, progress_callback=batch_progress_cb
        )

        zip_size = zip_path.stat().st_size if zip_path.exists() else 0
        job.complete(
            download_url=f"/api/download-zip/{zip_path.name}",
            zip_url=f"/api/download-zip/{zip_path.name}",
            filename=zip_path.name,
            file_size=zip_size
        )
    except Exception as e:
        job.fail(str(e))

@router.post("/export-clip", response_model=JobStatusResponse)
async def export_single_clip(req: ExportClipRequest, background_tasks: BackgroundTasks):
    """
    Enqueue an asynchronous export for a single clip range.
    """
    if req.clip.end_time <= req.clip.start_time:
        raise HTTPException(status_code=400, detail="End time must be greater than start time.")

    # Retrieve or fetch video info
    raw_info = extractor.get_raw_cached_info(req.video_id or req.url)
    if not raw_info:
        _, raw_info = extractor.get_video_info(req.url)

    job = job_manager.create_job(job_type="single")
    background_tasks.add_task(run_clip_export, job.job_id, raw_info, req.clip, req.mode, req.quality)
    return job.to_response()

@router.post("/export-batch", response_model=JobStatusResponse)
async def export_batch_clips(req: ExportBatchRequest, background_tasks: BackgroundTasks):
    """
    Enqueue batch processing for multiple clips and package them into a ZIP archive.
    """
    if not req.clips:
        raise HTTPException(status_code=400, detail="Please select at least one clip range to export.")

    for c in req.clips:
        if c.end_time <= c.start_time:
            raise HTTPException(status_code=400, detail=f"Clip '{c.name}' has invalid timestamps: End time must be greater than start time.")

    raw_info = extractor.get_raw_cached_info(req.video_id or req.url)
    if not raw_info:
        _, raw_info = extractor.get_video_info(req.url)

    title = req.title or raw_info.get("title", "Livestream_Clips")
    job = job_manager.create_job(job_type="batch")
    background_tasks.add_task(run_batch_export, job.job_id, raw_info, req.clips, title, req.mode, req.quality)
    return job.to_response()

@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """
    Poll the current status of an export job.
    """
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job.to_response()

@router.get("/jobs/{job_id}/stream")
async def stream_job_status(job_id: str):
    """
    Server-Sent Events (SSE) stream for zero-latency, real-time export progress updates.
    """
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    return StreamingResponse(
        job_manager.subscribe(job_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
