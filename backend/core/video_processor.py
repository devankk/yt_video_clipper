"""
High-Performance Video Processor using FFmpeg & HTTP Range Fragment Streaming
"""
import os
import re
import time
import zipfile
import subprocess
import urllib.request
import concurrent.futures
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable
from backend.config import EXPORTS_DIR, TEMP_DIR
from backend.models import ClipRange

import uuid

def sanitize_filename(name: str) -> str:
    """Sanitize string to be safe for filenames and FFmpeg."""
    clean = re.sub(r'[^\w\-]', '_', name, flags=re.ASCII)
    clean = re.sub(r'_+', '_', clean).strip('_')
    return clean[:40] or "Clip"

class VideoProcessor:
    def __init__(self):
        pass

    def process_clip(
        self,
        raw_info: Dict[str, Any],
        clip: ClipRange,
        output_path: Path,
        mode: str = "fast",
        quality: str = "highest",
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> Path:
        """
        Extract a single clip from YouTube stream metadata.
        Supports custom resolution quality selection (e.g. '1080', '720', '480', '360', or 'highest').
        """
        output_path = Path(output_path).resolve()
        if progress_callback:
            progress_callback(10, f"Analyzing video stream formats (target quality: {quality})...")

        formats = raw_info.get('formats', [])
        is_dash_fragments = False

        # Select video format matching requested quality
        v_fmt = None
        target_height = None
        if quality and quality != "highest":
            digits = [int(d) for d in re.findall(r'\d+', quality)]
            if digits:
                val = digits[0]
                width_to_height = {3840: 2160, 2560: 1440, 1920: 1080, 1280: 720, 854: 480, 640: 360, 426: 240, 256: 144}
                target_height = width_to_height.get(val, val)

        if target_height:
            candidates = [f for f in formats if f.get('height') == target_height and f.get('vcodec') != 'none']
            if candidates:
                avc = [f for f in candidates if f.get('vcodec', '').startswith('avc1')]
                if avc:
                    avc.sort(key=lambda x: (x.get('fps') or 0, x.get('tbr') or x.get('vbr') or 0), reverse=True)
                    v_fmt = avc[0]
                else:
                    candidates.sort(key=lambda x: (x.get('fps') or 0, x.get('tbr') or x.get('vbr') or 0), reverse=True)
                    v_fmt = candidates[0]

        # If not found or if 'highest', choose highest available resolution
        if not v_fmt:
            for preferred_height in [2160, 1440, 1080, 720, 480, 360]:
                candidates = [f for f in formats if f.get('height') == preferred_height and f.get('vcodec') != 'none']
                if candidates:
                    avc = [f for f in candidates if f.get('vcodec', '').startswith('avc1')]
                    if avc:
                        avc.sort(key=lambda x: (x.get('fps') or 0, x.get('tbr') or x.get('vbr') or 0), reverse=True)
                        v_fmt = avc[0]
                    else:
                        candidates.sort(key=lambda x: (x.get('fps') or 0, x.get('tbr') or x.get('vbr') or 0), reverse=True)
                        v_fmt = candidates[0]
                    break

        if not v_fmt:
            candidates = [f for f in formats if f.get('vcodec') != 'none' and f.get('height')]
            if candidates:
                candidates.sort(key=lambda x: (x.get('height') or 0, x.get('fps') or 0, x.get('tbr') or 0), reverse=True)
                v_fmt = candidates[0]
            else:
                v_fmt = formats[-1]

        # Look for best audio format (AAC / M4A highest bitrate e.g. 144k format 140 instead of 48k format 139)
        audio_fmts = [f for f in formats if f.get('vcodec') == 'none' and f.get('acodec') != 'none']
        aac_fmts = [f for f in audio_fmts if f.get('acodec', '').startswith('mp4a')]
        if aac_fmts:
            aac_fmts.sort(key=lambda x: (x.get('abr') or x.get('tbr') or 0), reverse=True)
            a_fmt = aac_fmts[0]
        elif audio_fmts:
            audio_fmts.sort(key=lambda x: (x.get('abr') or x.get('tbr') or 0), reverse=True)
            a_fmt = audio_fmts[0]
        else:
            a_fmt = None

        if v_fmt.get('protocol') == 'http_dash_segments' or 'fragments' in v_fmt:
            is_dash_fragments = True

        if is_dash_fragments and a_fmt and ('fragments' in a_fmt or a_fmt.get('protocol') == 'http_dash_segments'):
            return self._process_livestream_fragments(
                v_fmt, a_fmt, clip, output_path, mode, raw_info, progress_callback
            )
        else:
            return self._process_direct_stream(
                v_fmt, a_fmt, clip, output_path, mode, progress_callback
            )

    def _process_livestream_fragments(
        self,
        v_fmt: Dict[str, Any],
        a_fmt: Dict[str, Any],
        clip: ClipRange,
        output_path: Path,
        mode: str,
        raw_info: Dict[str, Any],
        progress_callback: Optional[Callable[[int, str], None]]
    ) -> Path:
        """
        Download only the specific fragment chunks needed for the clip.
        Takes ~2-4s instead of downloading the multi-hour stream!
        """
        if progress_callback:
            progress_callback(20, "Calculating fragment sequence ranges...")

        # Calculate exact fragment duration dynamically
        v_frags = len(v_fmt.get('fragments') or [])
        total_dur = float(raw_info.get('duration') or 0.0)
        target_dur = float(v_fmt.get('target_duration') or (total_dur / v_frags if v_frags > 0 and total_dur > 0 else 5.0))
        if target_dur <= 0:
            target_dur = 5.0

        start_sec = max(0.0, float(clip.start_time))
        end_sec = min(total_dur or 999999.0, float(clip.end_time))
        clip_duration = max(0.1, end_sec - start_sec)

        sq_start = int(start_sec // target_dur)
        sq_end = int(end_sec // target_dur)

        # Temp working folder for this clip with clean ASCII identifier
        session_temp = TEMP_DIR / f"clip_{uuid.uuid4().hex[:8]}_{int(time.time())}"
        session_temp.mkdir(parents=True, exist_ok=True)

        v_base = v_fmt['url']
        a_base = a_fmt['url']

        v_tasks = [(f"{v_base}&sq={sq}", session_temp / f"v_{sq}.mp4") for sq in range(sq_start, sq_end + 1)]
        a_tasks = [(f"{a_base}&sq={sq}", session_temp / f"a_{sq}.m4a") for sq in range(sq_start, sq_end + 1)]
        all_tasks = v_tasks + a_tasks

        if progress_callback:
            progress_callback(35, f"Downloading {len(v_tasks)} video chunks & {len(a_tasks)} audio chunks in parallel...")

        def fetch_chunk(item):
            url, dest = item
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                with open(dest, 'wb') as f:
                    f.write(resp.read())
            return dest

        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            list(pool.map(fetch_chunk, all_tasks))

        if progress_callback:
            progress_callback(70, "Assembling and packaging clip with FFmpeg...")

        # Build concat lists with duration directives using absolute forward-slash paths
        v_list = session_temp / "v_list.txt"
        a_list = session_temp / "a_list.txt"

        with open(v_list, 'w', encoding='utf-8') as f:
            for _, p in v_tasks:
                abs_p = str(p.resolve()).replace('\\', '/')
                f.write(f"file '{abs_p}'\n")
                f.write(f"duration {target_dur:.6f}\n")

        with open(a_list, 'w', encoding='utf-8') as f:
            for _, p in a_tasks:
                abs_p = str(p.resolve()).replace('\\', '/')
                f.write(f"file '{abs_p}'\n")
                f.write(f"duration {target_dur:.6f}\n")

        # Offset within the first fragment
        first_frag_start = sq_start * target_dur
        offset_in_first_frag = max(0.0, start_sec - first_frag_start)

        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat', '-safe', '0', '-i', str(v_list),
            '-f', 'concat', '-safe', '0', '-i', str(a_list),
            '-ss', f"{offset_in_first_frag:.4f}",
            '-t', f"{clip_duration:.4f}",
        ]

        # Use fast stream copy only if aligned to fragment keyframe boundary.
        # Otherwise, use visually lossless CRF 18 veryfast to prevent dropped frames & desync.
        if mode == "fast" and offset_in_first_frag < 0.25:
            cmd.extend([
                '-c:v', 'copy',
                '-c:a', 'copy',
                '-avoid_negative_ts', 'make_zero',
                '-movflags', '+faststart',
                str(output_path)
            ])
        else:
            cmd.extend([
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-crf', '18',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-avoid_negative_ts', 'make_zero',
                '-movflags', '+faststart',
                str(output_path)
            ])

        res = subprocess.run(cmd, cwd=str(session_temp), capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg processing failed: {res.stderr[-400:]}")

        # Cleanup temp chunks
        try:
            for p in session_temp.glob("*"):
                p.unlink(missing_ok=True)
            session_temp.rmdir()
        except Exception:
            pass

        if progress_callback:
            progress_callback(100, "Clip processing complete!")

        return output_path

    def _process_direct_stream(
        self,
        v_fmt: Dict[str, Any],
        a_fmt: Optional[Dict[str, Any]],
        clip: ClipRange,
        output_path: Path,
        mode: str,
        progress_callback: Optional[Callable[[int, str], None]]
    ) -> Path:
        """
        Direct HTTP Range Seeking using FFmpeg (-ss before -i).
        Used for normal non-fragmented YouTube videos.
        """
        if progress_callback:
            progress_callback(30, "Seeking remote HTTP video stream with FFmpeg...")

        start_str = str(clip.start_time)
        end_str = str(clip.end_time)

        cmd = ['ffmpeg', '-y', '-ss', start_str, '-to', end_str, '-i', v_fmt['url']]
        if a_fmt and a_fmt.get('url'):
            cmd.extend(['-ss', start_str, '-to', end_str, '-i', a_fmt['url']])

        if mode == "fast":
            cmd.extend([
                '-c:v', 'copy',
                '-c:a', 'copy' if a_fmt else 'none',
                '-avoid_negative_ts', 'make_zero',
                '-movflags', '+faststart',
                str(output_path)
            ])
        else:
            cmd.extend([
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-crf', '18',
                '-c:a', 'aac' if a_fmt else 'none',
                '-b:a', '192k',
                '-avoid_negative_ts', 'make_zero',
                '-movflags', '+faststart',
                str(output_path)
            ])

        if progress_callback:
            progress_callback(60, "Encoding clip...")

        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg stream seeking failed: {res.stderr[-400:]}")

        if progress_callback:
            progress_callback(100, "Clip processing complete!")

        return output_path

    def process_batch(
        self,
        raw_info: Dict[str, Any],
        clips: List[ClipRange],
        base_title: str,
        mode: str = "fast",
        quality: str = "highest",
        progress_callback: Optional[Callable[[int, str, int, int], None]] = None
    ) -> Tuple[List[Path], Path]:
        """
        Process multiple clips in batch and compile them into a ZIP archive.
        """
        clean_base = sanitize_filename(base_title)
        batch_folder = EXPORTS_DIR / f"{clean_base}_{int(time.time())}"
        batch_folder.mkdir(parents=True, exist_ok=True)

        exported_files: List[Path] = []
        total_clips = len(clips)

        for idx, clip in enumerate(clips, 1):
            clip_filename = f"{clean_base}_Clip_{idx:02d}.mp4"
            clip_path = batch_folder / clip_filename

            def clip_progress(sub_pct: int, msg: str):
                if progress_callback:
                    # Calculate overall batch percentage
                    overall = int(((idx - 1) * 100 + sub_pct) / total_clips)
                    progress_callback(overall, f"Clip {idx}/{total_clips}: {msg}", idx, total_clips)

            self.process_clip(raw_info, clip, clip_path, mode=mode, quality=quality, progress_callback=clip_progress)
            exported_files.append(clip_path)

        # Create ZIP archive
        zip_path = EXPORTS_DIR / f"{clean_base}_Clips.zip"
        if progress_callback:
            progress_callback(95, "Packaging clips into ZIP archive...", total_clips, total_clips)

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_path in exported_files:
                zipf.write(file_path, arcname=file_path.name)

        if progress_callback:
            progress_callback(100, "Batch export complete!", total_clips, total_clips)

        return exported_files, zip_path

# Global singleton processor instance
processor = VideoProcessor()
