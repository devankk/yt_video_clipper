/**
 * Application Orchestrator & State Coordination
 * Professional NLE Workflow, Keyboard Engine & LocalStorage Persistence
 */
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const urlInput = document.getElementById('video-url-input');
  const btnLoad = document.getElementById('btn-load-video');
  const btnPaste = document.getElementById('btn-paste-url');
  const btnUploadLocal = document.getElementById('btn-upload-local');
  const fileInput = document.getElementById('local-file-input');
  const btnNewProject = document.getElementById('btn-new-project');
  const btnShortcuts = document.getElementById('btn-shortcuts');
  const shortcutsModal = document.getElementById('shortcuts-modal');
  const btnCloseShortcutsModal = document.getElementById('btn-close-shortcuts-modal');
  const engineBadge = document.getElementById('engine-badge');
  const engineModal = document.getElementById('engine-modal');
  const btnCloseEngineModal = document.getElementById('btn-close-engine-modal');

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

  // Timeline Action Controls
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnSplitClip = document.getElementById('btn-split-clip');
  const btnToggleSnap = document.getElementById('btn-toggle-snap');
  const btnFitScreen = document.getElementById('btn-fit-screen');
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

  // Persistent Project Key
  const STORAGE_KEY = 'streamcutter_project_state_v1';
  let currentVideoData = null;

  // Modern Non-Blocking Toast Notification System (Positioned at bottom-right)
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
    }, 3200);
  }
  window.showToast = showToast;

  // Initialize Unified Player Controller
  const player = new VideoPlayerController();

  // Initialize Timeline Editor
  const timeline = new TimelineEditor('timeline-viewport', {
    onClipChange: (clip, action) => {
      if (action === 'select' || action === 'update') {
        clipManager.setActiveClip(clip.id);
        syncInputsFromClip(clip);
        saveProjectState();
      } else if (action === 'commit') {
        clipManager.pushHistory();
        saveProjectState();
      }
    },
    onSeek: (targetTime) => {
      player.seekTo(targetTime);
    },
    onClipAction: (action, clip, cursorTime) => {
      handleTimelineClipAction(action, clip, cursorTime);
    }
  });

  // Initialize Clip Manager with Undo/Redo
  const clipManager = new ClipManager({
    onActiveChange: (activeClip) => {
      if (activeClip) {
        syncInputsFromClip(activeClip);
        timeline.setClips(clipManager.clips, activeClip.id);
        saveProjectState();
      }
    },
    onListChange: (clips, activeId) => {
      timeline.setClips(clips, activeId);
      saveProjectState();
    },
    onPreviewClip: (clip) => {
      player.previewRange(clip.start_time, clip.end_time, clip.name);
    },
    onExportSingle: (clip) => {
      triggerSingleExport(clip);
    },
    onHistoryChange: (canUndo, canRedo) => {
      if (btnUndo) btnUndo.disabled = !canUndo;
      if (btnRedo) btnRedo.disabled = !canRedo;
    }
  });

  // Sync playhead and auto-follow during playback
  player.onTimeUpdate((currentTime) => {
    timeline.setPlayheadTime(currentTime, player.isPlaying);
  });

  // Dynamic duration synchronization from player
  player.onDurationChange((dur) => {
    if (dur && dur > 0) {
      durationBadge.textContent = formatSeconds(dur);
      timeline.setDuration(dur);
      clipManager.setTotalDuration(dur);
      if (currentVideoData) {
        currentVideoData.duration = dur;
        currentVideoData.duration_formatted = formatSeconds(dur);
        saveProjectState();
      }
    }
  });

  function extractYouTubeVideoId(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    const regex = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|live\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
    const match = trimmed.match(regex);
    if (match && match[1]) {
      return match[1];
    }
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  function formatSeconds(seconds) {
    const totalSec = Math.floor(seconds || 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Handle Context Menu Actions on Timeline
  function handleTimelineClipAction(action, clip, cursorTime) {
    if (action === 'split') {
      const splitTime = cursorTime || Math.round(player.getCurrentTime());
      if (splitTime <= clip.start_time + 0.5 || splitTime >= clip.end_time - 0.5) {
        showToast("Cannot split at the edge of the clip", "warning");
        return;
      }
      clipManager.pushHistory();
      const oldEnd = clip.end_time;
      clip.end_time = splitTime;
      const newClip = clipManager.addClip(splitTime, oldEnd, `${clip.name} (Part 2)`, false);
      clipManager.render();
      timeline.setClips(clipManager.clips, newClip.id);
      syncInputsFromClip(newClip);
      showToast(`✂️ Split clip at ${formatSeconds(splitTime)}`, "success");
    } else if (action === 'duplicate') {
      const copy = clipManager.duplicateClip(clip.id);
      showToast(`📋 Duplicated ${copy.name}`, "success");
    } else if (action === 'preview') {
      player.previewRange(clip.start_time, clip.end_time, clip.name);
    } else if (action === 'export') {
      triggerSingleExport(clip);
    } else if (action === 'delete') {
      clipManager.removeClip(clip.id);
      showToast(`Deleted ${clip.name}`, "info");
    }
  }

  // URL Loading Action
  async function loadVideoByUrl() {
    const url = urlInput.value.trim();
    if (!url) {
      showToast("Please enter a YouTube video or livestream URL.", "warning");
      return;
    }

    const videoId = extractYouTubeVideoId(url);

    // If it's a YouTube link, mount the player immediately without waiting for backend
    if (videoId) {
      videoTitleEl.textContent = `Loading YouTube video (${videoId})...`;
      streamTypeBadge.textContent = "YouTube Stream";
      player.loadYouTube(videoId);

      if (!timeline.totalDuration || timeline.totalDuration <= 0) {
        timeline.setDuration(3600);
        clipManager.setTotalDuration(3600);
      }
    }

    try {
      btnLoad.disabled = true;
      btnLoad.textContent = "Loading...";

      const info = await API.getVideoInfo(url);
      currentVideoData = info;

      videoTitleEl.textContent = info.title;
      durationBadge.textContent = info.duration_formatted;
      resolutionBadge.textContent = info.formats[0]?.resolution || "1080p";
      streamTypeBadge.textContent = info.is_completed_live ? "Completed Livestream" : "Standard Video";

      if (exportQualitySelect && info.formats && info.formats.length > 0) {
        const topFmt = info.formats[0];
        const topLabel = topFmt.fps ? `${topFmt.resolution} (${topFmt.fps}fps)` : topFmt.resolution;
        exportQualitySelect.innerHTML = `<option value="highest" selected>Highest Available (${topLabel})</option>`;
        info.formats.forEach((f) => {
          const opt = document.createElement('option');
          opt.value = f.height ? String(f.height) : f.format_id;
          opt.textContent = `${f.resolution} (${f.fps ? f.fps + 'fps' : 'Auto'})`;
          exportQualitySelect.appendChild(opt);
        });
      }

      timeline.setDuration(info.duration);
      clipManager.setTotalDuration(info.duration);

      const active = clipManager.getActiveClip();
      if (active) syncInputsFromClip(active);

      saveProjectState();
      showToast("Video loaded successfully!", "success");

    } catch (err) {
      if (videoId) {
        currentVideoData = {
          video_id: videoId,
          title: `YouTube Video (${videoId})`,
          duration: player.getDuration() || 3600,
          duration_formatted: formatSeconds(player.getDuration() || 3600),
          formats: [{ resolution: "1080p", fps: 60 }]
        };
        videoTitleEl.textContent = currentVideoData.title;
        durationBadge.textContent = currentVideoData.duration_formatted;
        showToast("Connected to YouTube stream player.", "success");
        saveProjectState();
      } else {
        showToast(err.message || "Could not load video. Check the link and try again.", "error");
      }
    } finally {
      btnLoad.disabled = false;
      btnLoad.textContent = "Load Video";
    }
  }

  btnLoad.addEventListener('click', loadVideoByUrl);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadVideoByUrl();
    }
  });

  // Paste from clipboard (Populate & Focus without auto-submitting)
  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        urlInput.focus();
        showToast("Link pasted. Click 'Load Video' to inspect stream.", "info");
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

      saveProjectState();
      showToast("Local file loaded successfully!", "success");

    } catch (err) {
      showToast(err.message || "Failed to load local file.", "error");
    } finally {
      btnUploadLocal.disabled = false;
      btnUploadLocal.textContent = "Upload File";
    }
  });

  // Undo / Redo Actions
  if (btnUndo) {
    btnUndo.addEventListener('click', () => {
      if (clipManager.undo()) {
        showToast("↩ Undo", "info");
      }
    });
  }

  if (btnRedo) {
    btnRedo.addEventListener('click', () => {
      if (clipManager.redo()) {
        showToast("↪ Redo", "info");
      }
    });
  }

  // Timeline Zoom Controls
  btnZoomIn.addEventListener('click', () => timeline.setZoom(timeline.zoom * 1.5));
  btnZoomOut.addEventListener('click', () => timeline.setZoom(timeline.zoom / 1.5));
  btnZoomReset.addEventListener('click', () => timeline.setZoom(1.0));

  // "+ Add Clip"
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
      clipManager.pushHistory();
      if (curr >= active.end_time) {
        active.end_time = Math.min(timeline.totalDuration, curr + 10);
      }
      active.start_time = curr;
      clipManager.render();
      syncInputsFromClip(active);
      saveProjectState();
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
      clipManager.pushHistory();
      active.end_time = curr;
      clipManager.render();
      syncInputsFromClip(active);
      saveProjectState();
    }
  });

  // "Preview Clip"
  btnPreviewClip.addEventListener('click', () => {
    const active = clipManager.getActiveClip();
    if (active) {
      player.previewRange(active.start_time, active.end_time, active.name);
    }
  });

  // Professional NLE Timeline Toolbar Controls
  if (btnSplitClip) {
    btnSplitClip.addEventListener('click', () => {
      const splitResult = timeline.splitAtPlayhead();
      if (!splitResult) {
        showToast("Position playhead inside a clip to split.", "warning");
        return;
      }
      clipManager.pushHistory();
      const orig = splitResult.originalClip;
      const oldEnd = orig.end_time;
      const splitSec = Math.round(splitResult.splitTime);

      orig.end_time = splitSec;
      const newClip = clipManager.addClip(splitSec, oldEnd, `${orig.name} (Part 2)`, false);
      clipManager.render();
      timeline.setClips(clipManager.clips, newClip.id);
      syncInputsFromClip(newClip);
      showToast(`✂️ Split into ${orig.name} & ${newClip.name}`, "success");
    });
  }

  if (btnToggleSnap) {
    btnToggleSnap.addEventListener('click', () => {
      const isSnap = timeline.toggleSnapping();
      btnToggleSnap.textContent = isSnap ? "🧲 Snap: ON" : "🧲 Snap: OFF";
      btnToggleSnap.classList.toggle('active', isSnap);
      showToast(`Magnetic Snapping ${isSnap ? "Enabled" : "Disabled"}`, "info");
    });
  }

  if (btnFitScreen) {
    btnFitScreen.addEventListener('click', () => {
      timeline.fitToScreen();
      showToast("Fitted timeline to view.", "info");
    });
  }

  // Persistent Player / Floating Mini-Dock on Deep Scroll
  const playerPanel = document.getElementById('player-panel');
  const playerStage = document.getElementById('player-stage');
  const pipBadge = document.getElementById('pip-badge');
  const btnPipRestore = document.getElementById('btn-pip-restore');

  let isDocked = false;
  window.addEventListener('scroll', () => {
    if (!playerPanel || !playerStage) return;
    const rect = playerPanel.getBoundingClientRect();
    if (rect.bottom < 80 && !isDocked) {
      isDocked = true;
      playerStage.classList.add('is-floating-docked');
      if (pipBadge) pipBadge.style.display = 'flex';
    } else if (rect.bottom >= 80 && isDocked) {
      isDocked = false;
      playerStage.classList.remove('is-floating-docked');
      if (pipBadge) pipBadge.style.display = 'none';
    }
  }, { passive: true });

  if (btnPipRestore) {
    btnPipRestore.addEventListener('click', (e) => {
      e.stopPropagation();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

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
      saveProjectState();
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
    clipManager.syncInputsForClip(clip);
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
    let active = clipManager.getActiveClip();
    if (!active) {
      const sH = parseInt(startH.value || '0', 10);
      const sM = parseInt(startM.value || '0', 10);
      const sS = parseInt(startS.value || '0', 10);
      const eH = parseInt(endH.value || '0', 10);
      const eM = parseInt(endM.value || '0', 10);
      const eS = parseInt(endS.value || '0', 10);
      const sTotal = sH * 3600 + sM * 60 + sS;
      const eTotal = eH * 3600 + eM * 60 + eS;
      active = clipManager.addClip(sTotal, Math.max(sTotal + 1, eTotal || (sTotal + 60)), "Clip 1");
    }
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
      const mode = exportModeSelect.value;
      const quality = exportQualitySelect ? exportQualitySelect.value : "highest";
      const vidId = currentVideoData?.video_id || extractYouTubeVideoId(url);

      const resp = await API.exportClip({
        url: url,
        video_id: vidId,
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
      const vidId = currentVideoData?.video_id || extractYouTubeVideoId(url);
      const title = currentVideoData?.title || "Livestream_Clips";

      const resp = await API.exportBatch({
        url: url,
        video_id: vidId,
        title: title,
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
    if (modalTitle) modalTitle.textContent = title;
    if (modalStatus) modalStatus.textContent = initialStatus;
    if (progressBar) progressBar.style.width = '0%';
    if (progressPct) progressPct.textContent = '0%';
    if (modalActions) modalActions.innerHTML = '';
    if (exportModal) exportModal.classList.add('active');
  }

  function updateModalProgress(pct, status) {
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressPct) progressPct.textContent = `${pct}%`;
    if (modalStatus) modalStatus.textContent = status;
  }

  function showDownloadLink(downloadUrl, filename) {
    if (modalStatus) modalStatus.textContent = "Export completed successfully!";
    if (progressBar) progressBar.style.width = '100%';
    if (progressPct) progressPct.textContent = '100%';

    if (modalActions) {
      modalActions.innerHTML = `
        <a href="${downloadUrl}" download="${filename}" class="btn btn-primary" style="text-decoration: none; font-size: 0.95rem; padding: 0.65rem 1.25rem;">
          ⬇ Download ${filename}
        </a>
        <button class="btn btn-secondary" onclick="document.getElementById('export-modal').classList.remove('active')">
          Close
        </button>
      `;
    }

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
    if (modalStatus) {
      modalStatus.innerHTML = `<span style="color: var(--status-red);">${errMsg}</span>`;
    }
    let actions = `<button class="btn btn-secondary" onclick="document.getElementById('export-modal').classList.remove('active')">Close</button>`;
    if (errMsg.includes('datacenter') || errMsg.includes('bot') || errMsg.includes('player response') || errMsg.includes('cookies') || errMsg.includes('Sign in')) {
      actions = `
        <button class="btn btn-primary" onclick="document.getElementById('export-modal').classList.remove('active'); document.getElementById('cookies-modal').classList.add('active');" style="font-size: 0.85rem;">
          ⚙️ Configure YouTube Cookies
        </button>
        ${actions}
      `;
    }
    if (modalActions) {
      modalActions.innerHTML = actions;
    }
  }

  // Project Persistence Engine (LocalStorage)
  function saveProjectState() {
    try {
      const state = {
        url: urlInput.value.trim(),
        videoData: currentVideoData,
        clips: clipManager.clips,
        activeClipId: clipManager.activeClipId,
        exportQuality: exportQualitySelect ? exportQualitySelect.value : 'highest',
        exportMode: exportModeSelect ? exportModeSelect.value : 'smart',
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Project save error", e);
    }
  }

  function restoreProjectState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw);
      if (!state || (!state.url && (!state.clips || state.clips.length === 0))) return false;

      if (state.url) {
        urlInput.value = state.url;
      }

      if (state.videoData) {
        currentVideoData = state.videoData;
        videoTitleEl.textContent = state.videoData.title || "Restored Stream";
        durationBadge.textContent = state.videoData.duration_formatted || "00:00:00";
        if (resolutionBadge) resolutionBadge.textContent = state.videoData.formats?.[0]?.resolution || "1080p";
        if (streamTypeBadge) streamTypeBadge.textContent = state.videoData.is_completed_live ? "Completed Livestream" : "Standard Video";

        if (state.videoData.duration) {
          timeline.setDuration(state.videoData.duration);
          clipManager.totalDuration = state.videoData.duration;
        }
      }

      if (state.url) {
        const videoId = extractYouTubeVideoId(state.url);
        if (videoId) {
          player.loadYouTube(videoId);
        }
      }

      if (Array.isArray(state.clips) && state.clips.length > 0) {
        clipManager.restoreState(state.clips, state.activeClipId);
        timeline.setClips(clipManager.clips, clipManager.activeClipId);
        const active = clipManager.getActiveClip();
        if (active) syncInputsFromClip(active);
      }

      if (state.exportQuality && exportQualitySelect) exportQualitySelect.value = state.exportQuality;
      if (state.exportMode && exportModeSelect) exportModeSelect.value = state.exportMode;

      showToast("Restored your previous project session", "info");
      return true;
    } catch (e) {
      console.warn("Storage restore error", e);
      return false;
    }
  }

  // Reset / New Project Action
  if (btnNewProject) {
    btnNewProject.addEventListener('click', () => {
      if (clipManager.clips.length > 1 || (clipManager.clips.length === 1 && currentVideoData)) {
        if (!confirm("Start a new project? This will reset all current clips and loaded stream.")) {
          return;
        }
      }
      localStorage.removeItem(STORAGE_KEY);
      urlInput.value = '';
      currentVideoData = null;
      videoTitleEl.textContent = "No Video Loaded";
      durationBadge.textContent = "00:00:00";
      resolutionBadge.textContent = "1080p60";
      streamTypeBadge.textContent = "Awaiting Input";

      clipManager.clips = [];
      clipManager.history = [];
      clipManager.redoStack = [];
      clipManager.addClip(0, 120, "Clip 1", false);
      timeline.setClips(clipManager.clips, clipManager.activeClipId);
      const active = clipManager.getActiveClip();
      if (active) syncInputsFromClip(active);

      showToast("New project ready. Enter a video URL to begin.", "info");
    });
  }

  // Unsaved Work Guard
  window.addEventListener('beforeunload', (e) => {
    if (currentVideoData && clipManager.clips.length > 0) {
      saveProjectState();
    }
  });

  // Global NLE Keyboard Shortcuts Coordinator
  window.addEventListener('keydown', (e) => {
    // Ignore global shortcuts when user is actively typing in inputs
    if (e.target.matches('input, textarea, select')) {
      if (e.key === 'Escape') {
        e.target.blur();
      }
      return;
    }

    // Escape closes all open modals
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
      return;
    }

    // Spacebar: Toggle Play / Pause
    if (e.code === 'Space') {
      e.preventDefault();
      const playing = player.togglePlay();
      showToast(playing ? "▶ Play" : "⏸ Pause", "info");
      return;
    }

    // I: Mark In (Set Start)
    if (e.key === 'i' || e.key === 'I') {
      e.preventDefault();
      btnSetStart.click();
      showToast("Mark In: Set Start", "info");
      return;
    }

    // O: Mark Out (Set End)
    if (e.key === 'o' || e.key === 'O') {
      e.preventDefault();
      btnSetEnd.click();
      showToast("Mark Out: Set End", "info");
      return;
    }

    // J: Reverse Shuttle 5s
    if (e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      player.seekTo(player.getCurrentTime() - 5);
      return;
    }

    // K: Pause Playback
    if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      player.pause();
      return;
    }

    // L: Forward Shuttle 5s
    if (e.key === 'l' || e.key === 'L') {
      e.preventDefault();
      player.seekTo(player.getCurrentTime() + 5);
      return;
    }

    // Stepping: Left / Right arrows
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      player.seekTo(player.getCurrentTime() - step);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      player.seekTo(player.getCurrentTime() + step);
      return;
    }

    // Delete / Backspace: Delete active clip
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const active = clipManager.getActiveClip();
      if (active) {
        clipManager.removeClip(active.id);
        showToast(`Deleted ${active.name}`, "info");
      }
      return;
    }

    // Duplicate clip (Ctrl+D / Cmd+D)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      const active = clipManager.getActiveClip();
      if (active) {
        const copy = clipManager.duplicateClip(active.id);
        showToast(`📋 Duplicated ${copy.name}`, "success");
      }
      return;
    }

    // Split at Playhead (S)
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      if (btnSplitClip) btnSplitClip.click();
      return;
    }

    // Toggle Magnetic Snap (M)
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      if (btnToggleSnap) btnToggleSnap.click();
      return;
    }

    // Fit to Screen (F)
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      if (btnFitScreen) btnFitScreen.click();
      return;
    }

    // Undo (Ctrl+Z)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (clipManager.undo()) {
        showToast("↩ Undo", "info");
      }
      return;
    }

    // Redo (Ctrl+Y or Ctrl+Shift+Z)
    if ((e.ctrlKey || e.metaKey) && ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
      e.preventDefault();
      if (clipManager.redo()) {
        showToast("↪ Redo", "info");
      }
      return;
    }

    // Shortcuts Modal (? or Shift+/)
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      if (shortcutsModal) shortcutsModal.classList.toggle('active');
      return;
    }
  });

  // Shortcuts Modal Wiring
  if (btnShortcuts && shortcutsModal) {
    btnShortcuts.addEventListener('click', () => shortcutsModal.classList.add('active'));
  }
  if (btnCloseShortcutsModal && shortcutsModal) {
    btnCloseShortcutsModal.addEventListener('click', () => shortcutsModal.classList.remove('active'));
  }

  // Engine Diagnostics Modal Wiring
  if (engineBadge && engineModal) {
    engineBadge.addEventListener('click', () => engineModal.classList.add('active'));
  }
  if (btnCloseEngineModal && engineModal) {
    btnCloseEngineModal.addEventListener('click', () => engineModal.classList.remove('active'));
  }

  // Engine Status Badge Listener
  window.addEventListener('engine-status-changed', (e) => {
    if (!engineBadge) return;
    if (e.detail.type === 'local') {
      engineBadge.textContent = '⚡ Local Engine';
      engineBadge.style.background = 'rgba(34, 197, 94, 0.15)';
      engineBadge.style.color = '#22c55e';
      engineBadge.style.borderColor = 'rgba(34, 197, 94, 0.3)';
      engineBadge.title = 'Running on Localhost:8000 (Click for diagnostics)';
    } else {
      engineBadge.textContent = '☁️ Cloud Server';
      engineBadge.style.background = 'rgba(59, 130, 246, 0.15)';
      engineBadge.style.color = '#60a5fa';
      engineBadge.style.borderColor = 'rgba(59, 130, 246, 0.3)';
      engineBadge.title = 'Running on Cloud Server (Click for diagnostics)';
    }
  });

  // Cookies Settings Modal
  const btnSettingsCookies = document.getElementById('btn-settings-cookies');
  const cookiesModal = document.getElementById('cookies-modal');
  const btnCloseCookiesModal = document.getElementById('btn-close-cookies-modal');
  const cookiesStatusIndicator = document.getElementById('cookies-status-indicator');
  const cookiesTextarea = document.getElementById('cookies-textarea');
  const cookiesFileUpload = document.getElementById('cookies-file-upload');
  const btnSaveCookies = document.getElementById('btn-save-cookies');

  async function refreshCookieStatus() {
    if (!cookiesStatusIndicator) return;
    try {
      const status = await API.getCookieStatus();
      if (status.has_cookies) {
        cookiesStatusIndicator.innerHTML = `Status: <strong style="color: #22c55e;">Cookies Active (${status.source}, ${status.file_size || 0} bytes)</strong>`;
      } else {
        cookiesStatusIndicator.innerHTML = `Status: <span style="color: var(--text-muted);">No Cookies Configured (Using Anonymous Mode)</span>`;
      }
    } catch (e) {
      cookiesStatusIndicator.textContent = "Status: Could not check cookie status";
    }
  }

  if (btnSettingsCookies) {
    btnSettingsCookies.addEventListener('click', () => {
      cookiesModal.classList.add('active');
      refreshCookieStatus();
    });
  }

  if (btnCloseCookiesModal) {
    btnCloseCookiesModal.addEventListener('click', () => {
      cookiesModal.classList.remove('active');
    });
  }

  if (cookiesFileUpload) {
    cookiesFileUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          cookiesTextarea.value = evt.target.result;
        };
        reader.readAsText(file);
      }
    });
  }

  if (btnSaveCookies) {
    btnSaveCookies.addEventListener('click', async () => {
      const text = cookiesTextarea.value.trim();
      if (!text) {
        showToast("Please paste or upload cookies first", "warning");
        return;
      }
      try {
        btnSaveCookies.disabled = true;
        btnSaveCookies.textContent = "Saving...";
        await API.saveCookies(text);
        showToast("Cookies saved successfully!", "success");
        refreshCookieStatus();
        cookiesModal.classList.remove('active');
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        btnSaveCookies.disabled = false;
        btnSaveCookies.textContent = "Save Cookies";
      }
    });
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
      exportModal.classList.remove('active');
    });
  }

  // Restore Project State from LocalStorage
  restoreProjectState();
});
