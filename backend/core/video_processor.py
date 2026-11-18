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

        # Rank formats: strongly prefer HLS (m3u8_native) and formats with embedded audio
        # which GoogleVideo CDN serves reliably without 403 Forbidden errors.
        def format_rank(f):
            is_m3u8 = 10 if f.get('protocol') == 'm3u8_native' or 'm3u8' in f.get('protocol', '') else 0
            has_audio = 5 if f.get('acodec') and f.get('acodec') != 'none' else 0
            is_avc = 2 if f.get('vcodec', '').startswith('avc1') else 0
            fps = float(f.get('fps') or 0)
            tbr = float(f.get('tbr') or f.get('vbr') or 0)
            return (is_m3u8 + has_audio, is_avc, fps, tbr)

        target_height = None
        if quality and quality != "highest":
            digits = [int(d) for d in re.findall(r'\d+', quality)]
            if digits:
                val = digits[0]
                width_to_height = {3840: 2160, 2560: 1440, 1920: 1080, 1280: 720, 854: 480, 640: 360, 426: 240, 256: 144}
                target_height = width_to_height.get(val, val)

        # Assemble prioritized list of video format candidates
        candidates = []
        if target_height:
            height_matches = [f for f in formats if f.get('height') == target_height and f.get('vcodec') != 'none']
            height_matches.sort(key=format_rank, reverse=True)
            candidates.extend(height_matches)

        # Append fallbacks by standard resolutions in descending quality
        for h in [1080, 720, 360, 144, 480, 1440, 2160]:
            h_fmts = [f for f in formats if f.get('height') == h and f.get('vcodec') != 'none']
            h_fmts.sort(key=format_rank, reverse=True)
            for f in h_fmts:
                if f not in candidates:
                    candidates.append(f)

        if not candidates:
            candidates = [f for f in formats if f.get('vcodec') != 'none'] or [formats[-1]]

        # Prepare audio format lookup
        audio_fmts = [f for f in formats if f.get('vcodec') == 'none' and f.get('acodec') != 'none']
        aac_fmts = [f for f in audio_fmts if f.get('acodec', '').startswith('mp4a')]
        if aac_fmts:
            aac_fmts.sort(key=lambda x: (x.get('abr') or x.get('tbr') or 0), reverse=True)
            best_audio = aac_fmts[0]
        elif audio_fmts:
            audio_fmts.sort(key=lambda x: (x.get('abr') or x.get('tbr') or 0), reverse=True)
            best_audio = audio_fmts[0]
        else:
            best_audio = None

        last_error = None
        # Try candidate formats in priority order
        for v_fmt in candidates:
            has_embedded_audio = bool(v_fmt.get('acodec') and v_fmt.get('acodec') != 'none')
            a_fmt = None if has_embedded_audio else best_audio

            is_fragmented = bool(
                v_fmt.get('protocol') == 'http_dash_segments'
                or v_fmt.get('fragments')
            )
            has_frags = bool(v_fmt.get('fragments'))
            print(f"[VideoProcessor] Candidate format {v_fmt.get('format_id')} (protocol={v_fmt.get('protocol')}, fragmented={is_fragmented}, has_frags={has_frags})...", flush=True)

            try:
                if is_fragmented and has_frags:
                    return self._process_livestream_fragments(
                        v_fmt, a_fmt, clip, output_path, mode, raw_info, progress_callback
                    )
                elif not is_fragmented:
                    return self._process_direct_stream(
                        v_fmt, a_fmt, clip, output_path, mode, progress_callback
                    )
                else:
                    print(f"[VideoProcessor] Skipping fragmented format {v_fmt.get('format_id')} without fragments...", flush=True)
                    continue
            except Exception as e:
                last_error = e
                err_str = str(e)
                print(f"[VideoProcessor] Candidate format {v_fmt.get('format_id')} failed: {err_str[:250]}, trying next candidate...", flush=True)
                continue

        # If candidates loop finished without success, try fragment fallback on first candidate if fragments exist
        if (candidates[0].get('protocol') == 'http_dash_segments' or 'fragments' in candidates[0]) and candidates[0].get('fragments'):
            try:
                return self._process_livestream_fragments(
                    candidates[0], best_audio, clip, output_path, mode, raw_info, progress_callback
                )
            except Exception:
                pass

        if last_error:
            raise last_error
        raise RuntimeError("No suitable stream format could be processed.")

    def _process_livestream_fragments(
        self,
        v_fmt: Dict[str, Any],
        a_fmt: Optional[Dict[str, Any]],
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
        v_frags_list = v_fmt.get('fragments') or []
        a_frags_list = (a_fmt.get('fragments') if a_fmt else []) or []

        v_count = len(v_frags_list)
        total_dur = float(raw_info.get('duration') or 0.0)
        target_dur = float(v_fmt.get('target_duration') or (total_dur / v_count if v_count > 0 and total_dur > 0 else 5.0))
        if target_dur <= 0:
            target_dur = 5.0

        start_sec = max(0.0, float(clip.start_time))
        end_sec = min(total_dur or 999999.0, float(clip.end_time))
        clip_duration = max(0.1, end_sec - start_sec)

        sq_start = max(0, int(start_sec // target_dur))
        sq_end = int(end_sec // target_dur)
        if v_count > 0:
            sq_end = min(sq_end, v_count - 1)

        # Temp working folder for this clip with clean ASCII identifier
        session_temp = TEMP_DIR / f"clip_{uuid.uuid4().hex[:8]}_{int(time.time())}"
        session_temp.mkdir(parents=True, exist_ok=True)

        v_base = v_fmt.get('url', '')
        a_base = a_fmt.get('url', '') if a_fmt else ''

        v_tasks = []
        for sq in range(sq_start, sq_end + 1):
            if sq < len(v_frags_list) and v_frags_list[sq].get('url'):
                url = v_frags_list[sq]['url']
            else:
                url = f"{v_base}&sq={sq}" if v_base else ""
            if url:
                v_tasks.append((url, session_temp / f"v_{sq}.mp4"))

        a_tasks = []
        if a_fmt:
            for sq in range(sq_start, sq_end + 1):
                if sq < len(a_frags_list) and a_frags_list[sq].get('url'):
                    url = a_frags_list[sq]['url']
                else:
                    url = f"{a_base}&sq={sq}" if a_base else ""
                if url:
                    a_tasks.append((url, session_temp / f"a_{sq}.m4a"))

        all_tasks = v_tasks + a_tasks

        if progress_callback:
            progress_callback(35, f"Downloading {len(v_tasks)} video chunks & {len(a_tasks)} audio chunks in parallel...")

        chunk_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': '*/*'
        }
        cookie_file = Path("cookies.txt")
        if cookie_file.exists() and cookie_file.stat().st_size > 10:
            try:
                cookies = []
                for line in cookie_file.read_text(encoding='utf-8').splitlines():
                    if line.strip() and not line.startswith('#'):
                        parts = line.split('\t')
                        if len(parts) >= 7:
                            cookies.append(f"{parts[5]}={parts[6]}")
                if cookies:
                    chunk_headers['Cookie'] = "; ".join(cookies)
            except Exception:
                pass

        def fetch_chunk(item):
            url, dest = item
            for attempt in range(3):
                try:
                    req = urllib.request.Request(url, headers=chunk_headers)
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        with open(dest, 'wb') as f:
                            f.write(resp.read())
                    return dest
                except Exception as ex:
                    if attempt == 2:
                        print(f"[fetch_chunk ERROR] dest={dest.name}, url={url}, err={ex}", flush=True)
                        raise
                    time.sleep(0.5)
            return dest

        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            list(pool.map(fetch_chunk, all_tasks))

        if progress_callback:
            progress_callback(70, "Assembling and packaging clip with FFmpeg...")

        # Build concat lists with duration directives using absolute forward-slash paths
        v_list = session_temp / "v_list.txt"
        with open(v_list, 'w', encoding='utf-8') as f:
            for _, p in v_tasks:
                abs_p = str(p.resolve()).replace('\\', '/')
                f.write(f"file '{abs_p}'\n")
                f.write(f"duration {target_dur:.6f}\n")

        a_list = session_temp / "a_list.txt"
        if a_tasks:
            with open(a_list, 'w', encoding='utf-8') as f:
                for _, p in a_tasks:
                    abs_p = str(p.resolve()).replace('\\', '/')
                    f.write(f"file '{abs_p}'\n")
                    f.write(f"duration {target_dur:.6f}\n")

        # Offset within the first fragment
        first_frag_start = sq_start * target_dur
        offset_in_first_frag = max(0.0, start_sec - first_frag_start)

        # Make sure output path parent directory exists and is absolute
        output_path = Path(output_path).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat', '-safe', '0', '-i', str(v_list.resolve()),
        ]
        if a_tasks:
            cmd.extend([
                '-f', 'concat', '-safe', '0', '-i', str(a_list.resolve()),
            ])

        cmd.extend([
            '-ss', f"{offset_in_first_frag:.4f}",
            '-t', f"{clip_duration:.4f}",
        ])

        if a_tasks:
            cmd.extend(['-map', '0:v:0', '-map', '1:a:0?'])
        else:
            cmd.extend(['-map', '0:v:0', '-map', '0:a?'])

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

        print(f"[FFmpeg Fragment CMD]: {' '.join(cmd)}", flush=True)
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"[FFmpeg STDERR]:\n{res.stderr}", flush=True)
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

        output_path = Path(output_path).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        start_str = str(clip.start_time)
        end_str = str(clip.end_time)

        cookie_header = ""
        for candidate in ("cookies.txt", "backend/cookies.txt", "/opt/render/project/src/cookies.txt"):
            p_cand = Path(candidate)
            if p_cand.exists() and p_cand.stat().st_size > 10:
                try:
                    cookies = []
                    for line in p_cand.read_text(encoding='utf-8').splitlines():
                        if line.strip() and not line.startswith('#'):
                            parts = line.split('\t')
                            if len(parts) >= 7:
                                cookies.append(f"{parts[5]}={parts[6]}")
                    if cookies:
                        cookie_header = "; ".join(cookies)
                        break
                except Exception:
                    pass

        v_headers = v_fmt.get('http_headers') or {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': '*/*'
        }
        if cookie_header:
            v_headers['Cookie'] = cookie_header
        v_header_str = "".join([f"{k}: {v}\r\n" for k, v in v_headers.items()])

        cmd = ['ffmpeg', '-y']
        if v_header_str:
            cmd.extend(['-headers', v_header_str])
        cmd.extend(['-ss', start_str, '-to', end_str, '-i', v_fmt['url']])

        if a_fmt and a_fmt.get('url'):
            a_headers = a_fmt.get('http_headers') or dict(v_headers)
            if cookie_header:
                a_headers['Cookie'] = cookie_header
            a_header_str = "".join([f"{k}: {v}\r\n" for k, v in a_headers.items()])
            if a_header_str:
                cmd.extend(['-headers', a_header_str])
            cmd.extend(['-ss', start_str, '-to', end_str, '-i', a_fmt['url']])
            cmd.extend(['-map', '0:v:0', '-map', '1:a:0?'])
        else:
            cmd.extend(['-map', '0:v:0', '-map', '0:a?'])

        has_audio = bool(a_fmt or (v_fmt.get('acodec') and v_fmt.get('acodec') != 'none'))

        if mode == "fast":
            cmd.extend([
                '-c:v', 'copy',
                '-c:a', 'copy' if has_audio else 'none',
                '-avoid_negative_ts', 'make_zero',
                '-movflags', '+faststart',
                str(output_path)
            ])
        else:
            cmd.extend([
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-crf', '18',
                '-c:a', 'aac' if has_audio else 'none',
                '-b:a', '192k',
                '-avoid_negative_ts', 'make_zero',
                '-movflags', '+faststart',
                str(output_path)
            ])

        if progress_callback:
            progress_callback(60, "Encoding clip...")

        print(f"[FFmpeg CMD]: {' '.join(cmd)}", flush=True)
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"[FFmpeg STDERR]:\n{res.stderr}", flush=True)
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
