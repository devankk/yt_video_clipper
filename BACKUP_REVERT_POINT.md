# Golden Backup & Revert Points

## 1. Professional NLE v3.0 (Latest Milestone)
- **Commit Hash**: `912f0f354f9a0e44342385b2e9e6ecba4c8a24c2` (Short: `912f0f3`)
- **Git Tag**: `pro-nle-v3.0`
- **Backup Branch**: `backup/pro-nle-v3.0`
- **Timestamp**: November 18, 2026, 23:53:40 +05:30
- **Status**: 100% Tested & Verified on Localhost (`http://localhost:8000`)
- **Key Enhancements**:
  1. **Multi-Lane NLE Timeline (CapCut / VN Style)**: Dynamic interval scheduling automatically stacks overlapping clips into vertical lanes (Lane 0, Lane 1, Lane 2), completely eliminating 1D occlusion.
  2. **LocalStorage Auto-Save & Recovery**: Complete project state persistence (video URL, metadata, clips, timestamps, zoom). Reloading the browser immediately restores unsaved projects.
  3. **Full NLE Keyboard Shortcut Engine**: `Space` (play/pause), `I`/`O` (Mark In/Out), `J`/`K`/`L` shuttling, `←`/`→` 1s step (5s with Shift), `Delete` (remove clip), `Ctrl+D` (duplicate), `Ctrl+Z`/`Ctrl+Y` (undo/redo), `S` (split), `M` (snap), `F` (fit), `Escape` (close modals), and `?` (shortcuts help modal).
  4. **Right-Click Context Menu**: Right-click any timeline clip to Split at Cursor, Duplicate, Preview, Export, or Delete.
  5. **Undo & Redo**: Full 50-step command history stack with interactive `↩ Undo` and `↪ Redo` buttons.
  6. **Table Precision**: Full Hours, Minutes, and Seconds inputs (`[ HH ]h [ MM ]m [ SS ]s`) with spinbuttons.
  7. **Pro DAW Layout**: Generous 467px control panel width with no label clipping and bottom-right non-intrusive toasts.

```bash
# Revert to Pro NLE v3.0 anytime:
git reset --hard pro-nle-v3.0
```

---

## 2. VN Timeline v2.2 (Previous Baseline)
- **Commit Hash**: `42b4b19638e84d4c22cc2a810d4d2e795711663e` (Short: `42b4b19`)
- **Git Tag**: `backup-golden-v2.2`
- **Backup Branch**: `backup/stable-vn-timeline`
- **GitHub Repository**: [https://github.com/devankk/yt_video_clipper.git](https://github.com/devankk/yt_video_clipper.git)
- **Timestamp**: November 18, 2026, 21:43:46 +05:30
- **Status**: 100% Tested & Verified on Localhost

---

## Included & Verified Capabilities

1. **Clip Management**: Custom Start & End time inputs with **Hours and Minutes only** (`HH` and `MM`), with instant two-way synchronization to the timeline.
2. **Active Player Preview Reflection**: On-video glassmorphic HUD showing active clip title, `01h 00m ➔ 01h 05m (5m 00s)` badges, and glowing live progress bar.
3. **Sticky & Always-Visible Player**: `position: sticky` on the player stage plus automated floating **PiP mini-dock** (`📌 Mini-Dock Active`) on deep page scroll.
4. **Professional NLE Timeline (VN / CapCut Style)**:
   - Filmstrip clip cards with curved corners and top/bottom perforation textures.
   - Tactile 3-dot grip handles (`⋮`).
   - Precision ruby laser playhead with glowing diamond needle cap.
   - NLE Quick Action Toolbar: ✂️ Split at Playhead, 🧲 Magnetic Snapping toggle, ⤢ Fit to Screen, and live Timecode HUD.
5. **Backend Stream Processing & Export**:
   - Resilient segmented stream download without skipping DASH formats.
   - Auto-healing 403 token expiration handling.
   - Verified 100% export and direct 219 MB MP4 video download.

---

## How to Revert to this State if Needed

If any future changes cause bugs, regressions, or unexpected issues, run any of the following commands:

### Option A: Hard Reset to this Exact Commit
```bash
git fetch origin
git reset --hard 42b4b19
```

### Option B: Checkout via Tag
```bash
git checkout backup-golden-v2.2
```

### Option C: Restore from the Dedicated Backup Branch
```bash
git checkout backup/stable-vn-timeline
```
