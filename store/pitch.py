"""The pitch video: a 16:9 story about The Index, built from real recordings of the app.

Uses the frames store/preview.mjs records (run it for iphone and ipad first), and adds the story around them:
an opening title, what BFI is, each feature on a phone or iPad beside a headline, the staff tools, why it's
ready, and a closing card. Silent, so it plays in a room while someone talks, or with music added in an editor.

Output: store/out/the-index-pitch.mp4 (1920 x 1080, 30 fps, H.264) and a poster frame.
Usage: npx expo export --platform web && node store/preview.mjs iphone && node store/preview.mjs ipad && python3 store/pitch.py
"""
import glob
import math
import os
import re
import subprocess

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'out')
W, H = 1920, 1080
FPS = 30
FADE = 12

# Brand
FOREST = (11, 58, 37)
FOREST_2 = (11, 74, 47)
LEAF = (0, 118, 64)
HARVEST = (255, 216, 77)
WHITE = (255, 255, 255)
MIST = (214, 236, 222)

FONT_DIR = os.path.join(ROOT, 'node_modules', '@expo-google-fonts')
_fonts = {}


def font(kind, size):
    path = {
        'hero': 'figtree/800ExtraBold/Figtree_800ExtraBold.ttf',
        'bold': 'figtree/700Bold/Figtree_700Bold.ttf',
        'semi': 'figtree/600SemiBold/Figtree_600SemiBold.ttf',
        'body': 'atkinson-hyperlegible/400Regular/AtkinsonHyperlegible_400Regular.ttf',
        'bodyBold': 'atkinson-hyperlegible/700Bold/AtkinsonHyperlegible_700Bold.ttf',
    }[kind]
    key = (kind, size)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(os.path.join(FONT_DIR, path), size)
    return _fonts[key]


