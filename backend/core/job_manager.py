"""
Asynchronous Job Manager for Background Video Extraction & Real-Time Progress Tracking
"""
import uuid
import time
import asyncio
from typing import Dict, Optional, Callable
from backend.models import JobStatusResponse

class Job:
    def __init__(self, job_id: str, job_type: str = "single"):
        self.job_id = job_id
        self.job_type = job_type
        self.status = "queued"  # queued, processing, completed, failed
        self.progress = 0
        self.stage_message = "Job queued..."
        self.download_url: Optional[str] = None
        self.zip_url: Optional[str] = None
        self.filename: Optional[str] = None
        self.file_size: Optional[int] = None
        self.duration: Optional[float] = None
        self.error: Optional[str] = None
        self.created_at = time.time()
        self.completed_at: Optional[float] = None
        # Queue for SSE subscribers
        self.subscribers: list[asyncio.Queue] = []

    def update(self, progress: int, stage_message: str):
        self.progress = max(0, min(100, progress))
        self.stage_message = stage_message
        self._notify_subscribers()

    def complete(self, download_url: Optional[str] = None, zip_url: Optional[str] = None, filename: Optional[str] = None, file_size: Optional[int] = None, duration: Optional[float] = None):
        self.status = "completed"
        self.progress = 100
        self.stage_message = "Complete!"
        self.download_url = download_url
        self.zip_url = zip_url
        self.filename = filename
        self.file_size = file_size
        self.duration = duration
        self.completed_at = time.time()
        self._notify_subscribers()

    def fail(self, error_message: str):
        self.status = "failed"
        self.stage_message = "Failed"
        self.error = error_message
        self.completed_at = time.time()
        self._notify_subscribers()

    def to_response(self) -> JobStatusResponse:
        return JobStatusResponse(
            job_id=self.job_id,
            status=self.status,
            progress=self.progress,
            stage_message=self.stage_message,
            download_url=self.download_url,
            zip_url=self.zip_url,
            filename=self.filename,
            file_size=self.file_size,
            duration=self.duration,
            error=self.error
        )

    def _notify_subscribers(self):
        msg = self.to_response().model_dump_json()
        for q in list(self.subscribers):
            try:
                q.put_nowait(msg)
            except Exception:
                pass

class JobManager:
    def __init__(self):
        self._jobs: Dict[str, Job] = {}

    def create_job(self, job_type: str = "single") -> Job:
        job_id = str(uuid.uuid4())[:8]
        job = Job(job_id, job_type)
        self._jobs[job_id] = job
        return job

    def get_job(self, job_id: str) -> Optional[Job]:
        return self._jobs.get(job_id)

    async def subscribe(self, job_id: str):
        job = self.get_job(job_id)
        if not job:
            return
        q: asyncio.Queue = asyncio.Queue()
        job.subscribers.append(q)
        try:
            # Yield current state immediately
            yield f"data: {job.to_response().model_dump_json()}\n\n"
            while True:
                msg = await q.get()
                yield f"data: {msg}\n\n"
                if job.status in ("completed", "failed"):
                    break
        finally:
            if q in job.subscribers:
                job.subscribers.remove(q)

job_manager = JobManager()
