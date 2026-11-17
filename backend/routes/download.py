"""
File Download API Routes with Content-Disposition Attachment Headers
"""
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.config import EXPORTS_DIR

router = APIRouter(prefix="/api", tags=["download"])

@router.get("/download/{filename}")
async def download_clip(filename: str):
    """
    Download an extracted MP4 clip.
    """
    safe_filename = Path(filename).name
    file_path = EXPORTS_DIR / safe_filename

    # Also search subdirectories of EXPORTS_DIR
    if not file_path.exists():
        matches = list(EXPORTS_DIR.glob(f"**/{safe_filename}"))
        if matches:
            file_path = matches[0]

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Requested file was not found or has expired.")

    return FileResponse(
        path=str(file_path),
        filename=safe_filename,
        media_type="video/mp4",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'}
    )

@router.get("/download-zip/{filename}")
async def download_zip(filename: str):
    """
    Download a compiled batch ZIP archive.
    """
    safe_filename = Path(filename).name
    file_path = EXPORTS_DIR / safe_filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Requested ZIP package was not found or has expired.")

    return FileResponse(
        path=str(file_path),
        filename=safe_filename,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'}
    )
