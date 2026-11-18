/**
 * Multi-Clip Management & Batch Processing Coordinator
 * Professional NLE Architecture with Undo/Redo History & Sub-Second Precision
 */
class ClipManager {
  constructor(options = {}) {
    this.clips = [];
    this.activeClipId = null;
    this.totalDuration = 0;
    this.history = [];
    this.redoStack = [];
    this.maxHistory = 50;

    this.onActiveChange = options.onActiveChange || (() => {});
    this.onListChange = options.onListChange || (() => {});
    this.onPreviewClip = options.onPreviewClip || (() => {});
    this.onExportSingle = options.onExportSingle || (() => {});
    this.onHistoryChange = options.onHistoryChange || (() => {});

    this.tableBody = document.getElementById('clips-table-body');
  }

  setTotalDuration(duration) {
    this.totalDuration = duration;
    if (this.clips.length === 0 && duration > 0) {
      // Create initial default 2-minute clip
      this.addClip(0, Math.min(120, duration), "Clip 1", false);
    }
  }

  _snapshot() {
    return {
      clips: JSON.parse(JSON.stringify(this.clips)),
      activeClipId: this.activeClipId
    };
  }

  pushHistory() {
    this.history.push(this._snapshot());
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.redoStack = [];
    this._broadcastHistory();
  }

  canUndo() {
    return this.history.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return false;
    this.redoStack.push(this._snapshot());
    const prev = this.history.pop();
    this.clips = prev.clips;
    this.activeClipId = prev.activeClipId;
    this.render();
    this.onListChange(this.clips, this.activeClipId);
    this.onActiveChange(this.getActiveClip());
    this._broadcastHistory();
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    this.history.push(this._snapshot());
    const next = this.redoStack.pop();
    this.clips = next.clips;
    this.activeClipId = next.activeClipId;
    this.render();
    this.onListChange(this.clips, this.activeClipId);
    this.onActiveChange(this.getActiveClip());
    this._broadcastHistory();
    return true;
  }

  _broadcastHistory() {
    this.onHistoryChange(this.canUndo(), this.canRedo());
  }

  restoreState(clips, activeId) {
    if (!Array.isArray(clips) || clips.length === 0) return;
    this.clips = clips;
    this.activeClipId = activeId || clips[0].id;
    this.render();
    this.onListChange(this.clips, this.activeClipId);
    this.onActiveChange(this.getActiveClip());
  }

