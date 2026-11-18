/**
 * Unified Player Controller: Official YouTube IFrame API & HTML5 Video
 */
class VideoPlayerController {
  constructor() {
    this.ytPlayer = null;
    this.html5Player = document.getElementById('html5-player');
    this.ytContainer = document.getElementById('yt-player-container');
    this.placeholder = document.getElementById('player-placeholder');
    this.isYouTube = true;
    this.isReady = false;
    this.currentTime = 0;
    this.duration = 0;
    this.previewActive = false;
    this.previewEnd = 0;
    this.previewStart = 0;
    this.timeUpdateCallbacks = [];
    this.durationCallbacks = [];
    this.readyCallbacks = [];
    this._pollInterval = null;

    this.isYouTubeApiLoaded = false;
    this.pendingVideoId = null;

    // Reflection Preview HUD Elements
    this.previewHud = document.getElementById('player-preview-hud');
    this.hudTitle = document.getElementById('hud-clip-title');
    this.hudStart = document.getElementById('hud-time-start');
    this.hudEnd = document.getElementById('hud-time-end');
    this.hudDur = document.getElementById('hud-duration-text');
    this.hudFill = document.getElementById('hud-progress-fill');
    this.btnHudStop = document.getElementById('btn-hud-stop');

    if (this.btnHudStop) {
      this.btnHudStop.addEventListener('click', (e) => {
        e.stopPropagation();
        this.stopPreview();
      });
    }

    this._initYouTubeAPI();
  }

