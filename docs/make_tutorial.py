import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).parent
WIDTH, HEADER, FOOTER = 1200, 104, 36
STEPS = [
    ("00-search.png", "Find a sector", "Search for an index, then select it from the sidebar. Here we explore BankNifty.", (14, 152, 221, 35)),
    ("01-quarterly.png", "Inspect quarterly returns", "Each bar is a completed quarter. The stat tiles summarize longer-run performance and risk.", (299, 306, 224, 29)),
    ("02-annual.png", "Switch to annual returns", "Select Annual returns for one bar per year. The current year is YTD, not a completed year.", (420, 306, 103, 29)),
    ("03-table.png", "Check the numbers", "The returns table includes every year and quarter. Switch the CAGR column between 3Y, 5Y and 10Y.", (1221, 11, 92, 25)),
    ("04-sectors.png", "Compare Sectors", "Choose indices with the checkboxes. All / None simplifies selection; Nifty50 is a dashed reference.", (1161, 208, 230, 520)),
    ("05-growth.png", "Follow the growth of Rs. 10,000", "Every selected index starts on the same date. Changing selections rebases their common history.", (410, 168, 127, 29)),
    ("06-excess.png", "Measure excess returns", "Subtract Nifty50's same-year return. A 20% return minus 15% is +5 percentage points, not +5% growth.", (541, 168, 122, 29)),
    ("07-rolling-three.png", "Examine 3Y rolling CAGR", "Each point annualizes 12 consecutive quarters. Missing quarters leave blanks rather than invented values.", (666, 168, 113, 29)),
    ("08-rolling-five.png", "Extend the window to five years", "5Y rolling CAGR uses 20 consecutive quarters. Year filters select endpoints, not the lookback history.", (783, 168, 113, 29)),
    ("09-drawdown.png", "Understand drawdown", "Measure losses from quarter-end peaks. The risk table shows maximum loss, current loss and recovery.", (280, 795, 1115, 105)),
    ("10-recovery.png", "Track recovery time", "Recovery counts quarters below the prior peak and resets when regained. Daily losses are not measured.", (987, 126, 135, 29)),
    ("11-sharing.png", "Choose a period and share it", "From / To filters the view. Copy link saves the selected indices, metric and years in a reusable URL.", (280, 103, 1115, 32)),
    ("12-zoom.png", "Explore the graph", "The top-right + / - icons zoom; fit-view restores the chart. Drag to pan or double-click to fit.", (954, 286, 114, 42)),
    ("13-exports.png", "Export your research", "Download CSV saves the selected data. PNG captures the visible chart with its title, context and legend.", (1199, 236, 71, 30)),
    ("14-rankings.png", "Rank the market", "Summary ranks all indices. Click a column to sort, then click again to reverse; missing values stay last.", (1146, 149, 86, 18)),
    ("15-summary-curves.png", "Compare annual performance", "Use Summary's All / None or legend entries to show lines. Hover the graph to compare a particular year.", (1146, 0, 230, 520)),
    ("16-heatmap.png", "Scan the annual heatmap", "Green and red cells reveal strong and weak years. Click an index name to open its detailed page.", (302, 62, 144, 25)),
    ("17-methodology.png", "Read the assumptions", "Source, quarterly compounding and risk definitions matter. Past performance does not predict future returns.", (774, 26, 573, 808)),
]


def wrapped(draw, text, font, width):
    lines = []
    line = ""
    for word in text.split():
        candidate = f"{line} {word}" if line else word
        if line and draw.textlength(candidate, font=font) > width:
            lines.append(line)
            line = word
        else:
            line = candidate
    return lines + [line]


