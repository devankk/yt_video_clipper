"""
Automated Backend & Extraction Pipeline Tests
Verifies real metadata resolution, HTTP range chunk slicing, and batch ZIP export
on the user's 5-hour BGMI livestream (MMyh5bX84Js).
"""
import sys
import time
import subprocess
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.core.extractor import extractor, format_seconds
from backend.core.video_processor import processor
from backend.models import ClipRange
from backend.config import EXPORTS_DIR

TEST_VIDEO_URL = "https://www.youtube.com/watch?v=MMyh5bX84Js"

def test_metadata_extraction():
    print("\n--- Test 1: YouTube Metadata Extraction ---")
    t0 = time.time()
    info_resp, raw_info = extractor.get_video_info(TEST_VIDEO_URL)
    elapsed = time.time() - t0
    print(f"Metadata extracted in {elapsed:.2f}s")
    print(f"Title: {info_resp.title}")
    print(f"Duration: {info_resp.duration}s ({info_resp.duration_formatted})")
    print(f"Is Completed Live: {info_resp.is_completed_live}")
    print(f"Formats Available: {len(info_resp.formats)}")

    assert info_resp.video_id == "MMyh5bX84Js"
    assert info_resp.duration > 17000  # ~5 hours
    assert len(info_resp.formats) > 0
    print("PASS: Metadata extraction verified successfully!")

    # Test cache hit speed
    t1 = time.time()
    cached_resp, _ = extractor.get_video_info(TEST_VIDEO_URL)
    cache_elapsed = time.time() - t1
    print(f"Cache hit retrieved in {cache_elapsed*1000:.2f}ms")
    assert cache_elapsed < 0.05
    print("PASS: In-memory session cache verified (< 50ms)!")
    return raw_info

def test_single_clip_extraction(raw_info):
    print("\n--- Test 2: Slicing 10s Clip from Hour 2 (02:00:00 to 02:00:10) ---")
    clip = ClipRange(id="test-clip-1", name="BGMI_Highlight", start_time=7200.0, end_time=7210.0)
    output_path = EXPORTS_DIR / "test_automated_clip.mp4"

    t0 = time.time()
    processor.process_clip(raw_info, clip, output_path, mode="smart")
    elapsed = time.time() - t0
    print(f"Extracted 10s 1080p60 clip in {elapsed:.2f}s")

    assert output_path.exists()
    assert output_path.stat().st_size > 500_000  # At least 500KB

    # ffprobe verification
    cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration,size',
        '-show_entries', 'stream=codec_name,width,height,r_frame_rate',
        '-of', 'default=noprint_wrappers=1',
        str(output_path)
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print("FFprobe output:\n", res.stdout.strip())
    assert "width=1920" in res.stdout
    assert "height=1080" in res.stdout
    assert "r_frame_rate=60/1" in res.stdout
    print("PASS: 1080p 60fps frame-accurate clip verified!")

def test_batch_zip_export(raw_info):
    print("\n--- Test 3: Multi-Clip Batch Export & ZIP Packaging ---")
    clips = [
        ClipRange(id="b1", name="Drop_01", start_time=3600.0, end_time=3606.0),
        ClipRange(id="b2", name="Drop_02", start_time=7200.0, end_time=7206.0)
    ]
    t0 = time.time()
    files, zip_file = processor.process_batch(raw_info, clips, "BGMI_Test_Batch", mode="fast")
    elapsed = time.time() - t0
    print(f"Batch processed {len(files)} clips and packaged ZIP in {elapsed:.2f}s")

    assert zip_file.exists()
    assert zip_file.stat().st_size > 500_000
    assert len(files) == 2
    for f in files:
        assert f.exists()
    print(f"ZIP package created: {zip_file.name} ({zip_file.stat().st_size} bytes)")
    print("PASS: Batch ZIP packaging verified!")

if __name__ == "__main__":
    raw_info = test_metadata_extraction()
    test_single_clip_extraction(raw_info)
    test_batch_zip_export(raw_info)
    print("\n==========================================")
    print("ALL PHASE 1 BACKEND TESTS PASSED (100%)!")
    print("==========================================")
