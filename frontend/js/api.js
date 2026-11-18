/**
 * Backend API Client with Real-Time Polling & Hybrid Engine Support
 */
const API = {
  activeBase: '',
  engineType: 'cloud', // 'local' or 'cloud'

  getBaseUrl() {
    return this.activeBase || '';
  },

  async init() {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
      this.activeBase = '';
      this.engineType = 'local';
      this._notifyEngineChange();
      return;
    }

    // When running on Cloud (Render), probe if Local Engine (localhost:8000) is running
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch('http://localhost:8000/health', {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        this.activeBase = 'http://localhost:8000';
        this.engineType = 'local';
        console.log('[Hybrid Engine] Connected to Local Desktop Engine at http://localhost:8000');
        this._notifyEngineChange();
        return;
      }
    } catch (e) {
      // Local engine not running, stay on cloud server
    }

    this.activeBase = '';
    this.engineType = 'cloud';
    this._notifyEngineChange();
  },

  _notifyEngineChange() {
    const event = new CustomEvent('engine-status-changed', {
      detail: { type: this.engineType, baseUrl: this.activeBase }
    });
    window.dispatchEvent(event);
  },

  async getVideoInfo(url) {
    const res = await fetch(`${this.getBaseUrl()}/api/video-info`, {
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
    const res = await fetch(`${this.getBaseUrl()}/api/upload-video`, {
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
    const res = await fetch(`${this.getBaseUrl()}/api/export-clip`, {
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
    const res = await fetch(`${this.getBaseUrl()}/api/export-batch`, {
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

  async getCookieStatus() {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/settings/cookies`);
      if (res.ok) return res.json();
    } catch (e) {
      // ignore
    }
    return { has_cookies: false, source: 'none' };
  },

  async saveCookies(cookiesText) {
    const res = await fetch(`${this.getBaseUrl()}/api/settings/cookies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: cookiesText })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to save cookies' }));
      throw new Error(err.detail || 'Failed to save cookies');
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

    const checkStatus = async () => {
      if (isDone) return;
      try {
        const res = await fetch(`${this.getBaseUrl()}/api/jobs/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();

        // Format absolute download URL if relative
        if (data.download_url && !data.download_url.startsWith('http')) {
          data.download_url = `${this.getBaseUrl()}${data.download_url}`;
        }

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

    checkStatus();
    pollTimer = setInterval(checkStatus, 800);

    return { stop: stopTracking };
  }
};

// Initialize engine detection on script load
if (typeof window !== 'undefined') {
  API.init();
}
