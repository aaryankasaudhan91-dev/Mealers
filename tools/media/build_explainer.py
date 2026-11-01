"""Rebuild the narrated homepage film: python tools/media/build_explainer.py.

Requires Pillow, FFmpeg and FFprobe. Speech stays at its original speed.
Scene and caption cues are measured against assets/speech.mp3 in timeline.json.
"""
from pathlib import Path
import json
import math
import subprocess
import textwrap
import wave
from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
ASSETS = HERE / 'assets'
WORK = ROOT / 'work' / 'voiceover' / 'render'
DEST = ROOT / 'frontend' / 'public' / 'media'
W, H, FPS = 1920, 1080, 30
BG, INK, BLUE, GREEN = '#f8f7f3', '#14213d', '#2457d6', '#16734a'

def run(*args):
    subprocess.run(list(map(str,args)),check=True,stdout=subprocess.DEVNULL)

def font(size,bold=False):
    return ImageFont.truetype(str(Path('C:/Windows/Fonts') / ('segoeuib.ttf' if bold else 'segoeui.ttf')),size)

def wrapped(draw,text,xy,width,size=52,fill=INK,bold=False):
    face=font(size,bold)
    line=''
    x,y=xy
    for word in text.split():
        test=(line+' '+word).strip()
        if draw.textlength(test,font=face)>width and line:
            draw.text((x,y),line,font=face,fill=fill)
            y+=round(size*1.3)
            line=word
        else: line=test
    draw.text((x,y),line,font=face,fill=fill)
    return y+round(size*1.3)

def scene_image(scene,active):
    image=Image.new('RGB',(W,H),BG)
    d=ImageDraw.Draw(image)
    d.text((100,72),'mealers',font=font(47,True),fill=INK)
    d.ellipse((280,113,291,124),fill='#b91c1c')
    d.text((100,210),scene['label'].upper(),font=font(23,True),fill=BLUE)
    wrapped(d,scene['title'],(100,286),790,76,bold=True)
    wrapped(d,scene['description'],(100,560),760,34,fill='#475569')
    if scene.get('image'):
        art=ImageOps.fit(Image.open(ASSETS/'campus.jpg').convert('RGB'),(760,650))
        mask=Image.new('L',art.size)
        ImageDraw.Draw(mask).rounded_rectangle((0,0,760,650),radius=36,fill=255)
        image.paste(art,(1060,190),mask)
    else:
        for i,card in enumerate(scene['cards']):
            if i>active:
                continue
            y=230+i*193
            is_active=i==active
            is_past=i<active
            d.rounded_rectangle((1010,y,1820,y+160),radius=24,fill='#e7f4ed' if is_active else '#ffffff',outline=GREEN if is_active else '#e1e5e9',width=3 if is_active else 1)
            d.ellipse((1040,y+48,1095,y+103),fill=GREEN if (is_active or is_past) else '#e8edf5')
            d.text((1055,y+55),str(i+1),font=font(27,True),fill='white' if (is_active or is_past) else BLUE)
            wrapped(d,card['title'],(1130,y+29),635,33,bold=True)
            wrapped(d,card['detail'],(1130,y+85),630,26,fill='#475569')
    d.text((100,955),'SYNTHETIC DEMO · PRICING, CUSTOMERS AND SAVINGS UNVALIDATED',font=font(20),fill='#52606d')
    return image

def captions(duration):
    words=json.loads((HERE/'alignment.json').read_text(encoding='utf-8'))['words']
    groups=[]
    group=[]
    for word in words:
        if group and (len(' '.join(w['word'] for w in group+[word]))>74 or word['start']-group[-1]['end']>.65):
            groups.append(group)
            group=[]
        group.append(word)
        if word['word'].endswith(('.', '?')) or len(group)>=11:
            groups.append(group)
            group=[]
    if group:groups.append(group)
    def stamp(seconds):
        milliseconds=round(seconds*1000)
        hours,milliseconds=divmod(milliseconds,3600000)
        minutes,milliseconds=divmod(milliseconds,60000)
        seconds,milliseconds=divmod(milliseconds,1000)
        return f'{hours:02}:{minutes:02}:{seconds:02}.{milliseconds:03}'
    lines=['WEBVTT','']
    previous_end=0
    for i,group in enumerate(groups):
        start=group[0]['start']
        end=min(group[-1]['end']+.12,groups[i+1][0]['start'] if i+1<len(groups) else duration)
        assert previous_end<=start<end<=duration
        previous_end=end
        lines.extend([f'{stamp(start)} --> {stamp(end)}',textwrap.fill(' '.join(w['word'] for w in group),width=45),''])
    (WORK/'mealers-explainer.vtt').write_text('\n'.join(lines),encoding='utf-8')
    (WORK/'mealers-explainer.txt').write_text(' '.join(w['word'] for w in words)+'\n',encoding='utf-8')

