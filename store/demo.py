"""The demo video: what The Index does, the problems it solves, and the thinking behind it.

Builds on pitch.py (same brand, type, devices and app recordings) and adds the people it serves, the design
principles, and what comes next. Silent, so it plays in a room while someone talks, or with music added later.

Output: store/out/the-index-demo.mp4 (1920 x 1080, 30 fps, H.264) and a poster frame.
Usage: npx expo export --platform web && node store/preview.mjs iphone && node store/preview.mjs ipad && python3 store/demo.py
"""
import math
import os
import subprocess

from PIL import Image, ImageDraw

import pitch as P
from pitch import FADE, FPS, H, HARVEST, MIST, W, WHITE, appear, draw_text, font

PHOTOS = os.path.join(P.ROOT, 'assets', 'images', 'photos')
ICON = os.path.join(P.ROOT, 'assets', 'images', 'icon.png')
_cache = {}


def _photo(name):
    if name not in _cache:
        _cache[name] = Image.open(os.path.join(PHOTOS, f'{name}.jpg')).convert('RGB')
    return _cache[name]


def cover(name, w, h, t, total, zoom=0.06, focus=(0.5, 0.5)):
    """Cover-fit a placeholder photo into w x h with a slow push-in."""
    img = _photo(name)
    z = 1.0 + zoom * (t / max(1, total))
    scale = max(w / img.width, h / img.height) * z
    img = img.resize((math.ceil(img.width * scale), math.ceil(img.height * scale)), Image.LANCZOS)
    left = int((img.width - w) * focus[0])
    top = int((img.height - h) * focus[1])
    return img.crop((left, top, left + w, top + h))


def photo_full(name, t, total, darkness=0.6, focus=(0.5, 0.4)):
    img = cover(name, W, H, t, total, focus=focus)
    wash = Image.new('RGB', (W, H), (6, 24, 15))
    shade = Image.linear_gradient('L').resize((W, H)).point(lambda v: int(255 * (darkness * 0.55 + darkness * 0.5 * v / 255)))
    return Image.composite(wash, img, shade)


def icon(size):
    key = ('icon', size)
    if key not in _cache:
        im = Image.open(ICON).convert('RGB').resize((size, size), Image.LANCZOS)
        m = Image.new('L', (size, size), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.225), fill=255)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(im, (0, 0), m)
        _cache[key] = out
    return _cache[key]


def paste_fade(img, layer, xy, a):
    if a <= 0:
        return
    if a < 1:
        layer = layer.copy()
        layer.putalpha(layer.getchannel('A').point(lambda v: int(v * a)))
    img.paste(layer, xy, layer)


