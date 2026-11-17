/**
 * Advanced Multi-Clip Visual Timeline Editor
 * Dynamic Canvas Ruler, Draggable Range Handles, Zoom/Pan & Playhead Scrubber
 */
class TimelineEditor {
  constructor(containerId, options = {}) {
    this.viewport = document.getElementById(containerId);
    this.canvasContainer = document.getElementById('timeline-canvas-container');
    this.rulerCanvas = document.getElementById('ruler-canvas');
    this.track = document.getElementById('timeline-track');
    this.playhead = document.getElementById('timeline-playhead');

    this.totalDuration = 0;
    this.zoom = 1.0;
    this.currentTime = 0;

    this.clips = [];
    this.activeClipId = null;

    this.onClipChange = options.onClipChange || (() => {});
    this.onSeek = options.onSeek || (() => {});

    this.ctx = this.rulerCanvas.getContext('2d');
    this._initEvents();
  }

  setDuration(duration) {
    this.totalDuration = Math.max(1, duration);
    this.render();
  }

  setZoom(zoomFactor) {
    this.zoom = Math.max(1.0, Math.min(30.0, zoomFactor));
    this.render();
  }

  setPlayheadTime(seconds) {
    this.currentTime = seconds;
    const px = this.timeToPixels(seconds);
    this.playhead.style.left = `${px}px`;
  }

  setClips(clips, activeId) {
    this.clips = clips;
    this.activeClipId = activeId;
    this.renderClipBars();
  }

  timeToPixels(seconds) {
    const width = this.getTrackWidth();
    if (this.totalDuration <= 0) return 0;
    return (seconds / this.totalDuration) * width;
  }

  pixelsToTime(pixels) {
    const width = this.getTrackWidth();
    if (width <= 0) return 0;
    const time = (pixels / width) * this.totalDuration;
    return Math.max(0, Math.min(this.totalDuration, time));
  }

  getTrackWidth() {
    const viewportWidth = this.viewport.clientWidth || 800;
    return Math.max(viewportWidth, viewportWidth * this.zoom);
  }

  render() {
    const width = this.getTrackWidth();
    this.canvasContainer.style.width = `${width}px`;

    // Resize canvas with pixel ratio
    const dpr = window.devicePixelRatio || 1;
    this.rulerCanvas.width = width * dpr;
    this.rulerCanvas.height = 35 * dpr;
    this.rulerCanvas.style.width = `${width}px`;
    this.rulerCanvas.style.height = `35px`;

    this.ctx.scale(dpr, dpr);
    this._drawRuler(width);
    this.setPlayheadTime(this.currentTime);
    this.renderClipBars();
  }

