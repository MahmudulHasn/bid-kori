"""Generate deterministic local demo category images for SHOW-S02.

Run from repo root (host or container with Pillow):
  python scripts/generate_demo_product_images.py

Writes JPEG files under demo_assets/products/. Safe abstract illustrations —
not brand photography.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'demo_assets' / 'products'

# (filename_stem, label, background RGB, accent RGB)
CATEGORIES: tuple[tuple[str, str, tuple[int, int, int], tuple[int, int, int]], ...] = (
    ('smartphones', 'SMARTPHONE', (24, 42, 68), (120, 190, 255)),
    ('laptops', 'LAPTOP', (28, 48, 52), (140, 220, 200)),
    ('gaming-consoles', 'CONSOLE', (48, 28, 64), (210, 140, 255)),
    ('pc-components', 'PC PART', (40, 36, 32), (255, 180, 100)),
    ('cameras', 'CAMERA', (36, 36, 40), (255, 210, 120)),
    ('sneakers', 'SNEAKER', (32, 48, 40), (120, 230, 160)),
    ('watches', 'WATCH', (44, 36, 28), (240, 200, 120)),
    ('collectibles', 'COLLECTIBLE', (48, 32, 36), (255, 150, 150)),
)


def _font(size: int):
    for name in (
        'DejaVuSans-Bold.ttf',
        'Arial.ttf',
        'arial.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    ):
        try:
            return ImageFont.truetype(name, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _draw_silhouette(draw: ImageDraw.ImageDraw, key: str, accent: tuple[int, int, int]) -> None:
    """Simple geometric product silhouettes — presentation-safe, non-branded."""
    if key == 'smartphones':
        draw.rounded_rectangle((340, 140, 460, 420), radius=28, fill=accent)
        draw.rounded_rectangle((355, 165, 445, 380), radius=12, fill=(20, 20, 28))
        draw.ellipse((385, 390, 415, 405), fill=(20, 20, 28))
    elif key == 'laptops':
        draw.rounded_rectangle((250, 160, 550, 320), radius=12, fill=accent)
        draw.rounded_rectangle((265, 175, 535, 295), radius=6, fill=(18, 24, 28))
        draw.polygon([(230, 320), (570, 320), (600, 370), (200, 370)], fill=accent)
    elif key == 'gaming-consoles':
        draw.rounded_rectangle((240, 220, 560, 340), radius=40, fill=accent)
        draw.ellipse((280, 250, 340, 310), outline=(20, 20, 28), width=8)
        draw.ellipse((460, 250, 520, 310), outline=(20, 20, 28), width=8)
    elif key == 'pc-components':
        draw.rectangle((260, 180, 540, 380), fill=accent)
        for y in range(200, 360, 36):
            draw.rectangle((280, y, 520, y + 16), fill=(20, 20, 28))
    elif key == 'cameras':
        draw.rounded_rectangle((250, 200, 550, 360), radius=24, fill=accent)
        draw.ellipse((330, 220, 470, 360), fill=(20, 20, 28))
        draw.ellipse((360, 250, 440, 330), outline=accent, width=10)
        draw.rectangle((480, 170, 530, 210), fill=accent)
    elif key == 'sneakers':
        draw.ellipse((220, 280, 580, 380), fill=accent)
        draw.polygon([(240, 300), (520, 250), (560, 300), (500, 340), (260, 340)], fill=accent)
        draw.arc((260, 250, 420, 360), 200, 340, fill=(20, 20, 28), width=10)
    elif key == 'watches':
        draw.ellipse((300, 170, 500, 370), outline=accent, width=22)
        draw.ellipse((340, 210, 460, 330), fill=(20, 20, 28))
        draw.line((400, 270, 400, 230), fill=accent, width=6)
        draw.line((400, 270, 440, 290), fill=accent, width=5)
        draw.rectangle((385, 140, 415, 175), fill=accent)
        draw.rectangle((385, 365, 415, 400), fill=accent)
    else:  # collectibles
        draw.polygon([(400, 150), (520, 230), (480, 380), (320, 380), (280, 230)], fill=accent)
        draw.ellipse((360, 240, 440, 320), fill=(20, 20, 28))


def generate() -> list[Path]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    title_font = _font(42)
    brand_font = _font(22)
    label_font = _font(28)

    for stem, label, bg, accent in CATEGORIES:
        img = Image.new('RGB', (800, 600), bg)
        draw = ImageDraw.Draw(img)
        # Soft vignette bands
        draw.rectangle((0, 0, 800, 90), fill=tuple(max(0, c - 12) for c in bg))
        draw.rectangle((0, 520, 800, 600), fill=tuple(max(0, c - 12) for c in bg))
        _draw_silhouette(draw, stem, accent)
        draw.text((40, 28), 'BidKori Demo', fill=(230, 230, 235), font=brand_font)
        draw.text((40, 540), label, fill=accent, font=label_font)
        draw.text((40, 80), 'Showcase Asset', fill=(180, 190, 200), font=title_font)
        path = OUT_DIR / f'{stem}.jpg'
        img.save(path, format='JPEG', quality=88, optimize=True)
        written.append(path)
    return written


if __name__ == '__main__':
    paths = generate()
    print(f'Wrote {len(paths)} demo images to {OUT_DIR}')
    for path in paths:
        print(f'  {path.name} ({path.stat().st_size} bytes)')
