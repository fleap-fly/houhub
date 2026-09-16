"""Generate src-tauri/icons/icon.icns — the macOS app icon.

macOS reserves a transparent safe area around an app icon: the artwork fills
824x824 centred in a 1024x1024 canvas, leaving 100px on every side. Apple's own
apps and every well-behaved third-party app measure exactly that ratio, so an
icon drawn edge-to-edge renders about 1.24x wider than its Dock neighbours
(issue #610).

The source is the HouHub brand master, `icons/ios/AppIcon-512@2x.png`: a
1024x1024 true-resolution render of the HouHub mark. It is deliberately NOT
`icon.svg` — that file carried upstream's logo, and building the Dock tile from
it put upstream's mark in HouHub's app icon. The brand master draws its
squircle inset `SOURCE_INSET` into the canvas, so this script re-insets that
body onto Apple's grid for macOS only. Every other platform keeps its
full-bleed art: the web favicon, the Windows .ico and the Linux PNGs all want
the canvas filled, and those PNGs are what `default_window_icon()` hands the
Windows and Linux tray.

Requires only the project's Tauri CLI (`pnpm tauri`); no Python packages and no
macOS-only tooling, so this runs anywhere.

Why `tauri icon` and not `iconutil`: `tauri icon` reproduces the exact ICNS
chunk set this project has always shipped, including the legacy
il32/is32/l8mk/s8mk masks that carry the 16px and 32px slots for the macOS
10.13 floor we declare. Feeding a 10-file .iconset to `iconutil` instead writes
ic04/ic05 as raw ARGB and drops those masks entirely.

Note on diffs: `tauri icon` emits ICNS chunks in whatever order its parallel
encoders finish, so re-running always produces a different byte order — and so
a non-empty `git diff` — even when every pixel is identical. To tell whether
anything actually changed, compare the payload of each chunk rather than the
whole file. `cargo test --features test-utils macos_icon_geometry` asserts the
properties that actually matter, so run it after regenerating.
"""

import base64
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


# Apple's macOS app-icon grid: an 824x824 body centred in a 1024x1024 canvas.
CANVAS = 1024
BODY = 824
INSET = (CANVAS - BODY) // 2

# The brand master's own squircle, measured from its alpha channel. The artwork
# is transparent outside this box, so these two numbers are what place the mark
# on Apple's grid. Re-measure them if the master is ever redrawn;
# `macos_icon_geometry.rs` fails if the result drifts off the grid.
SOURCE_INSET = 84
SOURCE_BODY = CANVAS - 2 * SOURCE_INSET

ICONS_DIR = Path(__file__).resolve().parent
REPO_ROOT = ICONS_DIR.parents[1]
SOURCE_PNG = ICONS_DIR / "ios" / "AppIcon-512@2x.png"
OUTPUT_ICNS = ICONS_DIR / "icon.icns"


def _fail(message):
    raise SystemExit(f"macos-icon.gen.py: {message}")


def build_padded_svg(source_png):
    """Wrap the brand master in a 1024 canvas with the macOS safe-area inset.

    The master travels verbatim as a data URI — the whole document is built
    around it rather than edited — so only the enclosing transform is ours.
    """
    scale = BODY / SOURCE_BODY
    offset = INSET - SOURCE_INSET * scale
    encoded = base64.b64encode(source_png).decode("ascii")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{CANVAS}" height="{CANVAS}" viewBox="0 0 {CANVAS} {CANVAS}">\n'
        f'  <g transform="translate({offset:.5f},{offset:.5f}) scale({scale:.8f})">'
        f'<image href="data:image/png;base64,{encoded}" '
        f'width="{CANVAS}" height="{CANVAS}"/></g>\n'
        f"</svg>\n"
    )


def main():
    if not SOURCE_PNG.is_file():
        _fail(f"missing {SOURCE_PNG}")

    padded = build_padded_svg(SOURCE_PNG.read_bytes())

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        padded_svg = tmp_dir / "icon-macos-padded.svg"
        padded_svg.write_text(padded, encoding="utf-8")

        # `tauri icon` also emits .png/.ico/Square*/android/ios variants. Only
        # the .icns is wanted: every other platform keeps its full-bleed art.
        out_dir = tmp_dir / "out"
        out_dir.mkdir()
        result = subprocess.run(
            ["pnpm", "tauri", "icon", str(padded_svg), "-o", str(out_dir)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            sys.stderr.write(result.stdout)
            sys.stderr.write(result.stderr)
            _fail(f"`pnpm tauri icon` failed with exit code {result.returncode}")

        generated = out_dir / "icon.icns"
        if not generated.is_file():
            _fail(f"`pnpm tauri icon` produced no icon.icns in {out_dir}")

        shutil.copyfile(generated, OUTPUT_ICNS)

    print(f"wrote {OUTPUT_ICNS} ({BODY}x{BODY} body in {CANVAS}x{CANVAS} canvas)")


if __name__ == "__main__":
    main()
