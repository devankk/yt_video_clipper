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
      this.render();
      this.onListChange(this.clips, this.activeClipId);
    }
  }

  render() {
    this.tableBody.innerHTML = '';
    this.clips.forEach((clip, index) => {
      const duration = Math.max(0, clip.end_time - clip.start_time);
      const isSelected = clip.id === this.activeClipId;

      const tr = document.createElement('tr');
      if (isSelected) tr.style.backgroundColor = 'var(--bg-card)';

      tr.innerHTML = `
        <td style="font-weight: 700; color: var(--text-muted); width: 40px;">${index + 1}</td>
        <td>
          <input type="text" class="clip-name-input" value="${clip.name}" data-id="${clip.id}">
        </td>
        <td style="font-family: var(--font-mono);">${this._formatTime(clip.start_time)}</td>
        <td style="font-family: var(--font-mono);">${this._formatTime(clip.end_time)}</td>
        <td style="font-family: var(--font-mono); color: var(--accent-orange); font-weight: 700;">
          ${this._formatTime(duration)}
        </td>
        <td>
          <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm btn-preview" data-id="${clip.id}" title="Preview selection">
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

  _formatTime(seconds) {
    const totalSec = Math.floor(seconds);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
