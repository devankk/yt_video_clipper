/**
 * Application Orchestrator & State Coordination
 */
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const urlInput = document.getElementById('video-url-input');
  const btnLoad = document.getElementById('btn-load-video');
  const btnPaste = document.getElementById('btn-paste-url');
  const btnUploadLocal = document.getElementById('btn-upload-local');
  const fileInput = document.getElementById('local-file-input');

  // Video Metadata Elements
  const videoTitleEl = document.getElementById('video-title');
  const durationBadge = document.getElementById('meta-duration');
  const resolutionBadge = document.getElementById('meta-resolution');
  const streamTypeBadge = document.getElementById('meta-stream-type');

  // Timestamp Input Fields
  const startH = document.getElementById('start-h');
  const startM = document.getElementById('start-m');
  const startS = document.getElementById('start-s');
  const endH = document.getElementById('end-h');
  const endM = document.getElementById('end-m');
  const endS = document.getElementById('end-s');

  const selectedDurationEl = document.getElementById('selected-duration-badge');
  const btnSetStart = document.getElementById('btn-set-start');
  const btnSetEnd = document.getElementById('btn-set-end');
  const btnPreviewClip = document.getElementById('btn-preview-clip');
  const btnExportCurrent = document.getElementById('btn-export-current');
  const btnExportBatch = document.getElementById('btn-export-batch');
  const btnAddClip = document.getElementById('btn-add-clip');

  // Timeline Zoom Controls
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomReset = document.getElementById('btn-zoom-reset');

  // Export Mode & Quality Selectors
  const exportModeSelect = document.getElementById('export-mode-select');
  const exportQualitySelect = document.getElementById('export-quality-select');

  // Modal Elements
  const exportModal = document.getElementById('export-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalStatus = document.getElementById('modal-status');
  const progressBar = document.getElementById('progress-bar-fill');
  const progressPct = document.getElementById('progress-pct');
  const modalActions = document.getElementById('modal-actions');
  const btnCloseModal = document.getElementById('btn-close-modal');

  let currentVideoData = null;

  // Modern Non-Blocking Toast Notification System
  function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '⚠' : type === 'warning' ? '!' : 'ℹ';
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-msg">${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
  window.showToast = showToast;

  // Initialize Player
  const player = new VideoPlayerController();

  // Initialize Timeline
  const timeline = new TimelineEditor('timeline-viewport', {
    onClipChange: (clip, action) => {
      if (action === 'select' || action === 'update') {
        clipManager.setActiveClip(clip.id);
        syncInputsFromClip(clip);
      }
    },
    onSeek: (targetTime) => {
      player.seekTo(targetTime);
    }
  });

  // Initialize Clip Manager
  const clipManager = new ClipManager({
    onActiveChange: (activeClip) => {
      if (activeClip) {
        syncInputsFromClip(activeClip);
        timeline.setClips(clipManager.clips, activeClip.id);
      }
    },
    onListChange: (clips, activeId) => {
      timeline.setClips(clips, activeId);
    },
    onPreviewClip: (clip) => {
      player.previewRange(clip.start_time, clip.end_time);
    },
    onExportSingle: (clip) => {
      triggerSingleExport(clip);
    }
  });

  // Sync playhead during playback
  player.onTimeUpdate((currentTime) => {
    timeline.setPlayheadTime(currentTime);
  });

  // URL Loading Action
  btnLoad.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      showToast("Please enter a YouTube video or livestream URL.", "warning");
      return;
    }

    try {
      btnLoad.disabled = true;
      btnLoad.textContent = "Loading...";

      const info = await API.getVideoInfo(url);
      currentVideoData = info;

      // Update UI Header
      videoTitleEl.textContent = info.title;
      durationBadge.textContent = info.duration_formatted;
      resolutionBadge.textContent = info.formats[0]?.resolution || "1080p";
      streamTypeBadge.textContent = info.is_completed_live ? "Completed Livestream" : "Standard Video";

      // Populate Quality Dropdown with all available YouTube stream resolutions
      if (exportQualitySelect && info.formats && info.formats.length > 0) {
        const topFmt = info.formats[0];
        const topLabel = topFmt.fps ? `${topFmt.resolution} (${topFmt.fps}fps)` : topFmt.resolution;
        exportQualitySelect.innerHTML = `<option value="highest" selected>Highest Available (${topLabel})</option>`;
        const addedHeights = new Set();
        info.formats.forEach(f => {
          let height = null;
          if (f.resolution) {
            const parts = f.resolution.split('x');
            const target = parts.length === 2 ? parts[1] : parts[0];
            const digits = target.match(/\d+/);
            if (digits) height = digits[0];
          }
          if (height && !addedHeights.has(height)) {
            addedHeights.add(height);
            const opt = document.createElement('option');
            opt.value = height;
            opt.textContent = `${height}p${f.fps ? ` (${f.fps}fps)` : ''}`;
            exportQualitySelect.appendChild(opt);
          }
        });
      }

      // Load YouTube Player
      player.loadYouTube(info.video_id);

      // Initialize Timeline & Clips
      timeline.setDuration(info.duration);
      clipManager.setTotalDuration(info.duration);

      const active = clipManager.getActiveClip();
      if (active) syncInputsFromClip(active);

      showToast("Video loaded successfully!", "success");

    } catch (err) {
      showToast(err.message || "Could not load video. Check the link and try again.", "error");
    } finally {
      btnLoad.disabled = false;
      btnLoad.textContent = "Load Video";
    }
  });

  // Paste from clipboard
  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text;
        btnLoad.click();
      }
    } catch (e) {
      urlInput.focus();
    }
  });

  // Local File Upload
  btnUploadLocal.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      btnUploadLocal.disabled = true;
      btnUploadLocal.textContent = "Uploading...";

      const info = await API.uploadVideoFile(file);
      currentVideoData = info;

      videoTitleEl.textContent = info.title;
      durationBadge.textContent = info.duration_formatted;
      resolutionBadge.textContent = info.formats[0]?.resolution || "Original";
      streamTypeBadge.textContent = "Local File";

      const fileUrl = URL.createObjectURL(file);
      player.loadLocal(fileUrl);

      timeline.setDuration(info.duration);
      clipManager.setTotalDuration(info.duration);

      const active = clipManager.getActiveClip();
      if (active) syncInputsFromClip(active);

      showToast("Local file loaded successfully!", "success");

    } catch (err) {
      showToast(err.message || "Failed to load local file.", "error");
    } finally {
      btnUploadLocal.disabled = false;
      btnUploadLocal.textContent = "Upload Local File";
    }
  });

  // Timeline Zoom Controls
  btnZoomIn.addEventListener('click', () => timeline.setZoom(timeline.zoom * 1.5));
  btnZoomOut.addEventListener('click', () => timeline.setZoom(timeline.zoom / 1.5));
  btnZoomReset.addEventListener('click', () => timeline.setZoom(1.0));

  // "+ Add Clip" (Default 2 minutes / 120 seconds per Option 2)
  btnAddClip.addEventListener('click', () => {
    const current = player.getCurrentTime();
    const clip = clipManager.addClip(current, Math.min(timeline.totalDuration, current + 120));
    syncInputsFromClip(clip);
    showToast(`Added ${clip.name}`, "info");
  });

  // "Set Start" & "Set End"
  btnSetStart.addEventListener('click', () => {
    const curr = Math.round(player.getCurrentTime() * 10) / 10;
    const active = clipManager.getActiveClip();
    if (active) {
      if (curr >= active.end_time) {
        active.end_time = Math.min(timeline.totalDuration, curr + 10);
      }
      active.start_time = curr;
      clipManager.render();
      syncInputsFromClip(active);
    }
  });

  btnSetEnd.addEventListener('click', () => {
    const curr = Math.round(player.getCurrentTime() * 10) / 10;
    const active = clipManager.getActiveClip();
    if (active) {
      if (curr <= active.start_time) {
        showToast("End time cannot be earlier than start time.", "warning");
        return;
      }
      active.end_time = curr;
      clipManager.render();
      syncInputsFromClip(active);
    }
  });

  // "Preview Clip"
  btnPreviewClip.addEventListener('click', () => {
    const active = clipManager.getActiveClip();
    if (active) {
      player.previewRange(active.start_time, active.end_time);
    }
  });

  // Numerical inputs change handlers with validation
  const timeInputs = [startH, startM, startS, endH, endM, endS];
  const handleNumericInputs = () => {
    const startSec = (parseInt(startH.value, 10) || 0) * 3600 + (parseInt(startM.value, 10) || 0) * 60 + (parseInt(startS.value, 10) || 0);
    const endSec = (parseInt(endH.value, 10) || 0) * 3600 + (parseInt(endM.value, 10) || 0) * 60 + (parseInt(endS.value, 10) || 0);

    if (endSec > startSec) {
      timeInputs.forEach(el => el.classList.remove('is-invalid'));
      selectedDurationEl.classList.remove('is-invalid-text');
      btnExportCurrent.disabled = false;
      btnPreviewClip.disabled = false;
      clipManager.updateActiveTimestamps(startSec, endSec);
      updateDurationBadge(endSec - startSec);
    } else {
      timeInputs.forEach(el => el.classList.add('is-invalid'));
      selectedDurationEl.classList.add('is-invalid-text');
      selectedDurationEl.textContent = "End time must be after Start time";
      btnExportCurrent.disabled = true;
      btnPreviewClip.disabled = true;
    }
  };

  // Keyboard Steppers & Auto-Padding
  timeInputs.forEach(el => {
    el.addEventListener('input', handleNumericInputs);

    el.addEventListener('keydown', (e) => {
      let val = parseInt(el.value, 10) || 0;
      const isHour = el.id.includes('-h');
      const maxVal = isHour ? 99 : 59;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        val = val >= maxVal ? 0 : val + 1;
        el.value = val.toString().padStart(2, '0');
        handleNumericInputs();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        val = val <= 0 ? maxVal : val - 1;
        el.value = val.toString().padStart(2, '0');
        handleNumericInputs();
      }
    });

    el.addEventListener('blur', () => {
      let val = parseInt(el.value, 10) || 0;
      el.value = Math.max(0, val).toString().padStart(2, '0');
      handleNumericInputs();
    });
  });

  function syncInputsFromClip(clip) {
    const s = Math.floor(clip.start_time);
    startH.value = Math.floor(s / 3600).toString().padStart(2, '0');
    startM.value = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    startS.value = (s % 60).toString().padStart(2, '0');

    const e = Math.floor(clip.end_time);
    endH.value = Math.floor(e / 3600).toString().padStart(2, '0');
    endM.value = Math.floor((e % 3600) / 60).toString().padStart(2, '0');
    endS.value = (e % 60).toString().padStart(2, '0');

    timeInputs.forEach(el => el.classList.remove('is-invalid'));
    selectedDurationEl.classList.remove('is-invalid-text');
    btnExportCurrent.disabled = false;
    btnPreviewClip.disabled = false;

    updateDurationBadge(clip.end_time - clip.start_time);
  }

  function updateDurationBadge(durationSec) {
    const dur = Math.max(0, Math.floor(durationSec));
    const h = Math.floor(dur / 3600);
    const m = Math.floor((dur % 3600) / 60);
    const s = dur % 60;
    if (h > 0) {
      selectedDurationEl.textContent = `${h}h ${m}m ${s}s (${dur} seconds)`;
    } else if (m > 0) {
      selectedDurationEl.textContent = `${m}m ${s}s (${dur} seconds)`;
    } else {
      selectedDurationEl.textContent = `${s} seconds`;
    }
  }

  // Single Clip Export Trigger
  btnExportCurrent.addEventListener('click', () => {
    const active = clipManager.getActiveClip();
    if (active) triggerSingleExport(active);
  });

  async function triggerSingleExport(clip) {
    const url = urlInput.value.trim();
    if (!url) {
      showToast("Please enter a YouTube video URL first.", "warning");
      return;
    }

    openModal("Exporting Clip", "Initiating high-speed export...");

    try {
      if (!currentVideoData) {
        updateModalProgress(10, "Fetching video metadata...");
        currentVideoData = await API.getVideoInfo(url);
      }

      const mode = exportModeSelect.value;
      const quality = exportQualitySelect ? exportQualitySelect.value : "highest";
      const resp = await API.exportClip({
        url: url,
        video_id: currentVideoData.video_id,
        clip: clip,
        mode: mode,
        quality: quality
      });

      API.trackJobProgress(
        resp.job_id,
        (data) => {
          updateModalProgress(data.progress, data.stage_message);
        },
        (completed) => {
          showDownloadLink(completed.download_url, completed.filename);
        },
        (err) => {
          showModalError(err.message);
        }
      );
    } catch (e) {
      showModalError(e.message);
    }
  }

  // Batch Export Trigger
  btnExportBatch.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      showToast("Please enter a YouTube video URL first.", "warning");
      return;
    }
    if (clipManager.clips.length === 0) {
      showToast("Please add at least one clip range.", "warning");
      return;
    }

    const mode = exportModeSelect.value;
    const quality = exportQualitySelect ? exportQualitySelect.value : "highest";
    openModal("Exporting All Clips", `Processing batch of ${clipManager.clips.length} clips...`);

    try {
      if (!currentVideoData) {
        updateModalProgress(10, "Fetching video metadata...");
        currentVideoData = await API.getVideoInfo(url);
      }

      const resp = await API.exportBatch({
        url: url,
        video_id: currentVideoData.video_id,
        title: currentVideoData.title,
        clips: clipManager.clips,
        mode: mode,
        quality: quality
      });

      API.trackJobProgress(
        resp.job_id,
        (data) => {
          updateModalProgress(data.progress, data.stage_message);
        },
        (completed) => {
          showDownloadLink(completed.zip_url || completed.download_url, completed.filename || "Clips_Package.zip");
        },
        (err) => {
          showModalError(err.message);
        }
      );
    } catch (e) {
      showModalError(e.message);
    }
  });

  // Modal helpers
  function openModal(title, initialStatus) {
    modalTitle.textContent = title;
    modalStatus.textContent = initialStatus;
    progressBar.style.width = '0%';
    progressPct.textContent = '0%';
    modalActions.innerHTML = '';
    exportModal.classList.add('active');
  }

  function updateModalProgress(pct, status) {
    progressBar.style.width = `${pct}%`;
    progressPct.textContent = `${pct}%`;
    modalStatus.textContent = status;
  }

  function showDownloadLink(downloadUrl, filename) {
    modalStatus.textContent = "Export completed successfully!";
    progressBar.style.width = '100%';
    progressPct.textContent = '100%';

    modalActions.innerHTML = `
      <a href="${downloadUrl}" download="${filename}" class="btn btn-primary" style="text-decoration: none; font-size: 0.95rem; padding: 0.65rem 1.25rem;">
        ⬇ Download ${filename}
      </a>
      <button class="btn btn-secondary" onclick="document.getElementById('export-modal').classList.remove('active')">
        Close
      </button>
    `;

    // Trigger immediate browser download
    try {
      const autoLink = document.createElement('a');
      autoLink.href = downloadUrl;
      autoLink.download = filename;
      document.body.appendChild(autoLink);
      autoLink.click();
      document.body.removeChild(autoLink);
    } catch (e) {
      console.warn("Auto-download trigger", e);
    }
  }

  function showModalError(errMsg) {
    modalStatus.innerHTML = `<span style="color: var(--status-red);">${errMsg}</span>`;
    modalActions.innerHTML = `
      <button class="btn btn-secondary" onclick="document.getElementById('export-modal').classList.remove('active')">
        Close
      </button>
    `;
  }

  btnCloseModal.addEventListener('click', () => {
    exportModal.classList.remove('active');
  });

  // Automatically load the designated test video on initial startup
  urlInput.value = "https://www.youtube.com/watch?v=MMyh5bX84Js";
  setTimeout(() => {
    btnLoad.click();
  }, 300);
});
