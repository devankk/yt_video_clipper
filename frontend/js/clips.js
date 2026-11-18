/**
 * Multi-Clip Management & Batch Processing Coordinator
 */
class ClipManager {
  constructor(options = {}) {
    this.clips = [];
    this.activeClipId = null;
    this.totalDuration = 0;
    this.onActiveChange = options.onActiveChange || (() => {});
    this.onListChange = options.onListChange || (() => {});
    this.onPreviewClip = options.onPreviewClip || (() => {});
    this.onExportSingle = options.onExportSingle || (() => {});

    this.tableBody = document.getElementById('clips-table-body');
  }

  setTotalDuration(duration) {
    this.totalDuration = duration;
    if (this.clips.length === 0 && duration > 0) {
      // Create initial default 2-minute clip (Option 2)
      this.addClip(0, Math.min(120, duration), "Clip 1");
    }
  }

  addClip(startTime = 0, endTime = 120, name = null) {
    const id = 'clip_' + Math.random().toString(36).substr(2, 9);
    const count = this.clips.length + 1;
    const clip = {
      id,
      name: name || `Clip ${count}`,
      start_time: Math.max(0, startTime),
      end_time: Math.min(this.totalDuration || 999999, Math.max(startTime + 1, endTime))
    };
    this.clips.push(clip);
    this.activeClipId = id;
    this.render();
    this.onListChange(this.clips, this.activeClipId);
    return clip;
  }

  removeClip(id) {
    if (this.clips.length <= 1) {
      if (window.showToast) {
        window.showToast("At least one clip range must be retained.", "warning");
      }
      return;
    }
    const wasActive = (this.activeClipId === id);
    this.clips = this.clips.filter(c => c.id !== id);
    if (wasActive) {
      this.activeClipId = this.clips[0] ? this.clips[0].id : null;
    }
    this.render();
    this.onListChange(this.clips, this.activeClipId);
    if (wasActive) {
      this.onActiveChange(this.getActiveClip());
    }
  }

  getActiveClip() {
    return this.clips.find(c => c.id === this.activeClipId) || this.clips[0] || null;
  }

  setActiveClip(id) {
    this.activeClipId = id;
    this.render();
    this.onActiveChange(this.getActiveClip());
  }

  updateActiveTimestamps(start, end) {
    const active = this.getActiveClip();
    if (active) {
      active.start_time = Math.max(0, start);
      active.end_time = Math.min(this.totalDuration || 999999, Math.max(start + 1, end));
      this.syncInputsForClip(active);
      this.onListChange(this.clips, this.activeClipId);
    }
  }

  syncInputsForClip(clip) {
    const tr = this.tableBody.querySelector(`tr[data-clip-id="${clip.id}"]`);
    if (!tr) {
      this.render();
      return;
    }

    const { h: startH, m: startM } = this._splitHM(clip.start_time);
    const { h: endH, m: endM } = this._splitHM(clip.end_time);
    const duration = Math.max(0, clip.end_time - clip.start_time);

    const inputStartH = tr.querySelector('.clip-start-h');
    const inputStartM = tr.querySelector('.clip-start-m');
    const inputEndH = tr.querySelector('.clip-end-h');
    const inputEndM = tr.querySelector('.clip-end-m');
    const durCell = tr.querySelector('.clip-duration-cell');

    if (inputStartH && document.activeElement !== inputStartH) inputStartH.value = String(startH).padStart(2, '0');
    if (inputStartM && document.activeElement !== inputStartM) inputStartM.value = String(startM).padStart(2, '0');
    if (inputEndH && document.activeElement !== inputEndH) inputEndH.value = String(endH).padStart(2, '0');
    if (inputEndM && document.activeElement !== inputEndM) inputEndM.value = String(endM).padStart(2, '0');
    if (durCell) durCell.textContent = this._formatDurationHM(duration);
  }

