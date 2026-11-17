FROM python:3.11-slim

# 1. Install system dependencies including FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 2. Set workspace directory inside the cloud container
WORKDIR /app

# 3. Install Python libraries
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Copy project code
COPY . .

# 5. Hugging Face Spaces uses port 7860 by default
EXPOSE 7860

# 6. Launch the FastAPI app on port 7860
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "7860"]
