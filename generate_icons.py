import sys
from pathlib import Path

from PIL import Image, ImageDraw


def crop_to_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def make_round_icon(img: Image.Image) -> Image.Image:
    # Обрезаем строго по кругу, чтобы round-иконка выглядела корректно.
    size = img.size[0]
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def generate_android_launcher_icons(source_icon: Path, res_dir: Path) -> None:
    if not source_icon.exists():
        raise FileNotFoundError(f"Source icon not found: {source_icon}")
    if not res_dir.exists():
        raise FileNotFoundError(f"Android res dir not found: {res_dir}")

    img = Image.open(source_icon).convert("RGBA")
    img = crop_to_square(img)

    densities = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }

    for density, size in densities.items():
        target_dir = res_dir / f"mipmap-{density}"
        target_dir.mkdir(parents=True, exist_ok=True)

        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        round_icon = make_round_icon(resized)

        resized.save(target_dir / "ic_launcher.png", format="PNG")
        round_icon.save(target_dir / "ic_launcher_round.png", format="PNG")


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: python3 generate_icons.py <source_icon.png> <android_res_dir>")
        sys.exit(1)

    source_icon = Path(sys.argv[1]).expanduser().resolve()
    res_dir = Path(sys.argv[2]).expanduser().resolve()

    generate_android_launcher_icons(source_icon, res_dir)
    print("✅ Android launcher icons generated")


if __name__ == "__main__":
    main()

