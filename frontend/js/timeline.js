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
    this.hoverTooltip = document.getElementById('timeline-hover-tooltip');
    this.tcCurrent = document.getElementById('timeline-current-tc');
    this.tcTotal = document.getElementById('timeline-total-tc');

    this.totalDuration = 0;
    this.zoom = 1.0;
    this.currentTime = 0;
    this.snappingEnabled = true;

    this.clips = [];
    this.activeClipId = null;

    this.onClipChange = options.onClipChange || (() => {});
    this.onSeek = options.onSeek || (() => {});
    this.onSplit = options.onSplit || (() => {});

    this.ctx = this.rulerCanvas.getContext('2d');
    this._initEvents();
  }

  setDuration(duration) {
    this.totalDuration = Math.max(1, duration);
    if (this.tcTotal) {
      this.tcTotal.textContent = this._formatTime(this.totalDuration);
    }
    this.render();
  }

  setZoom(zoomFactor) {
    this.zoom = Math.max(1.0, Math.min(30.0, zoomFactor));
    this.render();
  }

  fitToScreen() {
    this.zoom = 1.0;
    if (this.viewport) this.viewport.scrollLeft = 0;
    this.render();
  }

  toggleSnapping() {
    this.snappingEnabled = !this.snappingEnabled;
    return this.snappingEnabled;
  }

  setPlayheadTime(seconds) {
    this.currentTime = seconds;
    const px = this.timeToPixels(seconds);
    if (this.playhead) {
      this.playhead.style.left = `${px}px`;
    }
    if (this.tcCurrent) {
      this.tcCurrent.textContent = this._formatTime(seconds);
    }
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
    const totalSec = Math.floor(seconds || 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  renderClipBars() {
    // Remove existing clip bar elements
    const oldBars = this.track.querySelectorAll('.clip-range-bar');
    oldBars.forEach(b => b.remove());

    this.clips.forEach(clip => {
      const leftPx = this.timeToPixels(clip.start_time);
      const rightPx = this.timeToPixels(clip.end_time);
      const barWidth = Math.max(24, rightPx - leftPx);
      const duration = Math.max(0, clip.end_time - clip.start_time);

      const bar = document.createElement('div');
      bar.className = `clip-range-bar ${clip.id === this.activeClipId ? 'active' : ''}`;
      bar.dataset.id = clip.id;
      bar.style.left = `${leftPx}px`;
      bar.style.width = `${barWidth}px`;

      // Professional VN / CapCut Filmstrip Card Architecture
      bar.innerHTML = `
        <div class="clip-filmstrip-header"></div>
        <div class="range-handle handle-left" data-action="resize-left" title="Drag to trim start time"></div>
        <div class="clip-card-body">
          <span class="range-label">${clip.name || 'Clip'}</span>
          <span class="range-duration-pill">${this._formatTime(duration)}</span>
        </div>
        <div class="range-handle handle-right" data-action="resize-right" title="Drag to trim end time"></div>
        <div class="clip-filmstrip-footer"></div>
      `;

      this._bindClipDrag(bar, clip);
      this.track.appendChild(bar);
    });
  }

  _getSnapTarget(candidateTime, excludeClipId) {
    if (!this.snappingEnabled) return candidateTime;

    const snapDistanceSec = (8 / this.getTrackWidth()) * this.totalDuration; // ~8px snap radius
    const targets = [0, this.currentTime, this.totalDuration];

    this.clips.forEach(c => {
      if (c.id !== excludeClipId) {
        targets.push(c.start_time);
        targets.push(c.end_time);
      }
    });

    for (const target of targets) {
      if (Math.abs(candidateTime - target) <= snapDistanceSec) {
        return target;
      }
    }
    return candidateTime;
  }

  _bindClipDrag(bar, clip) {
    let startX = 0;
    let initialStart = clip.start_time;
    let initialEnd = clip.end_time;
    let action = 'move';

    const onPointerDown = (e) => {
      e.stopPropagation();
      action = e.target.dataset.action || 'move';
      startX = e.clientX;
      initialStart = clip.start_time;
      initialEnd = clip.end_time;

      this.activeClipId = clip.id;
      this.onClipChange(clip, 'select');
      this.renderClipBars();

      const onPointerMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dt = (dx / this.getTrackWidth()) * this.totalDuration;

        if (action === 'resize-left') {
          let newStart = Math.max(0, Math.min(initialEnd - 1.0, initialStart + dt));
          newStart = this._getSnapTarget(newStart, clip.id);
          clip.start_time = Math.round(newStart * 10) / 10;
        } else if (action === 'resize-right') {
          let newEnd = Math.max(initialStart + 1.0, Math.min(this.totalDuration, initialEnd + dt));
          newEnd = this._getSnapTarget(newEnd, clip.id);
          clip.end_time = Math.round(newEnd * 10) / 10;
        } else if (action === 'move') {
          const duration = initialEnd - initialStart;
          let newStart = initialStart + dt;
          if (newStart < 0) newStart = 0;
          if (newStart + duration > this.totalDuration) newStart = this.totalDuration - duration;
          newStart = this._getSnapTarget(newStart, clip.id);
          clip.start_time = Math.round(newStart * 10) / 10;
          clip.end_time = Math.round((newStart + duration) * 10) / 10;
        }

        this.onClipChange(clip, 'update');
        this.renderClipBars();
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        this.onClipChange(clip, 'commit');
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    bar.addEventListener('pointerdown', onPointerDown);
  }

  splitAtPlayhead() {
    const current = this.currentTime;
    // Find active clip or any clip that encompasses current playhead
    let target = this.clips.find(c => c.id === this.activeClipId);
    if (!target || current <= target.start_time + 1 || current >= target.end_time - 1) {
      target = this.clips.find(c => current > c.start_time + 1 && current < c.end_time - 1);
    }

    if (!target) {
      return null;
    }

    return {
      originalClip: target,
      splitTime: current
    };
  }

  _initEvents() {
    // Scrubbing on ruler click / drag
    const handleSeek = (e) => {
      const rect = this.canvasContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const targetTime = this.pixelsToTime(clickX);
      this.setPlayheadTime(targetTime);
      this.onSeek(targetTime);
    };

    this.rulerCanvas.addEventListener('pointerdown', (e) => {
      handleSeek(e);
      const onMove = (moveEvent) => handleSeek(moveEvent);
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    // Precision Floating Hover Tooltip
    this.viewport.addEventListener('mousemove', (e) => {
      if (!this.hoverTooltip || this.totalDuration <= 0) return;
      const rect = this.viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left + this.viewport.scrollLeft;
      const hoverTime = this.pixelsToTime(mouseX);

      this.hoverTooltip.style.display = 'block';
      this.hoverTooltip.style.left = `${mouseX}px`;
      this.hoverTooltip.textContent = this._formatTime(hoverTime);
    });

    this.viewport.addEventListener('mouseleave', () => {
      if (this.hoverTooltip) {
        this.hoverTooltip.style.display = 'none';
      }
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
