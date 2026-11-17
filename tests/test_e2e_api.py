"""
End-to-End API Integration Test against Live Server on Port 8000
Tests single clip export AND multi-clip batch ZIP export.
"""
import time
import httpx

BASE_URL = "http://127.0.0.1:8000"
TEST_URL = "https://www.youtube.com/watch?v=MMyh5bX84Js"

def test_live_server():
    print("\n--- 1. Testing Health & Static File Endpoints ---")
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        # Health check
        res = client.get("/health")
        assert res.status_code == 200 and res.json().get("status") == "ok"
        print("Health OK!")

        # Static index.html
        res = client.get("/")
        assert res.status_code == 200 and "StreamCutter" in res.text
        print("Static Files OK!")

        # Video info
        print("\n--- 2. Testing Video Info Endpoint ---")
        t0 = time.time()
        res = client.post("/api/video-info", json={"url": TEST_URL})
        assert res.status_code == 200
        data = res.json()
        print(f"Video: {data['title'][:40]} ({data['duration_formatted']})")

        # Single Clip Export
        print("\n--- 3. Testing Single Clip Export ---")
        single_payload = {
            "url": TEST_URL,
            "video_id": "MMyh5bX84Js",
            "clip": {
                "id": "single_clip",
                "name": "BGMI_Single",
                "start_time": 7200.0,
                "end_time": 7206.0
            },
            "mode": "fast"
        }
        res = client.post("/api/export-clip", json=single_payload)
        assert res.status_code == 200
        job_id = res.json()["job_id"]
        for _ in range(25):
            time.sleep(1.0)
            res = client.get(f"/api/jobs/{job_id}")
            st = res.json()
            if st["status"] == "completed":
                print(f"Single Clip Export Success! Size: {st['file_size']} bytes")
                break
            elif st["status"] == "failed":
                raise RuntimeError(f"Single export failed: {st['error']}")

        # Batch Export
        print("\n--- 4. Testing Multi-Clip Batch ZIP Export ---")
        batch_payload = {
            "url": TEST_URL,
            "video_id": "MMyh5bX84Js",
            "title": "BGMI_Batch_Highlights",
            "clips": [
                {"id": "b1", "name": "Drop_1", "start_time": 3600.0, "end_time": 3604.0},
                {"id": "b2", "name": "Drop_2", "start_time": 7200.0, "end_time": 7204.0}
            ],
            "mode": "fast"
        }
        res = client.post("/api/export-batch", json=batch_payload)
        assert res.status_code == 200
        batch_job_id = res.json()["job_id"]
        print(f"Batch Job ID: {batch_job_id}")

        batch_done = False
        for _ in range(35):
            time.sleep(1.0)
            res = client.get(f"/api/jobs/{batch_job_id}")
            st = res.json()
            print(f"Batch Progress: {st['progress']}% - {st['stage_message']}")
            if st["status"] == "completed":
                batch_done = True
                print("Batch finished! ZIP URL:", st["zip_url"])
                zip_res = client.get(st["zip_url"])
                print(f"ZIP Download Status: {zip_res.status_code}, size: {len(zip_res.content)} bytes")
                assert zip_res.status_code == 200
                assert len(zip_res.content) > 500_000
                break
            elif st["status"] == "failed":
                raise RuntimeError(f"Batch export failed: {st['error']}")

        assert batch_done, "Batch job timed out"

        print("\n=======================================================")
        print("ALL TESTS (SINGLE EXPORT + BATCH ZIP EXPORT) PASSED 100%!")
        print("=======================================================")

if __name__ == "__main__":
    test_live_server()
