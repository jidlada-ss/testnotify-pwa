#!/usr/bin/env python3
"""Generate PWA icons for TestNotify"""
import struct, zlib, os

def make_png(size, bg_rgb, fg_rgb):
    """Create a minimal PNG icon with rounded square background and calendar symbol"""
    w = h = size
    pixels = []
    r_bg, g_bg, b_bg = bg_rgb
    r_fg, g_fg, b_fg = fg_rgb
    radius = int(size * 0.22)
    inner = int(size * 0.14)
    
    for y in range(h):
        row = []
        for x in range(w):
            # Rounded rect background
            cx = min(x, w-1-x)
            cy = min(y, h-1-y)
            in_bg = True
            if cx < radius and cy < radius:
                dx = radius - cx
                dy = radius - cy
                in_bg = (dx*dx + dy*dy) <= radius*radius
            
            if not in_bg:
                row += [0,0,0,0]  # transparent
                continue
            
            # Draw simple calendar icon
            px = (x - w//2) / (w * 0.35)
            py = (y - h//2) / (h * 0.35)
            
            # Calendar body
            in_icon = (-0.8 <= px <= 0.8) and (-0.5 <= py <= 0.8)
            # Calendar top bar
            in_bar = (-0.8 <= px <= 0.8) and (-0.9 <= py <= -0.5)
            # Grid dots (simplified)
            in_dot = False
            for gx in [-0.45, 0.0, 0.45]:
                for gy in [0.1, 0.5]:
                    if abs(px-gx) < 0.13 and abs(py-gy) < 0.13:
                        in_dot = True
            # Header line
            in_line = (-0.7 <= px <= 0.7) and (-0.55 <= py <= -0.45)
            
            if in_bar:
                row += [r_bg+20, g_bg+20, b_bg+20, 255]
            elif in_line:
                row += [r_fg+60, g_fg+60, b_fg+60, 200]
            elif in_dot:
                row += [r_fg, g_fg, b_fg, 255]
            elif in_icon:
                row += [r_bg+30, g_bg+30, b_bg+30, 255]
            else:
                row += [r_bg, g_bg, b_bg, 255]
        pixels.append(bytes(row))
    
    def write_chunk(tag, data):
        c = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', c)
    
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)  # RGBA
    # Actually use RGBA (color type 6)
    ihdr = struct.pack('>II', w, h) + bytes([8, 6, 0, 0, 0])
    
    raw = b''
    for row in pixels:
        raw += b'\x00' + row
    
    compressed = zlib.compress(raw, 9)
    
    png  = b'\x89PNG\r\n\x1a\n'
    png += write_chunk(b'IHDR', ihdr)
    png += write_chunk(b'IDAT', compressed)
    png += write_chunk(b'IEND', b'')
    return png

os.makedirs('icons', exist_ok=True)

# Primary purple color
bg = (127, 119, 221)  # #7F77DD
fg = (255, 255, 255)

for size in [192, 512]:
    data = make_png(size, bg, fg)
    with open(f'icons/icon-{size}.png', 'wb') as f:
        f.write(data)
    print(f'Created icons/icon-{size}.png ({len(data)} bytes)')

print('Icons generated!')
