"""Verify local exports and remove AAC padding beyond the demo time limit."""
import hashlib
import html
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BIN = ROOT / 'node_modules/@remotion/compositor-win32-x64-msvc'
OUT = ROOT / 'out'


def probe(path):
    result = subprocess.run(
        [str(BIN / 'ffprobe.exe'), '-v', 'error', '-show_format',
         '-show_streams', '-of', 'json', str(path)],
        check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout)


report = {}
for cut, filename, frames in [
    ('short', 'Khonsu-Submission-30s-1080p.mp4', 900),
    ('long', 'Khonsu-Full-Walkthrough-1080p.mp4', 8067),
]:
    path = OUT / filename
    data = probe(path)
    if cut == 'short' and float(data['format']['duration']) > 30:
        # Speech ends at 29.3 s. Trim only trailing ambience/AAC padding.
        temporary = OUT / 'submission-duration-fixed.mp4'
        subprocess.run([
            str(BIN / 'ffmpeg.exe'), '-y', '-i', str(path),
            '-c:v', 'copy', '-c:a', 'aac', '-af', 'atrim=end=29.9',
            '-t', '30', '-movflags', '+faststart', str(temporary),
        ], check=True)
        temporary.replace(path)
        data = probe(path)
    video = next(s for s in data['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in data['streams'] if s['codec_type'] == 'audio')
    assert (video['width'], video['height']) == (1920, 1080)
    assert video['codec_name'] == 'h264'
    assert video['avg_frame_rate'] == '30/1'
    assert int(video['nb_frames']) == frames
    assert audio['codec_name'] == 'aac'
    duration = float(data['format']['duration'])
    assert abs(duration - frames / 30) < 0.1
    if cut == 'short':
        assert duration <= 30.0, 'Submission video exceeds 30-second limit'
    subtitles = OUT / f'khonsu-{cut}.srt'
    assert subtitles.is_file() and '-->' in subtitles.read_text(encoding='utf-8')
    report[cut] = {
        'file': filename, 'seconds': duration, 'frames': frames,
        'resolution': [1920, 1080], 'fps': 30,
        'video_codec': 'h264', 'audio_codec': 'aac',
        'bytes': path.stat().st_size,
        'sha256': hashlib.file_digest(path.open('rb'), 'sha256').hexdigest(),
        'captions': subtitles.name,
    }
(OUT / 'verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
timeline = json.loads((ROOT / 'src/timeline.json').read_text(encoding='utf-8'))
transcript = ['KHONSU: DETAILED WALKTHROUGH', 'English narration transcript', '']
for scene in timeline['long']['scenes']:
    seconds = scene['start'] // 30
    transcript.extend([
        f"{seconds // 60:02}:{seconds % 60:02} | {scene['title']}",
        *scene['lines'], '',
    ])
(OUT / 'Khonsu-Transcript.txt').write_text('\n'.join(transcript), encoding='utf-8')
sections = []
for cut, label in [('short', 'Submission demo / 30 seconds'), ('long', 'Detailed walkthrough / 4:29')]:
    filename = html.escape(report[cut]['file'])
    sections.append(
        f'<section><h2>{label}</h2><video controls preload="metadata" src="{filename}"></video>'
        f'<p><a href="{filename}" download>Download MP4</a> | '
        f'<a href="khonsu-{cut}.srt" download>Subtitles</a></p></section>'
    )
player = '''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Khonsu videos</title>
<style>body{margin:0;background:#070b12;color:#f1f0e9;font:17px/1.6 system-ui}
main{max-width:1200px;margin:auto;padding:36px}a{color:#edb85e}
video{width:100%;background:#000;border:1px solid #47515d}
section{padding:24px 0;border-top:1px solid #47515d}p{max-width:80ch}</style>
<main><h1>KHONSU / Find what time reveals.</h1>
<p>English narration, synchronized captions and recorded application demonstrations.
Use the 30-second cut for the required demo. The longer tutorial is supplementary.</p>
''' + ''.join(sections) + '''<p><a href="Khonsu-Transcript.txt">Full transcript</a> |
<a href="verification.json">Technical verification</a></p>
<p>Cached real SPHEREx observations. Estimated patches are distinguished from original measurements.
No discovery is claimed. Neither video has been submitted to the event portal.</p></main></html>'''
(OUT / 'OPEN-VIDEOS.html').write_text(player, encoding='utf-8')
print(json.dumps(report, indent=2))
