"""
YouTube Metadata & Direct Stream URL Extractor with In-Memory Caching
"""
import time
import re
from typing import Dict, Any, Optional, Tuple
import yt_dlp
from backend.config import METADATA_CACHE_TTL
from backend.models import VideoInfoResponse, VideoFormatInfo

def format_seconds(seconds: float) -> str:
    """Format seconds into HH:MM:SS or MM:SS."""
    total_sec = int(seconds)
    hours = total_sec // 3600
    minutes = (total_sec % 3600) // 60
    secs = total_sec % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"

def extract_video_id(url: str) -> str:
    """Extract YouTube Video ID from various URL formats."""
    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',
        r'(?:embed\/|v\/|live\/|shorts\/)([0-9A-Za-z_-]{11})',
        r'youtu\.be\/([0-9A-Za-z_-]{11})'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return url.strip()

class YouTubeExtractor:
    def __init__(self):
        # In-memory session cache: video_id -> (timestamp, raw_info_dict)
        self._cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}

    def extract_video_id(self, url: str) -> str:
        return extract_video_id(url)

    def _get_ydl_options(self, client: str = 'web_embedded') -> Dict[str, Any]:
        import shutil
        from pathlib import Path
        opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'live_from_start': True,
            'force_ipv4': True,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
            },
            'extractor_args': {
                'youtube': {
                    'player_client': [client],
                    'player_skip': ['webpage']
                }
            }
        }
        # Detect Deno from pip package or environment PATH
        try:
            import deno
            deno_bin = deno.find_deno_bin()
            if deno_bin:
                opts['js_runtimes'] = {'deno': {'path': str(deno_bin)}}
        except Exception:
            deno_bin = shutil.which('deno')
            if deno_bin:
                opts['js_runtimes'] = {'deno': {'path': deno_bin}}
            elif Path("bin/deno").exists():
                opts['js_runtimes'] = {'deno': {'path': str(Path("bin/deno").resolve())}}
        return opts

    def get_video_info(self, url: str) -> Tuple[VideoInfoResponse, Dict[str, Any]]:
        """
        Extract video metadata and available stream formats.
        Uses in-memory cache to ensure repeated queries return in < 0.01s.
        """
        clean_id = extract_video_id(url)
        now = time.time()

        # Check cache
        if clean_id in self._cache:
            cache_time, cached_info = self._cache[clean_id]
            if now - cache_time < METADATA_CACHE_TTL:
                return self._parse_info(cached_info), cached_info

        info = None
        errors = []
        target_url = f"https://www.youtube.com/watch?v={clean_id}" if clean_id else url

        # 1. Primary extraction with web_embedded (bypasses datacenter webpage blocks)
        for client in ('web_embedded', 'tv', 'web'):
            try:
                ydl_opts = self._get_ydl_options(client=client)
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(target_url, download=False)
                if info and info.get('formats'):
                    break
            except Exception as e:
                errors.append(str(e))

        # 2. Fallback to default without player_skip if needed
        if not info:
            try:
                default_opts = {
                    'quiet': True,
                    'no_warnings': True,
                    'skip_download': True,
                    'live_from_start': True,
                    'force_ipv4': True
                }
                with yt_dlp.YoutubeDL(default_opts) as ydl:
                    info = ydl.extract_info(target_url, download=False)
            except Exception as e:
                errors.append(str(e))

        if not info:
            raise ValueError(f"Could not retrieve video information: {errors[0] if errors else 'Extraction failed'}")

        # Cache the extracted raw info
        self._cache[clean_id] = (now, info)
        if url != clean_id:
            self._cache[url] = (now, info)
        return self._parse_info(info), info

    def get_raw_cached_info(self, url_or_id: str) -> Optional[Dict[str, Any]]:
        clean_id = extract_video_id(url_or_id)
        if clean_id in self._cache:
            cache_time, info = self._cache[clean_id]
            if time.time() - cache_time < METADATA_CACHE_TTL:
                return info
        return None

    def _parse_info(self, info: Dict[str, Any]) -> VideoInfoResponse:
        video_id = info.get('id', '')
        title = info.get('title', 'YouTube Video')
        duration = float(info.get('duration') or 0.0)
        thumbnail = info.get('thumbnail')
        channel = info.get('uploader') or info.get('channel')
        live_status = info.get('live_status')
        is_live = live_status == 'is_live'
        is_completed_live = live_status == 'post_live' or any('fragments' in f for f in (info.get('formats') or []))

        formats_list = []
        raw_formats = info.get('formats', [])
        seen_resolutions = set()

        for f in raw_formats:
            height = f.get('height')
            vcodec = f.get('vcodec', 'none')
            acodec = f.get('acodec', 'none')
            ext = f.get('ext', '')
            fps = f.get('fps')

            if height and height >= 144 and vcodec != 'none':
                res_key = f"{height}p{fps or ''}"
                if res_key not in seen_resolutions:
                    seen_resolutions.add(res_key)
                    formats_list.append(VideoFormatInfo(
                        format_id=str(f.get('format_id')),
                        resolution=f"{height}p",
                        fps=fps,
                        vcodec=vcodec,
                        acodec=acodec,
                        ext=ext
                    ))

        def get_format_height(fmt: VideoFormatInfo) -> int:
            digits = re.findall(r'\d+', fmt.resolution)
            return int(digits[0]) if digits else 0

        # Sort descending by resolution height, then fps
        formats_list.sort(key=lambda x: (get_format_height(x), x.fps or 0), reverse=True)

        return VideoInfoResponse(
            video_id=video_id,
            title=title,
            duration=duration,
            duration_formatted=format_seconds(duration),
            thumbnail=thumbnail,
            channel=channel,
            is_live=is_live,
            is_completed_live=is_completed_live,
            formats=formats_list
        )

# Global singleton extractor instance
extractor = YouTubeExtractor()