  addClip(startTime = 0, endTime = 120, name = null, recordHistory = true) {
    if (recordHistory) this.pushHistory();

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

  duplicateClip(id, recordHistory = true) {
    const target = this.clips.find(c => c.id === id) || this.getActiveClip();
    if (!target) return null;

    if (recordHistory) this.pushHistory();

    const duration = Math.max(1, target.end_time - target.start_time);
    let newStart = target.end_time;
    let newEnd = newStart + duration;

    if (this.totalDuration > 0 && newEnd > this.totalDuration) {
      newStart = Math.max(0, this.totalDuration - duration);
      newEnd = this.totalDuration;
    }

    const newClip = {
      id: 'clip_' + Math.random().toString(36).substr(2, 9),
      name: `${target.name} (Copy)`,
      start_time: Math.round(newStart * 10) / 10,
      end_time: Math.round(newEnd * 10) / 10
    };

    this.clips.push(newClip);
    this.activeClipId = newClip.id;
    this.render();
    this.onListChange(this.clips, this.activeClipId);
    this.onActiveChange(newClip);
    return newClip;
  }

  removeClip(id, recordHistory = true) {
    if (this.clips.length <= 1) {
      if (window.showToast) {
        window.showToast("At least one clip range must be retained.", "warning");
      }
      return;
    }

    if (recordHistory) this.pushHistory();

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
    if (this.activeClipId === id) return;
    this.activeClipId = id;
    this.render();
    this.onActiveChange(this.getActiveClip());
  }

  updateActiveTimestamps(start, end, recordHistory = false) {
    const active = this.getActiveClip();
    if (active) {
      if (recordHistory) this.pushHistory();
      active.start_time = Math.max(0, start);
      active.end_time = Math.min(this.totalDuration || 999999, Math.max(start + 0.5, end));
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

    const { h: startH, m: startM, s: startS } = this._splitHMS(clip.start_time);
    const { h: endH, m: endM, s: endS } = this._splitHMS(clip.end_time);
    const duration = Math.max(0, clip.end_time - clip.start_time);

    const inStartH = tr.querySelector('.clip-start-h');
    const inStartM = tr.querySelector('.clip-start-m');
    const inStartS = tr.querySelector('.clip-start-s');
    const inEndH = tr.querySelector('.clip-end-h');
    const inEndM = tr.querySelector('.clip-end-m');
    const inEndS = tr.querySelector('.clip-end-s');
    const durCell = tr.querySelector('.clip-duration-cell');

    if (inStartH && document.activeElement !== inStartH) inStartH.value = String(startH).padStart(2, '0');
    if (inStartM && document.activeElement !== inStartM) inStartM.value = String(startM).padStart(2, '0');
    if (inStartS && document.activeElement !== inStartS) inStartS.value = String(startS).padStart(2, '0');
    if (inEndH && document.activeElement !== inEndH) inEndH.value = String(endH).padStart(2, '0');
    if (inEndM && document.activeElement !== inEndM) inEndM.value = String(endM).padStart(2, '0');
    if (inEndS && document.activeElement !== inEndS) inEndS.value = String(endS).padStart(2, '0');
    if (durCell) durCell.textContent = this._formatDurationHMS(duration);
  }

  batchRename(prefix = "Clip") {
    this.pushHistory();
    this.clips.forEach((c, idx) => {
      c.name = `${prefix} ${idx + 1}`;
    });
    this.render();
    this.onListChange(this.clips, this.activeClipId);
  }

  sortByStartTime() {
    this.pushHistory();
    this.clips.sort((a, b) => a.start_time - b.start_time);
    this.render();
    this.onListChange(this.clips, this.activeClipId);
  }

  render() {
    this.tableBody.innerHTML = '';
    this.clips.forEach((clip, index) => {
      const duration = Math.max(0, clip.end_time - clip.start_time);
      const isSelected = clip.id === this.activeClipId;
      const { h: startH, m: startM, s: startS } = this._splitHMS(clip.start_time);
      const { h: endH, m: endM, s: endS } = this._splitHMS(clip.end_time);

      const tr = document.createElement('tr');
      tr.dataset.clipId = clip.id;
      if (isSelected) tr.style.backgroundColor = 'var(--bg-card)';

      tr.innerHTML = `
        <td style="font-weight: 700; color: var(--text-muted); width: 36px;">${index + 1}</td>
        <td>
          <input type="text" class="clip-name-input" value="${clip.name}" data-id="${clip.id}">
        </td>
        <td>
          <div class="clip-time-group" title="Set start time (Hours, Minutes, Seconds)">
            <input type="number" min="0" max="99" class="clip-time-input clip-start-h" value="${String(startH).padStart(2, '0')}" data-id="${clip.id}">
            <span class="clip-time-unit">h</span>
            <input type="number" min="0" max="59" class="clip-time-input clip-start-m" value="${String(startM).padStart(2, '0')}" data-id="${clip.id}">
            <span class="clip-time-unit">m</span>
            <input type="number" min="0" max="59" class="clip-time-input clip-start-s" value="${String(startS).padStart(2, '0')}" data-id="${clip.id}">
            <span class="clip-time-unit">s</span>
          </div>
        </td>
        <td>
          <div class="clip-time-group" title="Set end time (Hours, Minutes, Seconds)">
            <input type="number" min="0" max="99" class="clip-time-input clip-end-h" value="${String(endH).padStart(2, '0')}" data-id="${clip.id}">
            <span class="clip-time-unit">h</span>
            <input type="number" min="0" max="59" class="clip-time-input clip-end-m" value="${String(endM).padStart(2, '0')}" data-id="${clip.id}">
            <span class="clip-time-unit">m</span>
            <input type="number" min="0" max="59" class="clip-time-input clip-end-s" value="${String(endS).padStart(2, '0')}" data-id="${clip.id}">
            <span class="clip-time-unit">s</span>
          </div>
        </td>
        <td class="clip-duration-cell" style="font-family: var(--font-mono); color: var(--accent-orange); font-weight: 700; white-space: nowrap;">
          ${this._formatDurationHMS(duration)}
        </td>
        <td>
          <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm btn-preview" data-id="${clip.id}" title="Preview selection on video player">
              ▶ Preview
            </button>
            <button class="btn btn-secondary btn-sm btn-duplicate" data-id="${clip.id}" title="Duplicate clip (Ctrl+D)">
              📋 Copy
            </button>
            <button class="btn btn-primary btn-sm btn-export" data-id="${clip.id}" title="Export this clip">
              Export
            </button>
            <button class="btn btn-danger btn-sm btn-delete" data-id="${clip.id}" title="${this.clips.length <= 1 ? 'At least one clip must be retained' : 'Delete clip (Del)'}" ${this.clips.length <= 1 ? 'disabled style="opacity: 0.35; cursor: not-allowed;"' : ''}>
              ✕
            </button>
          </div>
        </td>
      `;

      // Row Selection
      tr.addEventListener('click', (e) => {
        if (!e.target.closest('button') && !e.target.closest('input')) {
          this.setActiveClip(clip.id);
        }
      });

      // Name editing
      const nameInput = tr.querySelector('.clip-name-input');
      nameInput.addEventListener('change', (e) => {
        this.pushHistory();
        clip.name = e.target.value.trim() || `Clip ${index + 1}`;
        this.onListChange(this.clips, this.activeClipId);
      });

      // Start & End inputs
      const inStartH = tr.querySelector('.clip-start-h');
      const inStartM = tr.querySelector('.clip-start-m');
      const inStartS = tr.querySelector('.clip-start-s');
      const inEndH = tr.querySelector('.clip-end-h');
      const inEndM = tr.querySelector('.clip-end-m');
      const inEndS = tr.querySelector('.clip-end-s');
      const durCell = tr.querySelector('.clip-duration-cell');

      const handleTimeChange = () => {
        let sh = parseInt(inStartH.value, 10) || 0;
        let sm = parseInt(inStartM.value, 10) || 0;
        let ss = parseInt(inStartS.value, 10) || 0;

        let eh = parseInt(inEndH.value, 10) || 0;
        let em = parseInt(inEndM.value, 10) || 0;
        let es = parseInt(inEndS.value, 10) || 0;

        if (sm > 59) sm = 59;
        if (ss > 59) ss = 59;
        if (em > 59) em = 59;
        if (es > 59) es = 59;

        let newStart = sh * 3600 + sm * 60 + ss;
        let newEnd = eh * 3600 + em * 60 + es;

        if (newEnd <= newStart) {
          newEnd = newStart + 1;
          const { h: adjH, m: adjM, s: adjS } = this._splitHMS(newEnd);
          inEndH.value = String(adjH).padStart(2, '0');
          inEndM.value = String(adjM).padStart(2, '0');
          inEndS.value = String(adjS).padStart(2, '0');
        }

        clip.start_time = newStart;
        clip.end_time = newEnd;

        durCell.textContent = this._formatDurationHMS(newEnd - newStart);
        this.onListChange(this.clips, this.activeClipId);
        if (clip.id === this.activeClipId) {
          this.onActiveChange(clip);
        }
      };

      [inStartH, inStartM, inStartS, inEndH, inEndM, inEndS].forEach(inp => {
        inp.addEventListener('input', handleTimeChange);
        inp.addEventListener('focus', () => {
          this.pushHistory();
        });
        inp.addEventListener('blur', () => {
          let v = parseInt(inp.value, 10) || 0;
          inp.value = String(v).padStart(2, '0');
        });
      });

      tr.querySelector('.btn-preview').addEventListener('click', () => {
        this.setActiveClip(clip.id);
        this.onPreviewClip(clip);
      });

      tr.querySelector('.btn-duplicate').addEventListener('click', () => {
        this.duplicateClip(clip.id);
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

  _splitHMS(seconds) {
    const totalSec = Math.floor(seconds || 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return { h, m, s };
  }

  _formatDurationHMS(seconds) {
    const totalSec = Math.floor(seconds || 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    }
    if (m > 0) {
      return `${m}m ${String(s).padStart(2, '0')}s`;
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