  _initYouTubeAPI() {
    if (window.YT && window.YT.Player) {
      this.isYouTubeApiLoaded = true;
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        this.isYouTubeApiLoaded = true;
        if (typeof prevCallback === 'function') {
          try { prevCallback(); } catch (e) { console.warn(e); }
        }
        if (this.pendingVideoId) {
          const vid = this.pendingVideoId;
          this.pendingVideoId = null;
          this.loadYouTube(vid);
        }
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
          document.head.appendChild(tag);
        }
      }
    }
  }

  loadYouTube(videoId) {
    this.isYouTube = true;
    if (this.html5Player) this.html5Player.style.display = 'none';
    if (this.ytContainer) this.ytContainer.style.display = 'block';
    if (this.placeholder) this.placeholder.style.display = 'none';

    if (!window.YT || !window.YT.Player) {
      this.pendingVideoId = videoId;
      return;
    }

    if (this.ytPlayer) {
      if (typeof this.ytPlayer.loadVideoById === 'function') {
        try {
          this.ytPlayer.loadVideoById(videoId);
          this.isReady = true;
        } catch (e) {
          console.warn("loadVideoById error, queuing:", e);
          this.pendingVideoId = videoId;
        }
      } else {
        this.pendingVideoId = videoId;
      }
    } else {
      try {
        this.ytPlayer = new YT.Player('yt-player-container', {
          height: '100%',
          width: '100%',
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            playsinline: 1,
            rel: 0,
            modestbranding: 1
          },
          events: {
            onReady: () => {
              this.isReady = true;
              if (this.pendingVideoId) {
                const pending = this.pendingVideoId;
                this.pendingVideoId = null;
                if (typeof this.ytPlayer.loadVideoById === 'function') {
                  this.ytPlayer.loadVideoById(pending);
                }
              }
              const dur = this.ytPlayer.getDuration();
              if (dur && dur > 0) {
                this.duration = dur;
                this._broadcastDuration(dur);
              }
              this._broadcastReady();
            },
            onStateChange: (event) => {
              // YT.PlayerState.ENDED = 0
              if (event.data === 0 && this.previewActive) {
                this.seekTo(this.previewStart);
              }
            }
          }
        });
      } catch (err) {
        console.warn("YouTube Player initialization error:", err);
        this.pendingVideoId = videoId;
      }
    }

    this._startPolling();
  }

  loadLocal(fileUrl) {
    this.isYouTube = false;
    if (this.ytContainer) this.ytContainer.style.display = 'none';
    if (this.html5Player) this.html5Player.style.display = 'block';
    if (this.placeholder) this.placeholder.style.display = 'none';

    this.html5Player.src = fileUrl;
    this.html5Player.load();
    this.html5Player.onloadedmetadata = () => {
      this.isReady = true;
      this.duration = this.html5Player.duration;
      this._broadcastDuration(this.duration);
      this._broadcastReady();
    };

    this.html5Player.ontimeupdate = () => {
      this._onTick(this.html5Player.currentTime);
    };
  }

  seekTo(seconds) {
    const clamped = Math.max(0, Math.min(this.duration || 999999, seconds));
    if (this.isYouTube && this.ytPlayer && typeof this.ytPlayer.seekTo === 'function') {
      try {
        this.ytPlayer.seekTo(clamped, true);
      } catch (e) {
        console.warn("seekTo error:", e);
      }
    } else if (!this.isYouTube && this.html5Player) {
      this.html5Player.currentTime = clamped;
    }
    this.currentTime = clamped;
    this._broadcastTime(clamped);
  }

  play() {
    if (this.isYouTube && this.ytPlayer && typeof this.ytPlayer.playVideo === 'function') {
      try {
        this.ytPlayer.playVideo();
      } catch (e) {
        console.warn("playVideo error:", e);
      }
    } else if (!this.isYouTube && this.html5Player) {
      this.html5Player.play();
    }
  }

  pause() {
    if (this.isYouTube && this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
      try {
        this.ytPlayer.pauseVideo();
      } catch (e) {
        console.warn("pauseVideo error:", e);
      }
    } else if (!this.isYouTube && this.html5Player) {
      this.html5Player.pause();
    }
    this.previewActive = false;
  }

  getCurrentTime() {
    if (this.isYouTube && this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function') {
      try {
        return this.ytPlayer.getCurrentTime() || 0;
      } catch (e) {
        return this.currentTime;
      }
    } else if (!this.isYouTube && this.html5Player) {
      return this.html5Player.currentTime || 0;
    }
    return this.currentTime;
  }

  getDuration() {
    if (this.isYouTube && this.ytPlayer && typeof this.ytPlayer.getDuration === 'function') {
      try {
        const d = this.ytPlayer.getDuration();
        if (d && d > 0) return d;
      } catch (e) {}
    } else if (!this.isYouTube && this.html5Player) {
      return this.html5Player.duration || 0;
    }
    return this.duration;
  }

  previewRange(startSec, endSec, clipName = 'Selection') {
    this.previewStart = Math.max(0, startSec);
    this.previewEnd = Math.max(this.previewStart + 0.5, endSec);
    this.previewActive = true;

    // Update Player Reflection HUD Overlay
    if (this.previewHud) {
      if (this.hudTitle) this.hudTitle.textContent = `PREVIEWING: ${clipName || 'Selection'}`;
      if (this.hudStart) this.hudStart.textContent = this._formatHM(this.previewStart);
      if (this.hudEnd) this.hudEnd.textContent = this._formatHM(this.previewEnd);
      if (this.hudDur) this.hudDur.textContent = `(${this._formatHM(this.previewEnd - this.previewStart)})`;
      if (this.hudFill) this.hudFill.style.width = '0%';
      this.previewHud.style.display = 'flex';
    }

    this.seekTo(this.previewStart);
    this.play();
  }

  stopPreview() {
    this.previewActive = false;
    if (this.previewHud) {
      this.previewHud.style.display = 'none';
    }
    this.pause();
  }

  _formatHM(seconds) {
    const totalSec = Math.floor(seconds || 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
    }
    return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }

  onTimeUpdate(callback) {
    this.timeUpdateCallbacks.push(callback);
  }

  onDurationChange(callback) {
    this.durationCallbacks.push(callback);
  }

  onReady(callback) {
    if (this.isReady) {
      try { callback(); } catch (e) {}
    } else {
      this.readyCallbacks.push(callback);
    }
  }

  _startPolling() {
    if (this._pollInterval) clearInterval(this._pollInterval);
    this._pollInterval = setInterval(() => {
      if (this.isYouTube && this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function') {
        try {
          const time = this.ytPlayer.getCurrentTime() || 0;
          this._onTick(time);

          // Update duration dynamically as player metadata stream loads
          const dur = this.ytPlayer.getDuration();
          if (dur && dur > 0 && Math.abs(dur - this.duration) > 0.5) {
            this.duration = dur;
            this._broadcastDuration(dur);
          }
        } catch (e) {}
      }
    }, 50);
  }

  _onTick(time) {
    this.currentTime = time;
    this._broadcastTime(time);

    // Enforce preview boundaries & animate progress fill
    if (this.previewActive) {
      const range = Math.max(0.1, this.previewEnd - this.previewStart);
      const elapsed = Math.max(0, time - this.previewStart);
      const pct = Math.min(100, Math.max(0, (elapsed / range) * 100));

      if (this.hudFill) {
        this.hudFill.style.width = `${pct}%`;
      }

      if (time >= this.previewEnd) {
        this.pause();
        this.seekTo(this.previewStart);
        if (this.hudFill) this.hudFill.style.width = '100%';
        setTimeout(() => {
          if (this.previewActive) {
            this.stopPreview();
          }
        }, 300);
      }
    }
  }

  _broadcastTime(time) {
    for (const cb of this.timeUpdateCallbacks) {
      try { cb(time); } catch (e) { console.error(e); }
    }
  }

  _broadcastDuration(duration) {
    for (const cb of this.durationCallbacks) {
      try { cb(duration); } catch (e) { console.error(e); }
    }
  }

  _broadcastReady() {
    for (const cb of this.readyCallbacks) {
      try { cb(); } catch (e) { console.error(e); }
    }
  }
}
