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
    this._pollInterval = null;

    this.isYouTubeApiLoaded = false;
    this.pendingVideoId = null;
    this._initYouTubeAPI();
  }

  _initYouTubeAPI() {
    if (window.YT && window.YT.Player) {
      this.isYouTubeApiLoaded = true;
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        this.isYouTubeApiLoaded = true;
        if (typeof prevCallback === 'function') prevCallback();
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
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    }
  }

  loadYouTube(videoId) {
    this.isYouTube = true;
    this.html5Player.style.display = 'none';
    this.ytContainer.style.display = 'block';
    this.placeholder.style.display = 'none';

    if (!window.YT || !window.YT.Player) {
      this.pendingVideoId = videoId;
      return;
    }

    if (this.ytPlayer && this.ytPlayer.loadVideoById) {
      this.ytPlayer.loadVideoById(videoId);
      this.isReady = true;
    } else {
      try {
        this.ytPlayer = new YT.Player('yt-player-container', {
          height: '100%',
          width: '100%',
          videoId: videoId,
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1
          },
          events: {
            onReady: () => {
              this.isReady = true;
              this.duration = this.ytPlayer.getDuration();
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
        console.warn("YouTube Player initialization queued:", err);
        this.pendingVideoId = videoId;
      }
    }

    this._startPolling();
  }

  loadLocal(fileUrl) {
    this.isYouTube = false;
    this.ytContainer.style.display = 'none';
    this.html5Player.style.display = 'block';
    this.placeholder.style.display = 'none';

    this.html5Player.src = fileUrl;
    this.html5Player.load();
    this.html5Player.onloadedmetadata = () => {
      this.isReady = true;
      this.duration = this.html5Player.duration;
    };

    this.html5Player.ontimeupdate = () => {
      this._onTick(this.html5Player.currentTime);
    };
  }

  seekTo(seconds) {
    const clamped = Math.max(0, Math.min(this.duration || 999999, seconds));
    if (this.isYouTube && this.ytPlayer && this.ytPlayer.seekTo) {
      this.ytPlayer.seekTo(clamped, true);
    } else if (!this.isYouTube && this.html5Player) {
      this.html5Player.currentTime = clamped;
    }
    this.currentTime = clamped;
    this._broadcastTime(clamped);
  }

  play() {
    if (this.isYouTube && this.ytPlayer && this.ytPlayer.playVideo) {
      this.ytPlayer.playVideo();
    } else if (!this.isYouTube && this.html5Player) {
      this.html5Player.play();
    }
  }

  pause() {
    if (this.isYouTube && this.ytPlayer && this.ytPlayer.pauseVideo) {
      this.ytPlayer.pauseVideo();
    } else if (!this.isYouTube && this.html5Player) {
      this.html5Player.pause();
    }
    this.previewActive = false;
  }

  getCurrentTime() {
    if (this.isYouTube && this.ytPlayer && this.ytPlayer.getCurrentTime) {
      return this.ytPlayer.getCurrentTime() || 0;
    } else if (!this.isYouTube && this.html5Player) {
      return this.html5Player.currentTime || 0;
    }
    return this.currentTime;
  }

  previewRange(startSec, endSec) {
    this.previewStart = startSec;
    this.previewEnd = endSec;
    this.previewActive = true;
    this.seekTo(startSec);
    this.play();
  }

  onTimeUpdate(callback) {
    this.timeUpdateCallbacks.push(callback);
  }

  _startPolling() {
    if (this._pollInterval) clearInterval(this._pollInterval);
    this._pollInterval = setInterval(() => {
      if (this.isYouTube && this.ytPlayer && this.ytPlayer.getCurrentTime) {
        const time = this.ytPlayer.getCurrentTime() || 0;
        this._onTick(time);
      }
    }, 50);
  }

  _onTick(time) {
    this.currentTime = time;
    this._broadcastTime(time);

    // Enforce preview boundaries
    if (this.previewActive && time >= this.previewEnd) {
      this.pause();
      this.seekTo(this.previewStart);
      this.previewActive = false;
    }
  }

  _broadcastTime(time) {
    for (const cb of this.timeUpdateCallbacks) {
      try { cb(time); } catch (e) { console.error(e); }
    }
  }
}
