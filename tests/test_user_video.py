import time
import subprocess
import httpx
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"
USER_URL = "https://www.youtube.com/live/IsBp4KlwRsU"

def test_user_video_export():
    print(f"\n--- Testing User Video: {USER_URL} ---")
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        # 1. Fetch info
        res = client.get("/api/video-info", params={"url": USER_URL})
        assert res.status_code == 200, f"Failed info: {res.text}"
        info = res.json()
        print(f"Title: {info['title']}")
        print(f"Duration: {info['duration_formatted']} ({info['duration']}s)")
        print(f"Top format: {info['formats'][0]['resolution']} ({info['formats'][0]['fps']}fps)")
        assert info['formats'][0]['resolution'] == "1080p"

        # 2. Export 10s clip at 01:11:46 (4306s - 4316s) in 1080p
        print("\nRequesting 1080p clip export at 01:11:46 (4306s to 4316s)...")
        payload = {
            "url": USER_URL,
            "video_id": info["video_id"],
            "clip": {
                "id": "user_clip_1080",
                "name": "PUBG_PC_Gameplay_1080p",
                "start_time": 4306.0,
                "end_time": 4316.0
            },
            "mode": "smart",
            "quality": "1080"
        }
        res = client.post("/api/export-clip", json=payload)
        assert res.status_code == 200
        job_id = res.json()["job_id"]

        done = False
        for _ in range(30):
            time.sleep(1.0)
            res = client.get(f"/api/jobs/{job_id}")
            st = res.json()
            print(f"  Progress: {st['progress']}% - {st['stage_message']}")
            if st["status"] == "completed":
                done = True
                dl_url = st["download_url"]
                filepath = Path("exports") / st["filename"]
                print(f"\nExport complete! File: {filepath} ({filepath.stat().st_size:,} bytes)")
                
                probe = subprocess.run(
                    [
                        'ffprobe', '-v', 'error',
                        '-show_entries', 'stream=codec_name,width,height,r_frame_rate,bit_rate',
                        '-show_entries', 'format=duration,bit_rate',
                        '-of', 'json', str(filepath)
                    ],
                    capture_output=True, text=True
                )
                print("FFprobe JSON:\n", probe.stdout)
                import json
                data = json.loads(probe.stdout)
                v = next(s for s in data['streams'] if s.get('width'))
                a = next(s for s in data['streams'] if s.get('codec_name') == 'aac')
                
                assert v['width'] == 1920
                assert v['height'] == 1080
                assert v['r_frame_rate'] == "60/1"
                assert int(v['bit_rate']) > 4000000
                print("PASS: Verified 1080p60 high-bitrate video stream!")
                break
            elif st["status"] == "failed":
                raise RuntimeError(f"Export failed: {st['error']}")
        assert done, "Export timed out"

if __name__ == "__main__":
    test_user_video_export()