def main():
    WORK.mkdir(parents=True,exist_ok=True)
    config=json.loads((HERE/'timeline.json').read_text(encoding='utf-8'))
    pcm=WORK/'speech.wav'
    run('ffmpeg','-v','error','-y','-i',ASSETS/'speech.mp3','-ac','1','-ar','48000',pcm)
    with wave.open(str(pcm)) as wav:
        duration=wav.getnframes()/wav.getframerate()
    captions(duration)
    total=math.ceil(duration*FPS)
    scenes=config['scenes']
    cache={}
    for i,scene in enumerate(scenes):
        for active in range(max(1,len(scene.get('cards',[])))):
            cache[i,active]=scene_image(scene,active)
    picture=WORK/'picture.mp4'
    args=['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-threads','2',str(picture)]
    encoder=subprocess.Popen(args,stdin=subprocess.PIPE)
    try:
        for n in range(total):
            t=n/FPS
            idx=max(i for i,s in enumerate(scenes) if s['start']<=t)
            scene=scenes[idx]
            active=max([i for i,c in enumerate(scene.get('cards',[])) if c['cue']<=t] or [0])
            image=cache[idx,active]
            # Speech-timed graphic states; all audio retains its original clock.
            encoder.stdin.write(image.tobytes())
            if n%300==0: print(f'Rendered {n}/{total} frames',flush=True)
    finally:
        encoder.stdin.close()
    if encoder.wait()!=0: raise RuntimeError('Picture rendering failed')
    cache[0,0].save(WORK/'poster.jpg',quality=94)
    # Reuse the original instrumental only for the opening; fade it out naturally.
    mixed=WORK/'mix.wav'
    graph=('[0:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[voice][key];'
           '[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.08,afade=t=in:d=0.5,afade=t=out:st=16:d=4[bed];'
           '[bed][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=250[duck];'
           '[voice][duck]amix=inputs=2:duration=first:normalize=0[mix]')
    run('ffmpeg','-v','error','-y','-i',pcm,'-i',ASSETS/'music.wav','-filter_complex',graph,'-map','[mix]','-c:a','pcm_f32le',mixed)
    analysis=subprocess.run(['ffmpeg','-hide_banner','-i',str(mixed),'-af','loudnorm=I=-16:TP=-2:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
    levels=json.loads(analysis[analysis.rfind('{'):analysis.rfind('}')+1])
    norm=('loudnorm=I=-16:TP=-2:LRA=11:linear=true:'
          f"measured_I={levels['input_i']}:measured_TP={levels['input_tp']}:measured_LRA={levels['input_lra']}:measured_thresh={levels['input_thresh']}:offset={levels['target_offset']}")
    output=WORK/'mealers-explainer.mp4'
    run('ffmpeg','-v','error','-y','-i',picture,'-i',mixed,'-map','0:v:0','-map','1:a:0','-c:v','copy','-af',norm,'-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',output)
    run('ffmpeg','-v','error','-i',output,'-f','null','-')
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(output)],text=True))
    assert abs(float(probe['format']['duration'])-duration)<0.1
    (WORK/'verification.json').write_text(json.dumps({'source_seconds':duration,'output':probe,'normalization':levels,'listening_review':'not_performed'},indent=2),encoding='utf-8')
    print(f'Checked output ready: {output} ({duration:.3f}s speech)',flush=True)

if __name__=='__main__':main()
