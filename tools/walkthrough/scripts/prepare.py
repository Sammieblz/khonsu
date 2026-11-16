"""Build frame-accurate narration, caption timelines and original quiet audio."""
import json
import math
from pathlib import Path
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'script.json').read_text())
FPS = 30
result = {}

def stamp(seconds):
    ms = round(seconds * 1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'

for cut, scenes in data.items():
    speed = 1.22 if cut == 'short' else 1.04
    cursor, subtitles, number = 0, [], 1
    for scene in scenes:
        scene['start'] = cursor
        scene['audio'] = []
        local = 10 if cut == 'short' else 20
        for i, line in enumerate(scene['lines']):
            name = f'narration/{cut}-{scene["id"]}-{i}.wav'
            with wave.open(str(ROOT/'public'/name)) as audio:
                seconds = audio.getnframes()/audio.getframerate()/speed
            frames = math.ceil(seconds*FPS)
            scene['audio'].append(dict(src=name, start=local, frames=frames, text=line, speed=speed))
            subtitles.append(f'{number}\n{stamp((cursor+local)/FPS)} --> {stamp((cursor+local+frames)/FPS)}\n{line}\n')
            number += 1
            local += frames + (2 if cut == 'short' else 8)
        scene['duration'] = local + (0 if cut == 'short' else 20)
        cursor += scene['duration']
    if cut == 'short':
        assert cursor <= 900, cursor
        scenes[-1]['duration'] += 900-cursor
        cursor = 900
    result[cut] = dict(scenes=scenes, frames=cursor)
    (ROOT/'out').mkdir(exist_ok=True)
    (ROOT/f'out/khonsu-{cut}.srt').write_text('\n'.join(subtitles),encoding='utf-8')
    print(cut, cursor/FPS, 'seconds')
(ROOT/'src/timeline.json').write_text(json.dumps(result,indent=2),encoding='utf-8')

# Original, quiet sinusoidal ambience, no sampled or licensed music.
import numpy as np
rate = 22050
t = np.arange(math.ceil(result['long']['frames']/FPS*rate))/rate
bed = sum(np.sin(2*np.pi*f*t+0.12*np.sin(2*np.pi*.07*t)) for f in (110,164.8138,220))/3
fade = np.minimum(1,t/3)*np.minimum(1,(t[-1]-t)/3)
bed = (bed * fade * 0.024 * 32767).astype('<i2')
with wave.open(str(ROOT/'public/narration/ambience.wav'),'wb') as audio:
    audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(rate); audio.writeframes(bed.tobytes())
