"""
Automated Test for Custom Video Quality Selection (720p, 480p, Highest)
"""
import time
import subprocess
import httpx
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"
TEST_URL = "https://www.youtube.com/watch?v=MMyh5bX84Js"

def test_quality_exports():
    print("\n--- Testing Custom Resolution Export (720p & 480p) ---")
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        # 1. Test 720p Export
        print("Submitting 720p export job...")
        payload_720 = {
            "url": TEST_URL,
            "video_id": "MMyh5bX84Js",
            "clip": {"id": "q720", "name": "Clip_720p", "start_time": 3600.0, "end_time": 3604.0},
            "mode": "fast",
            "quality": "720"
        }
        res = client.post("/api/export-clip", json=payload_720)
        assert res.status_code == 200
        job_id_720 = res.json()["job_id"]

        done = False
        for _ in range(25):
            time.sleep(1.0)
            res = client.get(f"/api/jobs/{job_id_720}")
            st = res.json()
            if st["status"] == "completed":
                done = True
                dl_url = st["download_url"]
                print("720p Export completed:", dl_url)
                # Verify with ffprobe
                filename = st["filename"]
                filepath = Path("exports") / filename
                probe = subprocess.run(
                    ['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height', '-of', 'default=noprint_wrappers=1', str(filepath)],
                    capture_output=True, text=True
                )
                print("720p Probe Output:\n", probe.stdout.strip())
                assert "height=720" in probe.stdout
                assert "width=1280" in probe.stdout
                print("PASS: Verified 720p video resolution matches exactly (1280x720)!")
                break
            elif st["status"] == "failed":
                raise RuntimeError(f"720p export failed: {st['error']}")
        assert done, "720p job timed out"

        # 2. Test 480p Export
        print("\nSubmitting 480p export job...")
        payload_480 = {
            "url": TEST_URL,
            "video_id": "MMyh5bX84Js",
            "clip": {"id": "q480", "name": "Clip_480p", "start_time": 3600.0, "end_time": 3604.0},
            "mode": "fast",
            "quality": "480"
        }
        res = client.post("/api/export-clip", json=payload_480)
        assert res.status_code == 200
        job_id_480 = res.json()["job_id"]

        done = False
        for _ in range(25):
            time.sleep(1.0)
            res = client.get(f"/api/jobs/{job_id_480}")
            st = res.json()
            if st["status"] == "completed":
                done = True
                filename = st["filename"]
                filepath = Path("exports") / filename
                probe = subprocess.run(
                    ['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height', '-of', 'default=noprint_wrappers=1', str(filepath)],
                    capture_output=True, text=True
                )
                print("480p Probe Output:\n", probe.stdout.strip())
                assert "height=480" in probe.stdout
                assert "width=854" in probe.stdout
                print("PASS: Verified 480p video resolution matches exactly (854x480)!")
                break
            elif st["status"] == "failed":
                raise RuntimeError(f"480p export failed: {st['error']}")
        assert done, "480p job timed out"

        print("\n=======================================================")
        print("ALL QUALITY SELECTION TESTS PASSED (100%)!")
        print("=======================================================")

if __name__ == "__main__":
    test_quality_exports()