  _drawRuler(width) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, 35);

    if (this.totalDuration <= 0) return;

    // Calculate dynamic tick intervals based on zoom
    const visibleDuration = this.totalDuration / this.zoom;
    let majorInterval = 60; // seconds
    let minorInterval = 10;

    if (visibleDuration > 7200) {
      majorInterval = 1800; // 30 min
      minorInterval = 600;  // 10 min
    } else if (visibleDuration > 3600) {
      majorInterval = 600;  // 10 min
      minorInterval = 120;  // 2 min
    } else if (visibleDuration > 1200) {
      majorInterval = 300;  // 5 min
      minorInterval = 60;   // 1 min
    } else if (visibleDuration > 300) {
      majorInterval = 60;   // 1 min
      minorInterval = 15;   // 15 sec
    } else if (visibleDuration > 60) {
      majorInterval = 10;   // 10 sec
      minorInterval = 2;    // 2 sec
    } else {
      majorInterval = 2;    // 2 sec
      minorInterval = 0.5;  // 0.5 sec
    }

    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillStyle = '#9ca3af';
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;

    for (let t = 0; t <= this.totalDuration; t += minorInterval) {
      const x = this.timeToPixels(t);
      const isMajor = Math.round(t % majorInterval) === 0 || Math.abs(t % majorInterval - majorInterval) < 0.001;

      ctx.beginPath();
      if (isMajor) {
        ctx.strokeStyle = '#6b7280';
        ctx.moveTo(x, 20);
        ctx.lineTo(x, 35);
        ctx.stroke();

        const label = this._formatTime(t);
        ctx.fillText(label, x + 4, 16);
      } else {
        ctx.strokeStyle = '#262c3e';
        ctx.moveTo(x, 27);
        ctx.lineTo(x, 35);
        ctx.stroke();
      }
    }
  }

  _formatTime(seconds) {
    const totalSec = Math.floor(seconds);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  renderClipBars() {
    // Remove existing clip bar elements
    const oldBars = this.track.querySelectorAll('.clip-range-bar');
    oldBars.forEach(b => b.remove());

    this.clips.forEach(clip => {
      const leftPx = this.timeToPixels(clip.start_time);
      const rightPx = this.timeToPixels(clip.end_time);
      const barWidth = Math.max(16, rightPx - leftPx);

      const bar = document.createElement('div');
      bar.className = `clip-range-bar ${clip.id === this.activeClipId ? 'active' : ''}`;
      bar.dataset.id = clip.id;
      bar.style.left = `${leftPx}px`;
      bar.style.width = `${barWidth}px`;

      bar.innerHTML = `
        <div class="range-handle handle-left" data-action="resize-left"></div>
        <span class="range-label">${clip.name || 'Clip'}</span>
        <div class="range-handle handle-right" data-action="resize-right"></div>
      `;

      this._bindClipDrag(bar, clip);
      this.track.appendChild(bar);
    });
  }

  _bindClipDrag(bar, clip) {
    let startX = 0;
    let initialStart = clip.start_time;
    let initialEnd = clip.end_time;
    let action = 'move';

    const onMouseDown = (e) => {
      e.stopPropagation();
      action = e.target.dataset.action || 'move';
      startX = e.clientX;
      initialStart = clip.start_time;
      initialEnd = clip.end_time;

      this.activeClipId = clip.id;
      this.onClipChange(clip, 'select');
      this.renderClipBars();

      const onMouseMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dt = (dx / this.getTrackWidth()) * this.totalDuration;

        if (action === 'resize-left') {
          const newStart = Math.max(0, Math.min(initialEnd - 1.0, initialStart + dt));
          clip.start_time = Math.round(newStart * 10) / 10;
        } else if (action === 'resize-right') {
          const newEnd = Math.max(initialStart + 1.0, Math.min(this.totalDuration, initialEnd + dt));
          clip.end_time = Math.round(newEnd * 10) / 10;
        } else if (action === 'move') {
          const duration = initialEnd - initialStart;
          let newStart = initialStart + dt;
          if (newStart < 0) newStart = 0;
          if (newStart + duration > this.totalDuration) newStart = this.totalDuration - duration;
          clip.start_time = Math.round(newStart * 10) / 10;
          clip.end_time = Math.round((newStart + duration) * 10) / 10;
        }

        this.onClipChange(clip, 'update');
        this.renderClipBars();
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        this.onClipChange(clip, 'commit');
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    bar.addEventListener('mousedown', onMouseDown);
  }

  _initEvents() {
    // Scrubbing on ruler click
    const handleSeek = (e) => {
      const rect = this.canvasContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const targetTime = this.pixelsToTime(clickX);
      this.setPlayheadTime(targetTime);
      this.onSeek(targetTime);
    };

    this.rulerCanvas.addEventListener('mousedown', (e) => {
      handleSeek(e);
      const onMove = (moveEvent) => handleSeek(moveEvent);
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    // Horizontal wheel zoom / scroll
    this.viewport.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.2 : 0.8;
        this.setZoom(this.zoom * factor);
      }
    }, { passive: false });

    window.addEventListener('resize', () => this.render());
  }
}
