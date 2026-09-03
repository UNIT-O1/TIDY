#!/usr/bin/env python3
"""
Generate TempDrop icons (16x16, 48x48, 128x128 PNGs + SVG)
"""

import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ICONS_DIR = Path(__file__).parent.resolve()
ICONS_DIR.mkdir(parents=True, exist_ok=True)

def draw_icon(size: int) -> Image.Image:
    # High resolution supersampling for crisp edges
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background squircle with cyan-indigo gradient
    radius = int(canvas_size * 0.22)
    
    # Gradient background
    for y in range(canvas_size):
        ratio = y / canvas_size
        r = int(14 + ratio * (79 - 14))
        g = int(165 + ratio * (70 - 165))
        b = int(233 + ratio * (229 - 233))
        # Draw rounded card
        draw.line([(0, y), (canvas_size, y)], fill=(r, g, b, 255))

    # Mask to rounded rectangle
    mask = Image.new("L", (canvas_size, canvas_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    margin = int(canvas_size * 0.04)
    mask_draw.rounded_rectangle(
        [margin, margin, canvas_size - margin, canvas_size - margin],
        radius=radius,
        fill=255
    )
    
    # Apply mask
    bg_card = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    bg_card.paste(img, (0, 0), mask)

    # Now draw the foreground icon: Hourglass + Arrow down
    icon_draw = ImageDraw.Draw(bg_card)
    center_x = canvas_size / 2
    center_y = canvas_size / 2
    
    # White / ice blue shapes
    w = canvas_size * 0.52
    h = canvas_size * 0.52
    top = center_y - h / 2
    bottom = center_y + h / 2
    left = center_x - w / 2
    right = center_x + w / 2
    stroke_width = max(int(canvas_size * 0.06), 2)

    # Hourglass top bar
    icon_draw.line([(left, top), (right, top)], fill=(255, 255, 255, 255), width=stroke_width)
    # Hourglass bottom bar
    icon_draw.line([(left, bottom), (right, bottom)], fill=(255, 255, 255, 255), width=stroke_width)
    
    # Diagonal hourglass lines
    icon_draw.line([(left, top), (right, bottom)], fill=(255, 255, 255, 220), width=stroke_width)
    icon_draw.line([(right, top), (left, bottom)], fill=(255, 255, 255, 220), width=stroke_width)

    # Center drop / clock badge
    clock_r = canvas_size * 0.14
    icon_draw.ellipse(
        [center_x - clock_r, center_y - clock_r, center_x + clock_r, center_y + clock_r],
        fill=(15, 23, 42, 240),
        outline=(255, 255, 255, 255),
        width=max(int(stroke_width * 0.7), 1)
    )

    # Clock hands / downward arrow
    arrow_w = max(int(stroke_width * 0.6), 1)
    icon_draw.line([(center_x, center_y - clock_r * 0.5), (center_x, center_y + clock_r * 0.3)], fill=(56, 189, 248, 255), width=arrow_w)
    icon_draw.line([(center_x, center_y + clock_r * 0.3), (center_x - clock_r * 0.3, center_y)], fill=(56, 189, 248, 255), width=arrow_w)
    icon_draw.line([(center_x, center_y + clock_r * 0.3), (center_x + clock_r * 0.3, center_y)], fill=(56, 189, 248, 255), width=arrow_w)

    # Downsample with high quality Lanczos filter
    final_img = bg_card.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

def main():
    for size in [16, 32, 48, 128, 256]:
        img = draw_icon(size)
        out_path = ICONS_DIR / f"icon{size}.png"
        img.save(out_path, format="PNG")
        print(f"[+] Saved {out_path}")

    # Write SVG icon
    svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0284c7" flood-opacity="0.5"/>
    </filter>
  </defs>
  <rect x="6" y="6" width="116" height="116" rx="26" fill="url(#bgGrad)" filter="url(#glow)"/>
  <!-- Hourglass -->
  <path d="M 36 34 L 92 34 M 36 94 L 92 94 M 36 34 L 92 94 M 92 34 L 36 94" 
        stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  <!-- Center Badge -->
  <circle cx="64" cy="64" r="18" fill="#0f172a" stroke="#ffffff" stroke-width="4"/>
  <!-- Arrow Down -->
  <path d="M 64 54 L 64 72 M 57 66 L 64 73 L 71 66" 
        stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>'''
    (ICONS_DIR / "icon.svg").write_text(svg_content, encoding="utf-8")
    print(f"[+] Saved {ICONS_DIR / 'icon.svg'}")

if __name__ == "__main__":
    main()