def render_step(source, step, index, fonts, recorded_focus=None):
    filename, title, caption, focus = step
    if recorded_focus is not None:
        focus = tuple(recorded_focus[key] for key in ("x", "y", "width", "height"))
    if source.size != (1440, 900):
        raise ValueError(f"{filename} is not a 1440x900 desktop capture: {source.size}")
    scale = WIDTH / source.width
    screen = source.resize((WIDTH, round(source.height * scale)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (WIDTH, HEADER + screen.height + FOOTER), "#0b0f17")
    canvas.paste(screen, (0, HEADER))
    draw = ImageDraw.Draw(canvas)
    draw.text((24, 12), title, font=fonts[26], fill="#e6eaf2")
    draw.text((WIDTH - 110, 18), f"{index + 1:02d} / {len(STEPS):02d}", font=fonts[16], fill="#67e8f9")
    caption_lines = wrapped(draw, caption, fonts[16], WIDTH - 48)
    if len(caption_lines) > 2:
        raise ValueError(f"Caption exceeds the reserved area: {title}")
    for row, text in enumerate(caption_lines):
        draw.text((24, 52 + row * 21), text, font=fonts[16], fill="#b6c6d8")
    draw.line((0, HEADER - 1, WIDTH, HEADER - 1), fill="#34435a", width=2)
    footer_top = HEADER + screen.height
    draw.text((24, footer_top + 11), "INDIAN SECTORS / desktop walkthrough / instructional annotations", font=fonts[12], fill="#94a3b8")
    left, top, width, height = focus
    box = (max(2, round(left * scale) - 4), max(HEADER + 2, HEADER + round(top * scale) - 4),
           min(WIDTH - 2, round((left + width) * scale) + 4), min(footer_top - 2, HEADER + round((top + height) * scale) + 4))
    output = []
    for cue, duration in enumerate((220, 220, 5400)):
        frame = canvas.copy()
        draw = ImageDraw.Draw(frame)
        draw.rounded_rectangle(box, radius=5, outline="#6ee7b7", width=2 + (cue == 2))
        pointer_left = min(WIDTH - 24, max(4, box[0] + 20 - cue * 5))
        pointer_top = min(footer_top - 28, max(HEADER + 5, box[1] + 10 - cue * 4))
        cursor = [(pointer_left, pointer_top), (pointer_left, pointer_top + 20), (pointer_left + 6, pointer_top + 16),
                  (pointer_left + 12, pointer_top + 25), (pointer_left + 16, pointer_top + 23), (pointer_left + 10, pointer_top + 14), (pointer_left + 19, pointer_top + 14)]
        draw.polygon(cursor, fill="#f8fafc", outline="#0b0f17", width=2)
        progress = (index + (cue + 1) / 3) / len(STEPS)
        draw.rectangle((0, canvas.height - 4, round(WIDTH * progress), canvas.height), fill="#67e8f9")
        output.append((frame, duration))
    return output


def main():
    parser = argparse.ArgumentParser(description="Assemble captioned desktop dashboard captures into one tutorial GIF.")
    parser.add_argument("--frames", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "tutorial.gif")
    parser.add_argument("--font", default="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    arguments = parser.parse_args()
    metadata_path = arguments.frames / "capture.json"
    positions = {record["filename"]: record["focus"] for record in json.loads(metadata_path.read_text())} if metadata_path.exists() else {}
    fonts = {size: ImageFont.truetype(arguments.font, size) for size in (12, 16, 26)}
    frames = []
    for index, step in enumerate(STEPS):
        with Image.open(arguments.frames / step[0]) as image:
            frames.extend(render_step(image.convert("RGB"), step, index, fonts, positions.get(step[0])))
    samples = Image.new("RGB", (240, 178 * len(STEPS)))
    for index in range(len(STEPS)):
        samples.paste(frames[index * 3][0].resize((240, 178)), (0, index * 178))
    palette = samples.quantize(colors=192)
    encoded = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image, _ in frames]
    encoded[0].save(arguments.output, save_all=True, append_images=encoded[1:], duration=[duration for _, duration in frames], loop=0, disposal=1, optimize=False)
    print(f"Rendered {len(STEPS)} desktop chapters / {len(frames)} animation frames to {arguments.output}")


if __name__ == "__main__":
    main()