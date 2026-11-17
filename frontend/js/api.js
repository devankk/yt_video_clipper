/**
 * Backend API Client with Real-Time Polling & SSE Job Tracking
 */
const API = {
  async getVideoInfo(url) {
    const res = await fetch('/api/video-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch video information' }));
      throw new Error(err.detail || 'Failed to fetch video information');
    }
    return res.json();
  },

  async uploadVideoFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload-video', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(err.detail || 'Upload failed');
    }
    return res.json();
  },

  async exportClip(payload) {
    const res = await fetch('/api/export-clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Export request failed' }));
      throw new Error(err.detail || 'Export request failed');
    }
    return res.json();
  },

  async exportBatch(payload) {
    const res = await fetch('/api/export-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Batch export request failed' }));
      throw new Error(err.detail || 'Batch export request failed');
    }
    return res.json();
  },

  trackJobProgress(jobId, onUpdate, onComplete, onError) {
    let isDone = false;
    let pollTimer = null;

    const stopTracking = () => {
      isDone = true;
      if (pollTimer) clearInterval(pollTimer);
    };

    // Polling function (checks every 800ms)
    const checkStatus = async () => {
      if (isDone) return;
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();

        if (onUpdate) onUpdate(data);

        if (data.status === 'completed') {
          stopTracking();
          if (onComplete) onComplete(data);
        } else if (data.status === 'failed') {
          stopTracking();
          if (onError) onError(new Error(data.error || 'Export processing failed'));
        }
      } catch (e) {
        console.warn('Job poll error', e);
      }
    };

    // Run first check immediately, then poll every 800ms
    checkStatus();
    pollTimer = setInterval(checkStatus, 800);

    return { stop: stopTracking };
  }
};
