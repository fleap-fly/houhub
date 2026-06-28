"""Generate src-tauri/icons/tray-icon-template.png.

This is a macOS menu-bar template image. AppKit uses only the alpha channel
and tints the opaque pixels for light/dark/highlighted menu bar states.

Run from the repository root or this directory:

    python3 src-tauri/icons/tray-icon-template.gen.py

The script intentionally uses only the Python standard library so the icon can
be regenerated in a clean checkout without installing Pillow.
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


W_LOGICAL = 44
H_LOGICAL = 44
SCALE = 4
W = W_LOGICAL * SCALE
H = H_LOGICAL * SCALE


def _dist_to_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    vx = bx - ax
    vy = by - ay
    wx = px - ax
    wy = py - ay
    span = vx * vx + vy * vy
    if span <= 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, (wx * vx + wy * vy) / span))
    cx = ax + t * vx
    cy = ay + t * vy
    return math.hypot(px - cx, py - cy)


def _draw_capsule(mask: list[int], a: tuple[float, float], b: tuple[float, float], radius: float) -> None:
    ax, ay = a[0] * SCALE, a[1] * SCALE
    bx, by = b[0] * SCALE, b[1] * SCALE
    rr = radius * SCALE
    x0 = max(0, int(math.floor(min(ax, bx) - rr - 1)))
    x1 = min(W, int(math.ceil(max(ax, bx) + rr + 1)))
    y0 = max(0, int(math.floor(min(ay, by) - rr - 1)))
    y1 = min(H, int(math.ceil(max(ay, by) + rr + 1)))
    for y in range(y0, y1):
        for x in range(x0, x1):
            d = _dist_to_segment(x + 0.5, y + 0.5, ax, ay, bx, by)
            if d <= rr:
                mask[y * W + x] = 255


def _downsample(mask: list[int]) -> list[int]:
    out: list[int] = []
    area = SCALE * SCALE
    for y in range(H_LOGICAL):
        for x in range(W_LOGICAL):
            total = 0
            for yy in range(SCALE):
                row = (y * SCALE + yy) * W
                for xx in range(SCALE):
                    total += mask[row + x * SCALE + xx]
            out.append(round(total / area))
    return out


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    )


def _write_png(path: Path, alpha: list[int]) -> None:
    rows = []
    for y in range(H_LOGICAL):
        row = bytearray([0])
        for x in range(W_LOGICAL):
            a = alpha[y * W_LOGICAL + x]
            row.extend((0, 0, 0, a))
        rows.append(bytes(row))
    raw = b"".join(rows)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", W_LOGICAL, H_LOGICAL, 8, 6, 0, 0, 0))
        + _png_chunk(b"IDAT", zlib.compress(raw, 9))
        + _png_chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def main() -> None:
    mask = [0] * (W * H)

    # A compact monochrome version of the houhub knot mark. At menu
    # bar sizes the exact color-layer interlock is lost, so this keeps the
    # official diamond/knot silhouette while staying valid as an AppKit mask.
    _draw_capsule(mask, (15.0, 10.5), (33.5, 29.0), 5.5)
    _draw_capsule(mask, (29.0, 33.5), (10.5, 15.0), 5.5)
    _draw_capsule(mask, (29.0, 10.5), (10.5, 29.0), 5.5)
    _draw_capsule(mask, (15.0, 33.5), (33.5, 15.0), 5.5)

    out = Path(__file__).parent / "tray-icon-template.png"
    _write_png(out, _downsample(mask))
    print(f"wrote {out} {W_LOGICAL}x{H_LOGICAL}")


if __name__ == "__main__":
    main()