  render() {
    this.tableBody.innerHTML = '';
    this.clips.forEach((clip, index) => {
      const duration = Math.max(0, clip.end_time - clip.start_time);
      const isSelected = clip.id === this.activeClipId;
      const { h: startH, m: startM } = this._splitHM(clip.start_time);
      const { h: endH, m: endM } = this._splitHM(clip.end_time);

      const tr = document.createElement('tr');
      tr.dataset.clipId = clip.id;
      if (isSelected) tr.style.backgroundColor = 'var(--bg-card)';

      tr.innerHTML = `
        <td style="font-weight: 700; color: var(--text-muted); width: 36px;">${index + 1}</td>
        <td>
          <input type="text" class="clip-name-input" value="${clip.name}" data-id="${clip.id}">
        </td>
        <td>
          <div class="clip-time-group" title="Set start time (Hours & Minutes)">
            <input type="number" min="0" max="99" class="clip-time-input clip-start-h" value="${String(startH).padStart(2, '0')}" data-id="${clip.id}">
            <span class="clip-time-unit">h</span>
            <input type="number" min="0" max="59" class="clip-time-input clip-start-m" value="${String(startM).padStart(2, '0')}" data-id="${clip.id}">
            <span class="clip-time-unit">m</span>
          </div>
        </td>
        <td>
          <div class="clip-time-group" title="Set end time (Hours & Minutes)">
            <input type="number" min="0" max="99" class="clip-time-input clip-end-h" value="${String(endH).padStart(2, '0')}" data-id="${clip.id}">
            <span class="clip-time-unit">h</span>
            <input type="number" min="0" max="59" class="clip-time-input clip-end-m" value="${String(endM).padStart(2, '0')}" data-id="${clip.id}">
            <span class="clip-time-unit">m</span>
          </div>
        </td>
        <td class="clip-duration-cell" style="font-family: var(--font-mono); color: var(--accent-orange); font-weight: 700; white-space: nowrap;">
          ${this._formatDurationHM(duration)}
        </td>
        <td>
          <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm btn-preview" data-id="${clip.id}" title="Preview selection on video player">
              ▶ Preview
            </button>
            <button class="btn btn-primary btn-sm btn-export" data-id="${clip.id}" title="Export this clip">
              Export
            </button>
            <button class="btn btn-danger btn-sm btn-delete" data-id="${clip.id}" title="${this.clips.length <= 1 ? 'At least one clip must be retained' : 'Delete clip'}" ${this.clips.length <= 1 ? 'disabled style="opacity: 0.35; cursor: not-allowed;"' : ''}>
              ✕
            </button>
          </div>
        </td>
      `;

      // Event handlers
      tr.addEventListener('click', (e) => {
        if (!e.target.closest('button') && !e.target.closest('input')) {
          this.setActiveClip(clip.id);
        }
      });

      const nameInput = tr.querySelector('.clip-name-input');
      nameInput.addEventListener('change', (e) => {
        clip.name = e.target.value.trim() || `Clip ${index + 1}`;
        this.onListChange(this.clips, this.activeClipId);
      });

      // Start Time (Hours & Minutes) handlers
      const inStartH = tr.querySelector('.clip-start-h');
      const inStartM = tr.querySelector('.clip-start-m');
      const inEndH = tr.querySelector('.clip-end-h');
      const inEndM = tr.querySelector('.clip-end-m');
      const durCell = tr.querySelector('.clip-duration-cell');

      const handleTimeChange = () => {
        let sh = parseInt(inStartH.value, 10);
        if (isNaN(sh) || sh < 0) sh = 0;
        let sm = parseInt(inStartM.value, 10);
        if (isNaN(sm) || sm < 0) sm = 0;
        if (sm > 59) sm = 59;

        let eh = parseInt(inEndH.value, 10);
        if (isNaN(eh) || eh < 0) eh = 0;
        let em = parseInt(inEndM.value, 10);
        if (isNaN(em) || em < 0) em = 0;
        if (em > 59) em = 59;

        let newStart = sh * 3600 + sm * 60;
        let newEnd = eh * 3600 + em * 60;

        if (newEnd <= newStart) {
          newEnd = newStart + 60; // minimum 1 minute
          const { h: adjH, m: adjM } = this._splitHM(newEnd);
          inEndH.value = String(adjH).padStart(2, '0');
          inEndM.value = String(adjM).padStart(2, '0');
        }

        clip.start_time = newStart;
        clip.end_time = newEnd;

        durCell.textContent = this._formatDurationHM(newEnd - newStart);
        this.onListChange(this.clips, this.activeClipId);
        if (clip.id === this.activeClipId) {
          this.onActiveChange(clip);
        }
      };

      [inStartH, inStartM, inEndH, inEndM].forEach(inp => {
        inp.addEventListener('input', handleTimeChange);
        inp.addEventListener('blur', () => {
          // Format with padded zeros
          let v = parseInt(inp.value, 10) || 0;
          inp.value = String(v).padStart(2, '0');
        });
      });

      tr.querySelector('.btn-preview').addEventListener('click', () => {
        this.setActiveClip(clip.id);
        this.onPreviewClip(clip);
      });

      tr.querySelector('.btn-export').addEventListener('click', () => {
        this.setActiveClip(clip.id);
        this.onExportSingle(clip);
      });

      tr.querySelector('.btn-delete').addEventListener('click', () => {
        this.removeClip(clip.id);
      });

      this.tableBody.appendChild(tr);
    });
  }

  _splitHM(seconds) {
    const totalSec = Math.floor(seconds || 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return { h, m };
  }

  _formatDurationHM(seconds) {
    const totalSec = Math.floor(seconds || 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${h}h ${m}m ${s > 0 ? `${s}s` : ''}`.trim();
    }
    if (m > 0) {
      return `${m}m ${s > 0 ? `${s}s` : ''}`.trim();
    }
    return `${s}s`;
  }

  _formatTime(seconds) {
    const totalSec = Math.floor(seconds);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