# ---------------------------------------------------------------------------
# Motion helpers
# ---------------------------------------------------------------------------
def ease(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def appear(t, start, length=18):
    """0 to 1 over `length` frames from frame `start`."""
    return ease((t - start) / length)


# ---------------------------------------------------------------------------
# Backgrounds
# ---------------------------------------------------------------------------
def gradient_bg():
    """Deep forest into BFI green, with a low harvest sun glowing in one corner (as in the app's bands)."""
    a = Image.new('RGB', (W, H), FOREST)
    b = Image.new('RGB', (W, H), (14, 92, 55))
    # A smooth diagonal: mostly left-to-right, a little top-to-bottom.
    across = Image.linear_gradient('L').rotate(90).resize((W, H))
    down = Image.linear_gradient('L').resize((W, H))
    diag = Image.blend(across, down, 0.4)
    base = Image.composite(b, a, diag.point(lambda v: int(v * 0.85)))
    glow = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(glow)
    d.ellipse((W - 520, H - 420, W + 380, H + 480), fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    sun = Image.new('RGB', (W, H), HARVEST)
    base = Image.composite(sun, base, glow.point(lambda v: int(v * 0.55)))
    return base


def photo_bg(name, t, total, darkness=0.55):
    """A landscape with a slow push-in and a dark wash so white type reads."""
    img = Image.open(os.path.join(ROOT, 'assets', 'images', 'landscapes', f'{name}.jpg')).convert('RGB')
    # Cover-fit, then a gentle 6% zoom across the scene.
    zoom = 1.0 + 0.06 * (t / max(1, total))
    scale = max(W / img.width, H / img.height) * zoom
    img = img.resize((math.ceil(img.width * scale), math.ceil(img.height * scale)), Image.LANCZOS)
    left = (img.width - W) // 2
    top = (img.height - H) // 2
    img = img.crop((left, top, left + W, top + H))
    wash = Image.new('RGB', (W, H), (6, 24, 15))
    shade = Image.linear_gradient('L').resize((W, H)).point(lambda v: int(255 * (darkness * 0.6 + darkness * 0.5 * v / 255)))
    return Image.composite(wash, img, shade)


BG = None


def bg():
    global BG
    if BG is None:
        BG = gradient_bg()
    return BG.copy()


# ---------------------------------------------------------------------------
# Type: *words in stars* are set in harvest yellow
# ---------------------------------------------------------------------------
def words_of(text):
    """Words, each a list of (characters, highlighted) pieces, so "*connect*." keeps its full stop."""
    out, hl = [], False
    for raw in text.split(' '):
        if not raw:
            continue
        pieces, buf = [], ''
        for ch in raw:
            if ch == '*':
                if buf:
                    pieces.append((buf, hl))
                buf, hl = '', not hl
            else:
                buf += ch
        if buf:
            pieces.append((buf, hl))
        if pieces:
            out.append(pieces)
    return out


def word_w(word, f):
    return f.getlength(''.join(p for p, _ in word))


def wrap(text, f, max_w):
    lines, line, width = [], [], 0.0
    space = f.getlength(' ')
    for w in words_of(text):
        ww = word_w(w, f)
        if line and width + space + ww > max_w:
            lines.append(line)
            line, width = [w], ww
        else:
            width += (space if line else 0) + ww
            line.append(w)
    if line:
        lines.append(line)
    return lines


def draw_text(img, xy, text, f, fill=WHITE, max_w=1600, line_h=None, alpha=1.0, rise=0, align='left', hl=HARVEST):
    if alpha <= 0:
        return 0
    x0, y0 = xy
    lines = wrap(text, f, max_w)
    lh = line_h or int(f.size * 1.15)
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    space = f.getlength(' ')
    for i, line in enumerate(lines):
        total = sum(word_w(w, f) for w in line) + space * (len(line) - 1)
        x = x0 - total / 2 if align == 'center' else x0
        y = y0 + i * lh + rise
        for w in line:
            for piece, is_hl in w:
                d.text((x, y), piece, font=f, fill=(hl if is_hl else fill) + (255,))
                x += f.getlength(piece)
            x += space
    if alpha < 1:
        layer.putalpha(layer.getchannel('A').point(lambda a: int(a * alpha)))
    img.paste(layer, (0, 0), layer)
    return len(lines) * lh


def pill(img, xy, text, f, fg, bg_rgba, alpha=1.0, pad=(22, 10)):
    if alpha <= 0:
        return
    w = f.getlength(text) + pad[0] * 2
    h = f.size + pad[1] * 2
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x, y = xy
    d.rounded_rectangle((x, y, x + w, y + h), radius=h / 2, fill=bg_rgba[:3] + (int(bg_rgba[3] * alpha),))
    d.text((x + pad[0], y + pad[1] - f.size * 0.08), text, font=f, fill=fg + (int(255 * alpha),))
    img.paste(layer, (0, 0), layer)


# ---------------------------------------------------------------------------
# Devices: the recorded app screens inside a simple modern bezel
# ---------------------------------------------------------------------------
DEVICES = {
    # app px, status/home strip heights (pt), points wide, shown height on the 1080p frame, corner radius ratio
    'iphone': dict(px=(886, 1920), pt=393, status=54, home=34, bar=140, show_h=900, radius=0.135, bezel=16),
    'ipad': dict(px=(1200, 1600), pt=1032, status=24, home=20, bar=320, show_h=860, radius=0.05, bezel=22),
}
_status_cache = {}


def screen(device, raw):
    """Status bar, app and home indicator, like the App Store composer."""
    c = DEVICES[device]
    sw, sh = c['px']
    pt = sw / c['pt']
    status_img = _status_cache.get(device)
    if status_img is None:
        art = os.path.join(OUT, 'preview', device, 'art')
        status_img = {k: Image.open(os.path.join(art, f'status-{k}.png')).convert('RGBA') for k in ('dark', 'light')}
        _status_cache[device] = status_img
    status_h = status_img['dark'].height
    home_h = round(c['home'] * pt)
    app_h = sh - status_h - home_h
    app = raw.convert('RGB')
    if app.size != (sw, app_h):
        app = app.resize((sw, app_h), Image.LANCZOS)
    out = Image.new('RGB', (sw, sh), app.getpixel((sw - 3, app_h - 2)))
    out.paste(app, (0, status_h))
    top = app.getpixel((sw - 3, 2))
    out.paste(Image.new('RGB', (sw, status_h), top), (0, 0))
    ink = status_img['light' if 0.299 * top[0] + 0.587 * top[1] + 0.114 * top[2] < 150 else 'dark']
    out.paste(ink, (0, 0), ink)
    bar_w, bar_h = round(c['bar'] * pt), round(5 * pt)
    d = ImageDraw.Draw(out)
    by = sh - round(8 * pt) - bar_h
    d.rounded_rectangle(((sw - bar_w) // 2, by, (sw + bar_w) // 2, by + bar_h), radius=bar_h // 2, fill=(18, 32, 25))
    return out


_masks = {}


def device_image(device, raw):
    c = DEVICES[device]
    scr = screen(device, raw)
    show_h = c['show_h']
    show_w = round(scr.width * show_h / scr.height)
    scr = scr.resize((show_w, show_h), Image.LANCZOS)
    b = c['bezel']
    key = (device, show_w, show_h)
    if key not in _masks:
        r = int(show_w * c['radius']) if device == 'iphone' else int(show_h * c['radius'])
        m = Image.new('L', (show_w, show_h), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, show_w - 1, show_h - 1), radius=r, fill=255)
        frame = Image.new('RGBA', (show_w + 2 * b, show_h + 2 * b), (0, 0, 0, 0))
        fd = ImageDraw.Draw(frame)
        fd.rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), radius=r + b, fill=(14, 20, 17, 255))
        fd.rounded_rectangle((2, 2, frame.width - 3, frame.height - 3), radius=r + b - 2, outline=(70, 86, 78, 255), width=2)
        shadow = Image.new('RGBA', (frame.width + 160, frame.height + 160), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle((80, 100, 80 + frame.width, 100 + frame.height), radius=r + b, fill=(0, 0, 0, 130))
        shadow = shadow.filter(ImageFilter.GaussianBlur(36))
        _masks[key] = (m, frame, shadow)
    m, frame, shadow = _masks[key]
    out = shadow.copy()
    out.paste(frame, (80, 80), frame)
    out.paste(scr, (80 + b, 80 + b), m)
    return out  # includes an 80px shadow margin


def raw_frames(device, shot):
    files = sorted(glob.glob(os.path.join(OUT, 'preview', device, 'raw', shot, '*.png')))
    if not files:
        raise SystemExit(f'No recording for {device}/{shot}. Run: node store/preview.mjs {device}')
    return files


# ---------------------------------------------------------------------------
# Scenes. Each is (frames, render(t) -> Image).
# ---------------------------------------------------------------------------
def title_scene():
    n = 165

    def render(t):
        img = photo_bg('discover', t, n, darkness=0.62)
        a1, a2, a3 = appear(t, 8, 24), appear(t, 26, 22), appear(t, 46, 22)
        pill(img, (W // 2 - 205, 330), 'A FREE COMPANION APP FOR', font('semi', 26), HARVEST, (11, 58, 37, 200), alpha=a1)
        draw_text(img, (W // 2, 392), 'Black Farmers Index', font('semi', 46), fill=MIST, align='center', alpha=a1, rise=int(18 * (1 - a1)))
        draw_text(img, (W // 2, 470), 'The Index', font('hero', 176), align='center', alpha=a2, rise=int(30 * (1 - a2)))
        draw_text(img, (W // 2, 700), 'Find Black farmers. Talk to them. Grow together.', font('body', 40), fill=MIST, align='center', alpha=a3, rise=int(16 * (1 - a3)))
        return img

    return n, render


def context_scene():
    n = 210
    stats = [('1,300', 'growers listed', '~'), ('400', 'women-owned farms', '+'), ('300', 'organic, natural or regenerative', '+')]

    def render(t):
        img = bg()
        a = appear(t, 0, 20)
        draw_text(img, (160, 170), 'BLACK FARMERS INDEX', font('semi', 28), fill=HARVEST, alpha=a)
        draw_text(img, (160, 222), 'The largest free directory of *Black farmers* in America.', font('hero', 74), max_w=1500, line_h=88, alpha=a, rise=int(20 * (1 - a)))
        for i, (num, label, mark) in enumerate(stats):
            s = appear(t, 40 + i * 14, 22)
            x = 160 + i * 540
            count = int(int(num.replace(',', '')) * ease((t - 40 - i * 14) / 40))
            shown = f'{count:,}'
            text = f'~{shown}' if mark == '~' else f'{shown}+'
            draw_text(img, (x, 560), text, font('hero', 120), alpha=s, rise=int(24 * (1 - s)))
            draw_text(img, (x + 4, 712), label, font('body', 34), fill=MIST, max_w=440, alpha=s)
        draw_text(img, (160, 950), 'Figures from blackfarmersindex.com', font('body', 24), fill=(150, 190, 168), alpha=appear(t, 90, 20))
        return img

    return n, render


def pivot_scene():
    n = 135

    def render(t):
        img = bg()
        a, b = appear(t, 0, 20), appear(t, 34, 22)
        draw_text(img, (W // 2, 360), 'A directory helps people *find* farms.', font('hero', 82), align='center', max_w=1700, alpha=a, rise=int(18 * (1 - a)))
        draw_text(img, (W // 2, 500), 'The Index helps them *connect*.', font('hero', 82), align='center', max_w=1700, alpha=b, rise=int(18 * (1 - b)))
        draw_text(img, (W // 2, 680), 'Buyers, farmers and BFI, in one place, on any phone.', font('body', 38), fill=MIST, align='center', alpha=appear(t, 60, 20))
        return img

    return n, render


def feature_scene(device, shot, eyebrow, headline, body, side='right', hold=24):
    files = raw_frames(device, shot)
    n = len(files) + hold
    is_pad = device == 'ipad'
    big = None
    if shot == 'access':
        big_files = raw_frames(device, 'access-big')
        big = Image.open(big_files[0]).convert('RGB')

    def render(t):
        img = bg()
        i = min(t, len(files) - 1)
        raw = Image.open(files[i]).convert('RGB')
        if big is not None and i >= 40:
            # The text-size slider goes up: the same screen blends into its 150% version.
            raw = Image.blend(raw, big.resize(raw.size), min(1.0, (i - 40) / 10))
        dev = device_image(device, raw)
        s = appear(t, 0, 22)
        # Device slides up into place.
        dx = (W - dev.width - (40 if is_pad else 120)) if side == 'right' else (40 if is_pad else 120)
        dy = (H - dev.height) // 2 + 20 + int(70 * (1 - s))
        if s < 1:
            dev = dev.copy()
            dev.putalpha(dev.getchannel('A').point(lambda v: int(v * s)))
        img.paste(dev, (dx, dy), dev)
        tx = 150 if side == 'right' else (W - (820 if is_pad else 900))
        tw = (W - dev.width - 330) if is_pad else 860
        a1, a2, a3 = appear(t, 6, 18), appear(t, 14, 20), appear(t, 26, 20)
        draw_text(img, (tx, 300), eyebrow.upper(), font('semi', 28), fill=HARVEST, alpha=a1)
        hh = draw_text(img, (tx, 350), headline, font('hero', 84), max_w=tw, line_h=96, alpha=a2, rise=int(22 * (1 - a2)))
        draw_text(img, (tx, 350 + hh + 34), body, font('body', 38), fill=MIST, max_w=tw - 20, line_h=52, alpha=a3, rise=int(14 * (1 - a3)))
        return img

    return n, render


def tools_scene():
    n = 225
    tiles = [
        ('Storm check-ins', '“Are you OK?” to a region. See who needs help, with a number to call.'),
        ('Surveys', 'Ask growers what they need. Totals, quotes and a CSV for grant reports.'),
        ('Announcements', 'Push, text and email from one form, to everyone or one region.'),
        ('Review queue', 'Approve and verify new farms and events before they go live.'),
        ('Impact report', 'Inquiries, views, RSVPs and farms reached, for funders.'),
        ('Text line', 'Anyone with a basic phone can text HONEY LA and get growers back.'),
    ]

    def render(t):
        img = bg()
        a = appear(t, 0, 20)
        draw_text(img, (150, 120), 'FOR BFI’S TEAM', font('semi', 28), fill=HARVEST, alpha=a)
        draw_text(img, (150, 170), 'Tools to *run the network*, not just list it.', font('hero', 72), max_w=1650, alpha=a, rise=int(18 * (1 - a)))
        cw, ch, gap = 520, 250, 40
        for i, (title, text) in enumerate(tiles):
            s = appear(t, 26 + i * 8, 20)
            if s <= 0:
                continue
            x = 150 + (i % 3) * (cw + gap)
            y = 380 + (i // 3) * (ch + gap) + int(26 * (1 - s))
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(layer)
            d.rounded_rectangle((x, y, x + cw, y + ch), radius=28, fill=(255, 255, 255, int(26 * s)))
            d.rounded_rectangle((x + 34, y + 38, x + 44, y + 78), radius=5, fill=HARVEST + (int(255 * s),))
            img.paste(layer, (0, 0), layer)
            draw_text(img, (x + 64, y + 30), title, font('bold', 40), alpha=s)
            draw_text(img, (x + 36, y + 102), text, font('body', 29), fill=MIST, max_w=cw - 72, line_h=40, alpha=s)
        return img

    return n, render


def ready_scene():
    n = 225
    rows = [
        ('Free, and BFI’s to own', 'No fees, no ads. The code, the data and the members belong to BFI.'),
        ('One app, every screen', 'iPhone, iPad, Android and the web, from a single codebase.'),
        ('Built for every reader', 'Larger text, high contrast, read-aloud, five languages, and texting for basic phones.'),
        ('Tested hard', 'Hundreds of automated security checks, and every screen tested on phone and iPad.'),
    ]

    def render(t):
        img = bg()
        a = appear(t, 0, 20)
        draw_text(img, (150, 150), 'READY TO LAUNCH', font('semi', 28), fill=HARVEST, alpha=a)
        draw_text(img, (150, 200), 'Built as a *gift*. Built to last.', font('hero', 84), max_w=1600, alpha=a, rise=int(18 * (1 - a)))
        for i, (title, text) in enumerate(rows):
            s = appear(t, 30 + i * 12, 20)
            y = 410 + i * 140 + int(20 * (1 - s))
            if s > 0:
                layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
                ImageDraw.Draw(layer).ellipse((150, y + 10, 182, y + 42), fill=HARVEST + (int(255 * s),))
                img.paste(layer, (0, 0), layer)
            draw_text(img, (214, y), title, font('bold', 44), alpha=s)
            draw_text(img, (214, y + 58), text, font('body', 32), fill=MIST, max_w=1500, alpha=s)
        return img

    return n, render


def close_scene():
    n = 180

    def render(t):
        img = photo_bg('row-crops', t, n, darkness=0.66)
        a, b, c = appear(t, 6, 24), appear(t, 26, 22), appear(t, 50, 22)
        draw_text(img, (W // 2, 330), 'The Index', font('hero', 150), align='center', alpha=a, rise=int(24 * (1 - a)))
        draw_text(img, (W // 2, 530), 'A gift to *Black Farmers Index*.', font('bold', 58), align='center', alpha=b, rise=int(16 * (1 - b)))
        draw_text(img, (W // 2, 640), 'Build + Connect + Grow', font('semi', 38), fill=MIST, align='center', alpha=c)
        return img

    return n, render


def story():
    return [
        title_scene(),
        context_scene(),
        pivot_scene(),
        feature_scene('iphone', 'discover', 'Discover', 'Find Black farmers *near you*.',
                      'Search by product or region, or browse what’s fresh this week.'),
        feature_scene('iphone', 'farm', 'Trust', 'Every farm, *verified by BFI*.',
                      'Real stories, what’s in season, and clear ways to buy, from pickup to online orders.', side='left'),
        feature_scene('iphone', 'inquiry', 'Order', 'Ask for *exactly* what you need.',
                      'A short request the farmer can answer in one tap: ready, part of it, or not this week.'),
        feature_scene('iphone', 'thread', 'Connect', 'Answer in the app, *or by text*.',
                      'Farmers without a smartphone reply YES, PART or NO by text message, and it lands in the chat.', side='left'),
        feature_scene('ipad', 'messages', 'On iPad', 'Room to run a *farm stand*.',
                      'Conversations and inquiries side by side, for farmers and market managers.'),
        feature_scene('iphone', 'events', 'Gather', 'Never miss a *market day*.',
                      'Workdays, markets and BFI events, with reminders by push, text or email.', side='left'),
        feature_scene('iphone', 'checkin', 'Care', 'Checking in *after the storm*.',
                      'BFI asks a region “Are you OK?”. Farmers answer in the app or by text, and staff see who needs help.'),
        feature_scene('iphone', 'access', 'Access', 'Made for *every reader*.',
                      'Larger text, high contrast and read-aloud, in English, Spanish, French, Haitian Creole and Portuguese.', side='left'),
        tools_scene(),
        ready_scene(),
        close_scene(),
    ]


def main():
    scenes = story()
    total = sum(n for n, _ in scenes) - FADE * (len(scenes) - 1)
    mp4 = os.path.join(OUT, 'the-index-pitch.mp4')
    os.makedirs(OUT, exist_ok=True)
    enc = subprocess.Popen([
        'ffmpeg', '-y', '-loglevel', 'error',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-map', '0:v', '-map', '1:a', '-shortest',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4,
    ], stdin=subprocess.PIPE)
    written = 0
    poster_at = None
    tail = None  # the previous scene's last FADE frames
    for idx, (n, render) in enumerate(scenes):
        last = idx == len(scenes) - 1
        for t in range(n):
            frame = render(t)
            if tail is not None and t < FADE:
                frame = Image.blend(tail[t], frame, (t + 1) / (FADE + 1))
            if not last and t >= n - FADE:
                if t == n - FADE:
                    tail = []
                tail.append(frame)
                continue
            enc.stdin.write(frame.tobytes())
            written += 1
            if idx == 0 and t == 120:
                frame.save(os.path.join(OUT, 'the-index-pitch-poster.png'))
        if last:
            tail = None
        print(f'scene {idx + 1}/{len(scenes)} done ({written} frames)', flush=True)
    enc.stdin.close()
    enc.wait()
    print(f'{written} frames, {written / FPS:.1f}s -> {os.path.relpath(mp4, ROOT)} (expected {total})')


if __name__ == '__main__':
    main()
