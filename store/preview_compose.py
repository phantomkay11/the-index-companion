"""Assembles the iPhone App Preview from the frames store/preview.mjs recorded.

Adds the status bar, home indicator and captions, crossfades between shots, ends on a title card,
and encodes to Apple's spec: 886 x 1920, 30 fps, H.264 High 4.0 at a constant 11 Mbps, stereo AAC 256 kbps
(a silent track, since App Store Connect expects one), 15 to 30 seconds.

Usage: python3 store/preview_compose.py
"""
import glob
import os
import shutil
import subprocess

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, 'out', 'preview')
W, H = 886, 1920
FPS = 30
FADE = 8          # frames of crossfade between shots
END_FADE = 12     # frames into the end card
END_HOLD = 36     # frames on the end card

# Shot order, and whether its caption sits at the top or bottom (kept clear of what's being tapped).
SHOTS = [('discover', 'bottom'), ('farm', 'bottom'), ('inquiry', 'top'), ('thread', 'top'),
         ('events', 'bottom'), ('checkin', 'bottom'), ('access', 'bottom')]

art = lambda name: Image.open(os.path.join(DIR, 'art', f'{name}.png')).convert('RGBA')
status = art('status')
STATUS_H = status.height
HOME_H = round(34 * W / 393)


def frame(raw, caption=None, cap_alpha=0.0, cap_y=0):
    """One finished frame: status bar, app, home indicator, caption."""
    app = raw.convert('RGB')
    app_h = H - STATUS_H - HOME_H
    app = app.resize((W, app_h), Image.LANCZOS) if app.size != (W, app_h) else app
    out = Image.new('RGB', (W, H), app.getpixel((W // 2, app_h - 2)))
    out.paste(app, (0, STATUS_H))
    out.paste(status, (0, 0), status)
    bar_w, bar_h = round(140 * W / 393), round(5 * W / 393)
    bar = Image.new('RGBA', (bar_w, bar_h), (18, 32, 25, 255))
    mask = Image.new('L', (bar_w, bar_h), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, bar_w - 1, bar_h - 1), radius=bar_h // 2, fill=255)
    out.paste(bar, ((W - bar_w) // 2, H - round(8 * W / 393) - bar_h), mask)
    if caption is not None and cap_alpha > 0:
        c = caption.copy()
        c.putalpha(c.getchannel('A').point(lambda a: int(a * cap_alpha)))
        out.paste(c, (0, cap_y), c)
    return out


def shot_frames(name, where):
    files = sorted(glob.glob(os.path.join(DIR, 'raw', name, '*.png')))
    cap = art(f'caption-{name}')
    box = cap.getchannel('A').getbbox()
    cap = cap.crop((0, box[1], W, box[3]))
    cap_y = STATUS_H + 26 if where == 'top' else H - HOME_H - cap.height - 26
    big = None
    if name == 'access':
        big = Image.open(os.path.join(DIR, 'raw', 'access-big', '0001.png')).convert('RGB')
    n = len(files)
    for i, f in enumerate(files):
        raw = Image.open(f).convert('RGB')
        if big is not None and i >= 40:
            # Text size goes up: blend into the same screen at 150%.
            t = min(1.0, (i - 40) / 10)
            raw = Image.blend(raw, big.resize(raw.size), t)
        a_in = min(1.0, max(0.0, (i - 4) / 8))
        a_out = min(1.0, max(0.0, (n - 1 - i) / 6))
        yield frame(raw, cap, min(a_in, a_out), cap_y)


def main():
    frames_dir = os.path.join(DIR, 'frames')
    shutil.rmtree(frames_dir, ignore_errors=True)
    os.makedirs(frames_dir)
    count = 0

    def write(img):
        nonlocal count
        count += 1
        img.save(os.path.join(frames_dir, f'{count:05d}.png'), compress_level=1)

    tail = []  # the previous shot's last FADE frames, waiting to be crossfaded
    for idx, (name, where) in enumerate(SHOTS):
        frames = list(shot_frames(name, where))
        if tail:
            for k in range(FADE):
                write(Image.blend(tail[k], frames[k], (k + 1) / (FADE + 1)))
            frames = frames[FADE:]
        last = idx == len(SHOTS) - 1
        keep = frames if last else frames[:-FADE]
        for f in keep:
            write(f)
        tail = [] if last else frames[-FADE:]
        final = frames[-1]

    end = art('endcard').convert('RGB')
    for k in range(END_FADE):
        write(Image.blend(final, end, (k + 1) / END_FADE))
    for _ in range(END_HOLD):
        write(end)

    seconds = count / FPS
    assert 15 <= seconds <= 30, f'App previews must be 15–30 seconds; this is {seconds:.1f}'
    mp4 = os.path.join(HERE, 'out', 'the-index-app-preview-iphone.mp4')
    subprocess.run([
        'ffmpeg', '-y', '-loglevel', 'error',
        '-framerate', str(FPS), '-i', os.path.join(frames_dir, '%05d.png'),
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-map', '0:v', '-map', '1:a', '-shortest',
        '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
        '-b:v', '11M', '-minrate', '11M', '-maxrate', '11M', '-bufsize', '11M', '-x264-params', 'nal-hrd=cbr', '-r', str(FPS),
        '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart', mp4,
    ], check=True)
    print(f'{count} frames, {seconds:.2f}s -> {os.path.relpath(mp4, HERE)}')


if __name__ == '__main__':
    main()
