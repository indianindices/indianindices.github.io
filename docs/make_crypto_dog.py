from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "frontend" / "assets" / "crypto-happy-dog.gif"
WIDTH, HEIGHT, SCALE = 240, 180, 3
OUTLINE = "#453329"
COAT = "#e8b35d"
EAR = "#c98542"
CREAM = "#fff2d7"
PINK = "#f58c9c"


def scaled_box(bounds):
    return tuple(round(value * SCALE) for value in bounds)


def scaled_points(points):
    return [(round(x * SCALE), round(y * SCALE)) for x, y in points]


def frame(index):
    bounce = (0, -1, -3, -2, 0, 1, 3, 2)[index % 8]
    wag = (-9, -4, 4, 10, 7, 0, -7, -11)[index % 8]
    image = Image.new("RGB", (WIDTH * SCALE, HEIGHT * SCALE), "#e8fbf3")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(scaled_box((8, 8, 232, 172)), radius=22 * SCALE, outline="#c3e8d8", width=2 * SCALE)
    draw.line(scaled_points([(28, 155), (212, 155)]), fill="#b9dfcf", width=2 * SCALE)
    draw.ellipse(scaled_box((66, 145, 190, 163)), fill="#c4e8d9")

    tail = [(160, 105 + bounce), (176, 101 + bounce), (183, 86 + wag), (197, 74 + wag), (208, 79 + wag), (202, 92 + wag), (187, 109 + wag), (171, 119 + bounce)]
    draw.polygon(scaled_points(tail), fill=COAT)
    draw.line(scaled_points(tail + [tail[0]]), fill=OUTLINE, width=3 * SCALE, joint="curve")

    draw.rounded_rectangle(scaled_box((67, 85 + bounce, 190, 158 + bounce)), radius=30 * SCALE, fill=COAT, outline=OUTLINE, width=3 * SCALE)
    draw.ellipse(scaled_box((93, 101 + bounce, 158, 161 + bounce)), fill=CREAM)
    draw.ellipse(scaled_box((82, 143 + bounce, 125, 166 + bounce)), fill=COAT, outline=OUTLINE, width=2 * SCALE)
    draw.ellipse(scaled_box((137, 143 + bounce, 180, 166 + bounce)), fill=COAT, outline=OUTLINE, width=2 * SCALE)

    draw.ellipse(scaled_box((57, 28 + bounce, 99, 83 + bounce)), fill=EAR, outline=OUTLINE, width=3 * SCALE)
    draw.ellipse(scaled_box((151, 28 + bounce, 193, 83 + bounce)), fill=EAR, outline=OUTLINE, width=3 * SCALE)
    draw.rounded_rectangle(scaled_box((62, 21 + bounce, 179, 127 + bounce)), radius=38 * SCALE, fill=COAT, outline=OUTLINE, width=3 * SCALE)
    draw.ellipse(scaled_box((84, 73 + bounce, 158, 120 + bounce)), fill=CREAM)
    draw.ellipse(scaled_box((91, 58 + bounce, 104, 73 + bounce)), fill=OUTLINE)
    draw.ellipse(scaled_box((139, 58 + bounce, 152, 73 + bounce)), fill=OUTLINE)
    draw.ellipse(scaled_box((94, 60 + bounce, 98, 64 + bounce)), fill="#ffffff")
    draw.ellipse(scaled_box((142, 60 + bounce, 146, 64 + bounce)), fill="#ffffff")
    draw.ellipse(scaled_box((116, 78 + bounce, 136, 93 + bounce)), fill=OUTLINE)
    draw.line(scaled_points([(126, 91 + bounce), (126, 101 + bounce), (119, 106 + bounce), (126, 110 + bounce), (133, 106 + bounce), (126, 101 + bounce)]), fill=OUTLINE, width=2 * SCALE, joint="curve")
    draw.ellipse(scaled_box((121, 106 + bounce, 132, 119 + bounce)), fill=PINK)
    draw.line(scaled_points([(91, 117 + bounce), (151, 117 + bounce)]), fill="#42a88a", width=7 * SCALE)
    draw.ellipse(scaled_box((119, 117 + bounce, 134, 135 + bounce)), fill="#f6cf57", outline=OUTLINE, width=2 * SCALE)
    if index % 8 in (2, 3, 4):
        draw.arc(scaled_box((202, 59 + wag, 215, 77 + wag)), 210, 330, fill="#ed9f3c", width=3 * SCALE)
    return image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def main():
    frames = [frame(index) for index in range(16)]
    frames[0].save(OUTPUT, save_all=True, append_images=frames[1:], duration=90, loop=0, disposal=2, optimize=True)
    print(f"Rendered {len(frames)} frames to {OUTPUT}")


if __name__ == "__main__":
    main()