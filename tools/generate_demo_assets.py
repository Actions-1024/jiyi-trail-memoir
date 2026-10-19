"""Generate painterly, offline demo photography for the 迹忆 app.

The images are intentionally illustrative (not real photographs), so the demo
works without any network access or third-party image licensing.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "demo"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1200, 1500


def gradient(top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    ys = np.linspace(0, 1, H)[:, None]
    arr = np.zeros((H, W, 3), dtype=np.float32)
    for c in range(3):
        arr[:, :, c] = top[c] * (1 - ys) + bottom[c] * ys
    return Image.fromarray(np.uint8(np.clip(arr, 0, 255)))


def add_glow(img: Image.Image, cx: float, cy: float, radius: float,
             color: tuple[int, int, int], strength: float = 1.0) -> None:
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / radius
    falloff = np.clip(1 - d, 0, 1) ** 2.4 * strength
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    for c in range(3):
        arr[:, :, c] = arr[:, :, c] * (1 - falloff) + color[c] * falloff
    img.paste(Image.fromarray(np.uint8(np.clip(arr, 0, 255))).convert("RGBA"))


def mountain_layer(base_y: int, amplitude: int, color: tuple[int, int, int],
                   seed: int, blur: int = 2, opacity: int = 255) -> Image.Image:
    rng = random.Random(seed)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    points = [(0, H)]
    phase = rng.random() * math.tau
    for x in range(0, W + 30, 24):
        y = base_y + amplitude * (
            0.58 * math.sin(x / 300 + phase)
            + 0.25 * math.sin(x / 111 + phase * 1.7)
            + 0.17 * math.sin(x / 43 + phase * 2.4)
        )
        points.append((x, y))
    points.append((W, H))
    d.polygon(points, fill=(*color, opacity))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return layer


def tree(img: Image.Image, x: int, ground_y: int, height: int,
         color: tuple[int, int, int], seed: int, width_scale: float = 1.0) -> None:
    """A soft, single-palette canopy - no multicoloured confetti."""
    rng = random.Random(seed)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    trunk_w = max(4, height // 28)
    d.line([(x, ground_y), (x + rng.randint(-10, 10), ground_y - height * 0.82)],
           fill=(*[max(0, c - 22) for c in color], 255), width=trunk_w)
    # A couple of bare branches.
    for _ in range(4):
        by = ground_y - int(height * rng.uniform(0.45, 0.78))
        d.line([(x, by), (x + rng.randint(-height // 4, height // 4), by - rng.randint(40, height // 3))],
               fill=(*[max(0, c - 18) for c in color], 210), width=max(2, trunk_w // 3))
    for _ in range(64):
        angle = rng.random() * math.tau
        radius = (rng.random() ** 0.55) * height * 0.38 * width_scale
        bx = x + math.cos(angle) * radius
        by = ground_y - height * 0.72 + math.sin(angle) * radius * 0.72
        r = rng.randint(max(10, height // 16), max(18, height // 8))
        shade = rng.randint(-12, 12)
        tint = tuple(max(0, min(255, c + shade)) for c in color)
        d.ellipse((bx - r, by - r * 0.82, bx + r, by + r * 0.82), fill=(*tint, rng.randint(82, 125)))
    layer = layer.filter(ImageFilter.GaussianBlur(2.6))
    img.alpha_composite(layer)


def reeds(img: Image.Image, y: int, color: tuple[int, int, int], seed: int,
          count: int = 40, height_range: tuple[int, int] = (80, 300)) -> None:
    rng = random.Random(seed)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(count):
        x = rng.randint(-40, W + 40)
        h = rng.randint(*height_range)
        lean = rng.randint(-70, 70)
        d.line([(x, y + 60), (x + lean, y - h)],
               fill=(*color, rng.randint(95, 210)), width=rng.randint(1, 4))
        if rng.random() > 0.55:
            d.ellipse((x + lean - 4, y - h - 18, x + lean + 4, y - h + 22),
                      fill=(*color, 175))
    img.alpha_composite(layer)


def stone_bridge(img: Image.Image, cx: int, deck_y: int, span: int,
                 color: tuple[int, int, int]) -> None:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    left, right = cx - span // 2, cx + span // 2
    # Slightly cambered deck.
    d.polygon([
        (left, deck_y - 6), (cx - span * 0.26, deck_y - 18),
        (cx + span * 0.26, deck_y - 18), (right, deck_y - 6),
        (right, deck_y + 9), (cx, deck_y + 12), (left, deck_y + 9),
    ], fill=(*color, 255))
    # Central stone arch.
    arch_w = span * 0.36
    d.arc((cx - arch_w // 2, deck_y - 18, cx + arch_w // 2, deck_y + 180),
          180, 360, fill=(*color, 245), width=max(8, span // 34))
    # Railing posts.
    for i in range(-4, 5):
        px = cx + i * span // 11
        if abs(i) <= 1:
            continue
        d.rectangle((px - 4, deck_y - 36, px + 4, deck_y - 12), fill=(*color, 230))
    # A soft reflection on the water.
    refl = layer.transpose(Image.Transpose.FLIP_TOP_BOTTOM).filter(ImageFilter.GaussianBlur(6))
    refl.putalpha(48)
    img.alpha_composite(refl)
    img.alpha_composite(layer)


def pavilion(img: Image.Image, x: int, ground: int, scale: float,
             color: tuple[int, int, int]) -> None:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    w = int(200 * scale)
    h = int(120 * scale)
    # A simple upturned-eave roof.
    d.polygon([
        (x - w // 2 - int(18 * scale), ground - h + int(4 * scale)),
        (x - w // 2 + int(14 * scale), ground - h - int(6 * scale)),
        (x, ground - h - int(54 * scale)),
        (x + w // 2 - int(14 * scale), ground - h - int(6 * scale)),
        (x + w // 2 + int(18 * scale), ground - h + int(4 * scale)),
        (x + w // 2 - int(18 * scale), ground - h + int(20 * scale)),
        (x - w // 2 + int(18 * scale), ground - h + int(20 * scale)),
    ], fill=(*color, 255))
    for dx in (-int(w * 0.32), 0, int(w * 0.32)):
        d.line([(x + dx, ground - h + int(6 * scale)), (x + dx, ground)],
               fill=(*color, 255), width=max(3, int(8 * scale)))
    d.rectangle((x - int(w * 0.36), ground - 3, x + int(w * 0.36), ground + 7),
                fill=(*color, 255))
    img.alpha_composite(layer)


def boat(img: Image.Image, x: int, y: int, scale: float,
         color: tuple[int, int, int]) -> None:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    w = int(180 * scale)
    d.polygon([(x - w // 2, y), (x + w // 2, y), (x + int(w * 0.33), y + int(24 * scale)),
               (x - int(w * 0.34), y + int(22 * scale))], fill=(*color, 255))
    d.line([(x - int(w * 0.22), y - 4), (x - int(w * 0.22), y - int(110 * scale))],
           fill=(*color, 255), width=max(2, int(4 * scale)))
    d.polygon([(x - int(w * 0.21), y - int(104 * scale)),
               (x + int(w * 0.14), y - int(22 * scale)),
               (x - int(w * 0.21), y - int(20 * scale))], fill=(*color, 150))
    img.alpha_composite(layer)


def water(img: Image.Image, horizon: int, top: tuple[int, int, int],
          bottom: tuple[int, int, int], seed: int = 1) -> None:
    band = gradient(top, bottom).crop((0, horizon, W, H))
    img.paste(band, (0, horizon))
    rng = random.Random(seed)
    d = ImageDraw.Draw(img, "RGBA")
    for i in range(34):
        y = horizon + 14 + i * (H - horizon) / 34
        width = rng.randint(60, 420)
        x = rng.randint(-140, W)
        alpha = max(4, int(46 * (1 - i / 38)))
        d.line([(x, y), (x + width, y + rng.randint(-2, 2))],
               fill=(245, 224, 190, alpha), width=rng.randint(1, 3))
    # Soft haze at the shoreline.
    haze = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(haze)
    hd.rectangle((0, horizon - 10, W, horizon + 90), fill=(234, 224, 205, 35))
    img.alpha_composite(haze.filter(ImageFilter.GaussianBlur(18)))


def finish(img: Image.Image, name: str, grain: float = 0.018) -> None:
    yy, xx = np.mgrid[0:H, 0:W]
    cx, cy = W / 2, H * 0.47
    dist = np.sqrt(((xx - cx) / W) ** 2 + ((yy - cy) / H) ** 2)
    vignette = np.clip((dist - 0.35) / 0.58, 0, 1) ** 1.8 * 0.28
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    arr *= (1 - vignette[:, :, None])
    # Gentle warm grade and film grain.
    arr[:, :, 0] *= 1.025
    arr[:, :, 1] *= 1.005
    arr[:, :, 2] *= 0.975
    noise = np.random.default_rng(7).normal(0, 255 * grain, (H, W, 1))
    arr = np.clip(arr + noise, 0, 255)
    Image.fromarray(np.uint8(arr)).filter(ImageFilter.GaussianBlur(0.25)).save(
        OUT / name, quality=90, optimize=True, progressive=True
    )
    print("wrote", name)


def dawn_lake() -> None:
    img = gradient((205, 210, 201), (242, 186, 145)).convert("RGBA")
    add_glow(img, 810, 430, 320, (255, 223, 174), 0.9)
    img.alpha_composite(mountain_layer(620, 72, (128, 136, 124), 3, 6, 110))
    img.alpha_composite(mountain_layer(690, 52, (82, 96, 84), 8, 4, 165))
    # A soft, hazy shoreline - no literal line of trees.
    d = ImageDraw.Draw(img)
    d.rectangle((0, 748, W, 790), fill=(91, 108, 89, 85))
    water(img, 760, (188, 187, 169), (68, 95, 89), 12)
    # Sun path.
    for i in range(60):
        y = 780 + i * 12
        w = int(36 + i * 2.6)
        x = 810 + math.sin(i * 0.7) * 10 - w // 2
        ImageDraw.Draw(img, "RGBA").line([(x, y), (x + w, y)],
                                         fill=(255, 218, 170, max(5, 76 - i)), width=2)
    stone_bridge(img, 795, 826, 280, (106, 95, 80))
    boat(img, 1010, 1010, 0.72, (58, 68, 58))
    reeds(img, 1490, (58, 63, 45), 12, 30, (100, 320))
    # Mist over the water.
    mist = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(mist).ellipse((-200, 680, W + 200, 1080), fill=(238, 230, 211, 52))
    img.alpha_composite(mist.filter(ImageFilter.GaussianBlur(58)))
    finish(img, "lake-dawn.jpg")


def lotus_lake() -> None:
    img = gradient((189, 205, 191), (133, 166, 143)).convert("RGBA")
    add_glow(img, 260, 280, 380, (231, 231, 196), 0.55)
    img.alpha_composite(mountain_layer(625, 80, (103, 129, 112), 14, 6, 120))
    img.alpha_composite(mountain_layer(700, 42, (68, 99, 82), 21, 4, 175))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 735, W, 760), fill=(73, 104, 82, 120))
    water(img, 760, (125, 153, 132), (44, 76, 63), 21)
    # A small island pavilion on the right.
    d.ellipse((720, 745, 1030, 830), fill=(67, 95, 72, 220))
    pavilion(img, 880, 760, 1.15, (42, 61, 48))
    # A low stone walkway leading to it.
    d.line([(1000, 800), (1190, 870)], fill=(96, 107, 86, 210), width=18)
    # Lotus leaves.
    rng = random.Random(31)
    for _ in range(58):
        x, y = rng.randint(-60, W + 60), rng.randint(1000, 1500)
        r = rng.randint(24, 88)
        d.ellipse((x - r, y - r * 0.28, x + r, y + r * 0.28),
                  fill=(46, 83, 59, rng.randint(80, 165)))
        d.line([(x, y), (x + r * 0.3, y - r * 0.08)], fill=(30, 54, 41, 120), width=2)
    for _ in range(10):
        x, y = rng.randint(20, W - 20), rng.randint(970, 1260)
        d.ellipse((x - 9, y - 30, x + 9, y), fill=(238, 216, 211, 210))
        d.line([(x, y), (x + 3, y + 82)], fill=(64, 92, 60, 160), width=3)
    reeds(img, 1480, (40, 70, 50), 44, 26, (90, 280))
    finish(img, "lake-lotus.jpg")


def autumn_walk() -> None:
    img = gradient((222, 209, 180), (190, 150, 105)).convert("RGBA")
    add_glow(img, 940, 300, 330, (255, 224, 165), 0.9)
    img.alpha_composite(mountain_layer(610, 66, (147, 132, 100), 33, 6, 120))
    water(img, 720, (180, 167, 134), (83, 104, 92), 33)
    d = ImageDraw.Draw(img)
    # Lakeside road.
    d.polygon([(0, 1160), (W, 990), (W, 1500), (0, 1500)], fill=(179, 151, 110, 255))
    d.polygon([(0, 1230), (W, 1064), (W, 1180), (0, 1350)], fill=(201, 178, 142, 255))
    d.line([(0, 1250), (W, 1082)], fill=(224, 203, 168, 160), width=3)
    # A row of smaller, harmonious plane trees.
    palette = [(95, 82, 42), (105, 88, 45), (88, 82, 44), (112, 91, 49), (84, 87, 48)]
    for i in range(6):
        tree(img, 760 + i * 82, 1030 - i * 28, 280 + (i % 3) * 28,
             palette[i % len(palette)], 60 + i, 0.85)
    # Fallen leaves.
    rng = random.Random(12)
    for _ in range(120):
        x, y = rng.randint(0, W), rng.randint(1100, 1500)
        d.ellipse((x, y, x + 5, y + 3), fill=(176, 118, 54, rng.randint(70, 180)))
    reeds(img, 1460, (67, 60, 35), 74, 22, (80, 240))
    finish(img, "lake-autumn.jpg")


def dusk_lake() -> None:
    img = gradient((111, 128, 145), (235, 166, 132)).convert("RGBA")
    add_glow(img, 300, 540, 300, (255, 189, 132), 0.95)
    img.alpha_composite(mountain_layer(610, 82, (77, 94, 102), 55, 6, 140))
    img.alpha_composite(mountain_layer(690, 42, (48, 66, 72), 62, 4, 185))
    water(img, 740, (190, 143, 122), (43, 67, 76), 55)
    d = ImageDraw.Draw(img)
    for i in range(58):
        y = 760 + i * 13
        w = int(30 + i * 3.0)
        x = 300 + math.sin(i * 0.7) * 9 - w // 2
        d.line([(x, y), (x + w, y)], fill=(255, 207, 154, max(4, 74 - i)), width=2)
    boat(img, 810, 890, 1.0, (38, 48, 46))
    reeds(img, 1480, (30, 45, 41), 84, 42, (110, 340))
    finish(img, "lake-dusk.jpg")


def hero_lake() -> None:
    img = gradient((208, 212, 200), (244, 190, 151)).convert("RGBA")
    add_glow(img, 720, 410, 350, (255, 223, 174), 0.9)
    img.alpha_composite(mountain_layer(610, 75, (130, 139, 126), 71, 6, 105))
    img.alpha_composite(mountain_layer(688, 50, (84, 98, 86), 72, 4, 160))
    water(img, 752, (188, 187, 169), (65, 92, 86), 73)
    for i in range(58):
        y = 770 + i * 12
        w = int(34 + i * 2.4)
        x = 720 + math.sin(i * 0.7) * 9 - w // 2
        ImageDraw.Draw(img, "RGBA").line([(x, y), (x + w, y)],
                                         fill=(255, 218, 170, max(4, 70 - i)), width=2)
    boat(img, 950, 1010, 0.7, (57, 68, 58))
    reeds(img, 1490, (57, 62, 44), 74, 26, (90, 300))
    mist = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(mist).ellipse((-180, 690, W + 200, 1060), fill=(238, 230, 211, 46))
    img.alpha_composite(mist.filter(ImageFilter.GaussianBlur(55)))
    finish(img, "hero-full.jpg")


if __name__ == "__main__":
    dawn_lake()
    lotus_lake()
    autumn_walk()
    dusk_lake()
    hero_lake()
    # The home hero favours atmosphere over landmarks.
    hero = Image.open(OUT / "hero-full.jpg").crop((0, 0, W, 1320))
    hero.save(OUT / "hero.jpg", quality=90, optimize=True, progressive=True)
    print("wrote hero.jpg")