# ---------------------------------------------------------------------------
# Scenes
# ---------------------------------------------------------------------------
def title_scene():
    n = 165

    def render(t):
        img = photo_full('cabbage-harvest-portrait', t, n, darkness=0.68, focus=(0.42, 0.35))
        a0, a1, a2, a3 = appear(t, 2, 22), appear(t, 14, 24), appear(t, 30, 22), appear(t, 52, 22)
        draw_text(img, (W // 2, 380), 'A FREE COMPANION APP FOR BLACK FARMERS INDEX', font('semi', 28), fill=HARVEST, align='center', alpha=a1)
        draw_text(img, (W // 2, 430), 'The Index', font('hero', 170), align='center', alpha=a2, rise=int(30 * (1 - a2)))
        draw_text(img, (W // 2, 660), 'What it does, who it helps, and why it’s built this way.', font('body', 40), fill=MIST, align='center', alpha=a3, rise=int(16 * (1 - a3)))
        return img

    return n, render


def section_scene(eyebrow, headline, photo, focus=(0.5, 0.4)):
    n = 105

    def render(t):
        img = photo_full(photo, t, n, darkness=0.72, focus=focus)
        a, b = appear(t, 4, 20), appear(t, 16, 22)
        draw_text(img, (W // 2, 420), eyebrow.upper(), font('semi', 30), fill=HARVEST, align='center', alpha=a)
        draw_text(img, (W // 2, 475), headline, font('hero', 96), align='center', max_w=1600, line_h=108, alpha=b, rise=int(20 * (1 - b)))
        return img

    return n, render


def problem_scene(photo, who, headline, pains, fix, focus=(0.5, 0.4), n=210):
    pw = 820  # photo panel width

    def render(t):
        img = P.bg()
        s = appear(t, 0, 22)
        panel = cover(photo, pw, H, t, n, zoom=0.05, focus=focus).convert('RGBA')
        img.paste(panel.convert('RGB'), (int(-80 * (1 - s)), 0))
        # soft edge into the text side
        edge = Image.linear_gradient('L').rotate(90).resize((160, H))
        img.paste(P.bg().crop((pw - 160, 0, pw, H)), (pw - 160, 0), edge)
        tx, tw = pw + 90, W - pw - 170
        a1, a2 = appear(t, 8, 18), appear(t, 18, 20)
        draw_text(img, (tx, 150), who.upper(), font('semi', 28), fill=HARVEST, alpha=a1)
        hh = draw_text(img, (tx, 200), headline, font('hero', 68), max_w=tw, line_h=80, alpha=a2, rise=int(18 * (1 - a2)))
        y = 200 + hh + 40
        for i, p in enumerate(pains):
            a = appear(t, 36 + i * 12, 18)
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
            ImageDraw.Draw(layer).line((tx, y + 22, tx + 26, y + 22), fill=(255, 140, 120, int(255 * a)), width=5)
            img.paste(layer, (0, 0), layer)
            ph = draw_text(img, (tx + 46, y), p, font('body', 34), fill=MIST, max_w=tw - 46, line_h=46, alpha=a)
            y += ph + 22
        a = appear(t, 84, 22)
        if a > 0:
            y += 26
            box = Image.new('RGBA', img.size, (0, 0, 0, 0))
            fh = P.wrap(fix, font('bodyBold', 34), tw - 70)
            bh = len(fh) * 46 + 50
            ImageDraw.Draw(box).rounded_rectangle((tx, y, tx + tw, y + bh), radius=24, fill=(255, 216, 77, int(255 * a)))
            img.paste(box, (0, 0), box)
            draw_text(img, (tx + 34, y + 24), fix, font('bodyBold', 34), fill=(11, 58, 37), max_w=tw - 70, line_h=46, alpha=a, hl=(11, 58, 37))
        return img

    return n, render


def thinking_scene():
    n = 285
    rows = [
        ('Farmers first', 'Works on any phone: answer buyers and BFI by text, with a save-data mode for rural signal.'),
        ('Trust over traffic', 'BFI reviews and verifies every farm. Home addresses stay private; buyers see a pickup point or town.'),
        ('Every reader', 'Larger text, high contrast and read-aloud, in English, Spanish, French, Haitian Creole and Portuguese.'),
        ('BFI owns it', 'A gift: free, no ads, no fees. The code, the data and the members belong to BFI.'),
        ('Built to hand over', 'One codebase for iPhone, iPad, Android and the web, tested and documented so BFI’s team can run it.'),
    ]

    def render(t):
        img = P.bg()
        a = appear(t, 0, 20)
        draw_text(img, (150, 110), 'THE THINKING BEHIND IT', font('semi', 28), fill=HARVEST, alpha=a)
        draw_text(img, (150, 160), 'Design for the farmer in the field, *not the desk*.', font('hero', 70), max_w=1650, alpha=a, rise=int(18 * (1 - a)))
        for i, (title, text) in enumerate(rows):
            s = appear(t, 30 + i * 16, 20)
            y = 330 + i * 140 + int(18 * (1 - s))
            if s > 0:
                layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
                ImageDraw.Draw(layer).ellipse((150, y + 10, 180, y + 40), fill=HARVEST + (int(255 * s),))
                img.paste(layer, (0, 0), layer)
            draw_text(img, (210, y), title, font('bold', 42), alpha=s)
            draw_text(img, (210, y + 54), text, font('body', 30), fill=MIST, max_w=1560, alpha=s)
        return img

    return n, render


def next_scene():
    n = 225
    doors = [
        ('cabbage-field-basket', 'I’m a farmer', 'Apply to join The Index, then list what’s fresh.', (0.45, 0.35)),
        ('greenhouse-family', 'I’m looking for food', 'Find farmers near you and message them to order.', (0.35, 0.3)),
        ('seedling-trays', 'I want to help', 'See where BFI and growers need volunteers.', (0.6, 0.4)),
    ]

    def render(t):
        img = P.bg()
        a = appear(t, 0, 20)
        draw_text(img, (150, 110), 'COMING NEXT', font('semi', 28), fill=HARVEST, alpha=a)
        draw_text(img, (150, 160), 'Three clear ways in, and *messaging up front*.', font('hero', 70), max_w=1650, alpha=a, rise=int(18 * (1 - a)))
        cw, chp, gap = 520, 360, 40
        for i, (photo, title, text, focus) in enumerate(doors):
            s = appear(t, 28 + i * 12, 22)
            if s <= 0:
                continue
            x = 150 + i * (cw + gap)
            y = 340 + int(30 * (1 - s))
            card = Image.new('RGBA', (cw, chp + 230), (0, 0, 0, 0))
            m = Image.new('L', card.size, 0)
            ImageDraw.Draw(m).rounded_rectangle((0, 0, cw - 1, card.height - 1), radius=30, fill=255)
            body = Image.new('RGBA', card.size, (255, 255, 255, 30))
            body.paste(cover(photo, cw, chp, t, n, zoom=0.04, focus=focus).convert('RGBA'), (0, 0))
            card.paste(body, (0, 0), m)
            paste_fade(img, card, (x, y), s)
            draw_text(img, (x + 32, y + chp + 28), title, font('bold', 42), alpha=s)
            draw_text(img, (x + 32, y + chp + 88), text, font('body', 30), fill=MIST, max_w=cw - 64, line_h=40, alpha=s)
        return img

    return n, render


def close_scene():
    n = 195

    def render(t):
        img = photo_full('lettuce-seedling-hands', t, n, darkness=0.7, focus=(0.5, 0.45))
        a0, a, b, c = appear(t, 2, 22), appear(t, 12, 24), appear(t, 30, 22), appear(t, 54, 22)
        paste_fade(img, icon(140), (W // 2 - 70, 200 + int(20 * (1 - a0))), a0)
        draw_text(img, (W // 2, 380), 'The Index', font('hero', 150), align='center', alpha=a, rise=int(24 * (1 - a)))
        draw_text(img, (W // 2, 580), 'A gift to *Black Farmers Index*.', font('bold', 58), align='center', alpha=b, rise=int(16 * (1 - b)))
        draw_text(img, (W // 2, 690), 'Find Black farmers. Talk to them. Grow together.', font('semi', 38), fill=MIST, align='center', alpha=c)
        draw_text(img, (W // 2, 990), 'Photos are placeholders until BFI’s own photography is added.', font('body', 24), fill=(170, 200, 182), align='center', alpha=c)
        return img

    return n, render


def story():
    f = P.feature_scene
    return [
        title_scene(),
        P.context_scene(),
        section_scene('The problem', 'A directory is a start. *Connection* is the hard part.', 'farmer-in-field', focus=(0.7, 0.4)),
        problem_scene('greenhouse-harvest-crate', 'For farmers', 'Hard to get found. *Harder to answer* from the field.',
                      ['Buyers call while your hands are in the dirt.', 'Signal is spotty, and one more app is one more chore.'],
                      'The Index: a verified listing, and replies by text from any phone.', focus=(0.38, 0.4)),
        problem_scene('greenhouse-family', 'For buyers', 'Want to buy Black-grown. *Don’t know* who’s near.',
                      ['A list of names doesn’t say what’s fresh or how to buy.', 'Calling around takes time most people don’t have.'],
                      'The Index: search what’s fresh nearby, see how to buy, and ask in one tap.', focus=(0.3, 0.35)),
        problem_scene('dairy-barn', 'For BFI', 'About 1,300 growers. *No easy way* to reach them all.',
                      ['After a storm, checking on farms means a phone tree.', 'Funders ask for impact, and the numbers live in spreadsheets.'],
                      'The Index: storm check-ins, surveys, announcements and an impact report, built in.', focus=(0.25, 0.5)),
        P.pivot_scene(),
        f('iphone', 'discover', 'Discover', 'Find Black farmers *near you*.',
          'Search by product or region, or browse what’s fresh this week.'),
        f('iphone', 'farm', 'Trust', 'Every farm, *verified by BFI*.',
          'Real stories, what’s in season, and clear ways to buy, from pickup to online orders.', side='left'),
        f('iphone', 'inquiry', 'Order', 'Ask for *exactly* what you need.',
          'A short request the farmer can answer in one tap: ready, part of it, or not this week.'),
        f('iphone', 'thread', 'Connect', 'Answer in the app, *or by text*.',
          'Farmers without a smartphone reply YES, PART or NO by text message, and it lands in the chat.', side='left'),
        f('ipad', 'messages', 'On iPad', 'Room to run a *farm stand*.',
          'Conversations and inquiries side by side, for farmers and market managers.'),
        f('iphone', 'events', 'Gather', 'Never miss a *market day*.',
          'Workdays, markets and BFI events, with reminders by push, text or email.', side='left'),
        f('iphone', 'checkin', 'Care', 'Checking in *after the storm*.',
          'BFI asks a region “Are you OK?”. Farmers answer in the app or by text, and staff see who needs help.'),
        f('iphone', 'access', 'Access', 'Made for *every reader*.',
          'Larger text, high contrast and read-aloud, in five languages.', side='left'),
        P.tools_scene(),
        thinking_scene(),
        next_scene(),
        close_scene(),
    ]


def main():
    scenes = story()
    total = sum(n for n, _ in scenes) - FADE * (len(scenes) - 1)
    os.makedirs(P.OUT, exist_ok=True)
    mp4 = os.path.join(P.OUT, 'the-index-demo.mp4')
    enc = subprocess.Popen([
        'ffmpeg', '-y', '-loglevel', 'error',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4,
    ], stdin=subprocess.PIPE)
    starts, at = [], 0
    for n, _ in scenes:
        starts.append(at)
        at += n - FADE
    poster_frame = starts[0] + 120
    for frame in range(total):
        live = [(i, frame - starts[i]) for i in range(len(scenes)) if 0 <= frame - starts[i] < scenes[i][0]]
        if len(live) == 1:
            img = scenes[live[0][0]][1](live[0][1])
        else:
            (i1, t1), (i2, t2) = live[0], live[-1]
            img = Image.blend(scenes[i1][1](t1), scenes[i2][1](t2), min(1.0, t2 / FADE))
        if frame == poster_frame:
            img.save(os.path.join(P.OUT, 'the-index-demo-poster.png'))
        enc.stdin.write(img.convert('RGB').tobytes())
    enc.stdin.close()
    enc.wait()
    print(f'{mp4}: {total} frames, {total / FPS:.1f}s')


if __name__ == '__main__':
    main()
