import argparse
from math import cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).parent
WIDTH, HEIGHT = 1200, 360
BACKGROUND = "#0b0f17"
MINT = "#6ee7b7"
CORAL = "#fda4af"
CYAN = "#67e8f9"


def bull(draw, center, top):
    for direction in (-1, 1):
        horn = [(center + direction * offset, top + height) for offset, height in [(34, -38), (76, -62), (106, -96), (98, -48), (60, -12)]]
        draw.polygon(horn, fill="#f1f5f9")
        draw.polygon([(center + direction * 40, top - 25), (center + direction * 88, top - 12), (center + direction * 58, top + 15)], fill="#2b8f78")
    draw.polygon([(center - 50, top - 54), (center + 50, top - 54), (center + 64, top - 8), (center + 36, top + 82), (center - 36, top + 82), (center - 64, top - 8)], fill=MINT)
    draw.polygon([(center - 17, top - 38), (center + 17, top - 38), (center, top + 35)], fill="#34d399")
    for direction in (-1, 1):
        eye = center + direction * 29
        draw.ellipse((eye - 6, top + 1, eye + 6, top + 10), fill=BACKGROUND)
    draw.rounded_rectangle((center - 38, top + 43, center + 38, top + 86), radius=16, fill="#16856e")
    for direction in (-1, 1):
        nostril = center + direction * 17
        draw.ellipse((nostril - 4, top + 55, nostril + 4, top + 61), fill=BACKGROUND)
    draw.arc((center - 12, top + 65, center + 12, top + 92), 0, 360, fill="#fcd34d", width=4)


def bear(draw, center, top):
    for direction in (-1, 1):
        ear = center + direction * 57
        draw.ellipse((ear - 23, top - 67, ear + 23, top - 21), fill=CORAL)
        draw.ellipse((ear - 12, top - 55, ear + 12, top - 31), fill="#c45d78")
    draw.rounded_rectangle((center - 70, top - 53, center + 70, top + 86), radius=48, fill=CORAL)
    for direction in (-1, 1):
        eye = center + direction * 29
        draw.ellipse((eye - 6, top + 2, eye + 6, top + 12), fill=BACKGROUND)
    draw.ellipse((center - 38, top + 21, center + 38, top + 77), fill="#ffe4e6")
    draw.polygon([(center - 14, top + 31), (center + 14, top + 31), (center, top + 45)], fill=BACKGROUND)
    draw.line([(center, top + 44), (center, top + 57), (center - 11, top + 63)], fill=BACKGROUND, width=3)
    draw.line([(center, top + 57), (center + 11, top + 63)], fill=BACKGROUND, width=3)


def candles(draw, left, rising, phase):
    color = MINT if rising else CORAL
    centers = []
    for index in range(11):
        center = left + index * 27
        middle = 315 - index * 2 if rising else 285 + index * 2
        middle += round(3 * sin(phase + index * 0.7))
        height = 7 + round(3 * (1 + cos(phase + index)))
        draw.line((center, middle - height - 5, center, middle + height + 5), fill=color, width=2)
        draw.rectangle((center - 4, middle - height, center + 4, middle + height), fill=color)
        centers.append((center, middle))
    draw.line(centers, fill=color, width=2)


def frame(index, fonts):
    image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    phase = index * 2 * pi / 32
    for vertical in range(0, WIDTH, 40):
        draw.line((vertical, 0, vertical, HEIGHT), fill="#111d2b")
    for horizontal in range(0, HEIGHT, 40):
        draw.line((0, horizontal, WIDTH, horizontal), fill="#111d2b")
    draw.rectangle((0, 0, WIDTH - 1, HEIGHT - 1), outline="#263549", width=2)
    draw.line((380, 52, 820, 52), fill=CYAN, width=3)
    bull(draw, 150, 151 + round(4 * sin(phase)))
    bear(draw, 1050, 151 - round(4 * sin(phase)))
    draw.text((600, 79), "INDIAN", font=fonts[58], fill="#f1f5f9", anchor="mt")
    draw.text((600, 141), "SECTORS", font=fonts[58], fill=CYAN, anchor="mt")
    draw.text((600, 223), "Read the cycle. Compare the risk.", font=fonts[20], fill="#cbd5e1", anchor="mt")
    draw.text((150, 254), "BULL / MOMENTUM", font=fonts[13], fill=MINT, anchor="mt")
    draw.text((1050, 254), "BEAR / DRAWDOWN", font=fonts[13], fill=CORAL, anchor="mt")
    draw.text((600, 287), "26 INDICES / RETURNS / RISK", font=fonts[15], fill="#94a3b8", anchor="mt")
    candles(draw, 20, True, phase)
    candles(draw, 910, False, phase)
    return image


def main():
    parser = argparse.ArgumentParser(description="Render original Indian Sectors branding artwork, not market observations.")
    parser.add_argument("--font", default="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    arguments = parser.parse_args()
    fonts = {size: ImageFont.truetype(arguments.font, size) for size in (13, 15, 20, 58)}
    frames = [frame(index, fonts) for index in range(32)]
    frames[0].save(ROOT / "brand.png")
    frames[0].save(ROOT / "brand.gif", save_all=True, append_images=frames[1:], duration=140, loop=0, disposal=2, optimize=True)
    print("Rendered brand.png and 32-frame brand.gif")


if __name__ == "__main__":
    main()