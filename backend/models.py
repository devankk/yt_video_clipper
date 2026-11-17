"""
Pydantic Models and Data Schemas
"""
from typing import Optional, List
from pydantic import BaseModel, Field

class VideoInfoRequest(BaseModel):
    url: str

class VideoFormatInfo(BaseModel):
    format_id: str
    resolution: Optional[str] = None
    fps: Optional[int] = None
    vcodec: Optional[str] = None
    acodec: Optional[str] = None
    ext: str

class VideoInfoResponse(BaseModel):
    video_id: str
    title: str
    duration: float
    duration_formatted: str
    thumbnail: Optional[str] = None
    channel: Optional[str] = None
    is_live: bool = False
    is_completed_live: bool = False
    formats: List[VideoFormatInfo] = []

class ClipRange(BaseModel):
    id: str
    name: str = "Clip"
    start_time: float = Field(..., ge=0)
    end_time: float = Field(..., gt=0)
    duration: Optional[float] = None

class ExportClipRequest(BaseModel):
    url: str
    video_id: Optional[str] = None
    clip: ClipRange
    mode: str = "fast"  # 'fast' (stream copy) or 'smart' (frame-accurate high quality)
    quality: str = "highest"  # 'highest', '1440', '1080', '720', '480', '360', '240', '144'

class ExportBatchRequest(BaseModel):
    url: str
    video_id: Optional[str] = None
    title: Optional[str] = None
    clips: List[ClipRange]
    mode: str = "fast"
    quality: str = "highest"

class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # 'queued', 'processing', 'completed', 'failed'
    progress: int = 0  # 0 to 100
    stage_message: str = "Initializing..."
    download_url: Optional[str] = None
    zip_url: Optional[str] = None
    filename: Optional[str] = None
    file_size: Optional[int] = None
    duration: Optional[float] = None
    error: Optional[str] = None
