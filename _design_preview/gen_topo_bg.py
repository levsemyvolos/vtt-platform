"""
gen_topo_bg.py
Генератор топографічного SVG-фону для VTT Platform Design Preview
Алгоритм: Fractal Value Noise + Marching Squares → ізолінії

Два варіанти:
  bg_topo_dark.svg  — Obscure theme  (#c8a55c fallen-gold на #0a0c10)
  bg_topo_light.svg — Sacred Order   (#a87a14 leaf-gold  на #f0e9d6)

Запуск: python gen_topo_bg.py
Залежності: тільки стандартний Python (numpy не потрібен)
"""

import math
import random
import sys


# ─────────────────────────────────────────────
#  1. VALUE NOISE (без numpy — чиста Python)
# ─────────────────────────────────────────────

def smoothstep(t: float) -> float:
    """Smoothstep-інтерполяція: 3t² − 2t³"""
    return t * t * (3.0 - 2.0 * t)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def generate_value_noise(
    width: int,
    height: int,
    scale: float = 5.0,
    octaves: int = 4,
    seed: int = 42,
) -> list[list[float]]:
    """
    Генерує 2D-поле фрактального value noise розміром width×height.
    Повертає list[list[float]] зі значеннями у діапазоні [0, 1].
    """
    rng = random.Random(seed)

    # Акумулятор
    field = [[0.0] * width for _ in range(height)]
    amplitude = 0.5
    frequency = scale
    total_amplitude = 0.0

    for _ in range(octaves):
        # Розміри сітки вузлів для поточної октави
        gw = math.ceil(frequency) + 2
        gh = math.ceil(frequency) + 2

        # Генеруємо випадкову сітку
        grid = [[rng.random() for _ in range(gw)] for _ in range(gh)]

        for py in range(height):
            sy = (py / height) * frequency
            iy = int(sy)
            ty = sy - iy
            vy = smoothstep(ty)

            iy0 = min(iy, gh - 1)
                # gw, gh захищають від виходу за межі
            iy1 = min(iy + 1, gh - 1)
            row0 = grid[iy0]
            row1 = grid[iy1]

            for px in range(width):
                sx = (px / width) * frequency
                ix = int(sx)
                tx = sx - ix
                vx = smoothstep(tx)

                ix0 = min(ix, gw - 1)
                ix1 = min(ix + 1, gw - 1)

                # Білінійна інтерполяція
                top = lerp(row0[ix0], row0[ix1], vx)
                bot = lerp(row1[ix0], row1[ix1], vx)
                field[py][px] += lerp(top, bot, vy) * amplitude

        total_amplitude += amplitude
        amplitude *= 0.5
        frequency *= 2.0

    # Нормалізуємо у [0, 1]
    flat = [v for row in field for v in row]
    mn, mx = min(flat), max(flat)
    span = mx - mn or 1.0
    return [[(v - mn) / span for v in row] for row in field]


# ─────────────────────────────────────────────
#  2. MARCHING SQUARES
# ─────────────────────────────────────────────

# 16-case lookup-table (Lorensen & Cline 1987)
# ключ = bitmask кутів (0..15) у порядку TL,TR,BR,BL
# значення = список пар рёбер (0=top, 1=right, 2=bottom, 3=left)
# cases 5 та 10 — saddle points: однозначно неоднозначні, беремо одну з двох топологій
EDGE_TABLE: dict[int, list[tuple[int, int]]] = {
    0:  [],
    1:  [(0, 3)],
    2:  [(0, 1)],
    3:  [(1, 3)],
    4:  [(1, 2)],
    5:  [(0, 1), (2, 3)],
    6:  [(0, 2)],
    7:  [(2, 3)],
    8:  [(2, 3)],
    9:  [(0, 2)],
    10: [(0, 3), (1, 2)],
    11: [(1, 2)],
    12: [(1, 3)],
    13: [(0, 1)],
    14: [(0, 3)],
    15: [],
}


def _edge_point(
    edge: int,
    x: int, y: int,
    c0: float, c1: float, c2: float, c3: float,
    threshold: float,
) -> tuple[float, float]:
    """
    Обчислює точку перетину ізолінії з ребром ячейки (x, y).
    Кути ячейки:  c0=top-left, c1=top-right, c2=bottom-right, c3=bottom-left
    Ребра:        0=top, 1=right, 2=bottom, 3=left
    """
    EPS = 1e-6
    if edge == 0:  # top:   c0 → c1
        t = (threshold - c0) / (c1 - c0 + EPS)
        return (x + t, float(y))
    elif edge == 1:  # right: c1 → c2
        t = (threshold - c1) / (c2 - c1 + EPS)
        return (float(x + 1), y + t)
    elif edge == 2:  # bottom: c3 → c2  (reversed to keep winding consistent)
        t = (threshold - c3) / (c2 - c3 + EPS)
        return (x + t, float(y + 1))
    else:          # left:   c0 → c3
        t = (threshold - c0) / (c3 - c0 + EPS)
        return (float(x), y + t)


def marching_squares(
    field: list[list[float]],
    threshold: float,
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """
    Повертає список відрізків [(p1, p2), ...] для заданого рівня.
    """
    height = len(field)
    width  = len(field[0])
    segments: list[tuple[tuple[float, float], tuple[float, float]]] = []

    for iy in range(height - 1):
        row0 = field[iy]
        row1 = field[iy + 1]
        for ix in range(width - 1):
            c0 = row0[ix]       # top-left
            c1 = row0[ix + 1]   # top-right
            c2 = row1[ix + 1]   # bottom-right
            c3 = row1[ix]       # bottom-left

            code = 0
            if c0 > threshold: code |= 1
            if c1 > threshold: code |= 2
            if c2 > threshold: code |= 4
            if c3 > threshold: code |= 8

            for ea, eb in EDGE_TABLE[code]:
                pa = _edge_point(ea, ix, iy, c0, c1, c2, c3, threshold)
                pb = _edge_point(eb, ix, iy, c0, c1, c2, c3, threshold)
                segments.append((pa, pb))

    return segments


# ─────────────────────────────────────────────
#  3. SVG BUILDER
# ─────────────────────────────────────────────

def build_svg(
    grid_w: int,
    grid_h: int,
    all_segments: list[list[tuple]],
    *,
    # Viewport SVG (логічна система координат = grid)
    vp_w: int | None = None,
    vp_h: int | None = None,
    bg_color: str | None = None,           # None → прозорий фон (для production)
    stroke_color: str = "#c8a55c",
    stroke_opacity_min: float = 0.06,
    stroke_opacity_max: float = 0.20,
    stroke_width: float = 1.2,
    stroke_width_inner: float = 0.7,
) -> str:
    """
    Будує SVG-рядок з топографічними ізолініями.
    Лінії отримують плавну opacity від min до max (центральні рівні яскравіші).
    Якщо bg_color=None — фон прозорий (рекомендовано для production-deploy,
    тоді SVG не залежить від blend-mode і працює як чистий overlay).
    """
    if vp_w is None:
        vp_w = grid_w
    if vp_h is None:
        vp_h = grid_h

    # Масштаб сітки → viewport
    sx = vp_w / grid_w
    sy = vp_h / grid_h

    n_levels = len(all_segments)

    lines: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg"',
        f'     viewBox="0 0 {vp_w} {vp_h}"',
        f'     width="100%" height="100%">',
    ]
    if bg_color is not None:
        lines.append(f'  <rect width="{vp_w}" height="{vp_h}" fill="{bg_color}"/>')
    lines.append(
        f'  <g stroke="{stroke_color}" fill="none" stroke-linecap="round" stroke-linejoin="round">'
    )

    for lvl_idx, segs in enumerate(all_segments):
        if not segs:
            continue

        # Opacity: параболічна крива — найяскравіші рівні посередині
        t = lvl_idx / max(n_levels - 1, 1)           # 0..1
        # Bell-curve: 1 у центрі, ~0 на краях
        bell = 1.0 - abs(2.0 * t - 1.0) ** 1.6
        opacity = stroke_opacity_min + (stroke_opacity_max - stroke_opacity_min) * bell
        # Зовнішні рівні (краї) — тонші лінії
        sw = stroke_width_inner + (stroke_width - stroke_width_inner) * bell

        lines.append(
            f'    <g opacity="{opacity:.3f}" stroke-width="{sw:.2f}">'
        )
        for (x1, y1), (x2, y2) in segs:
            lines.append(
                f'      <line'
                f' x1="{x1 * sx:.1f}" y1="{y1 * sy:.1f}"'
                f' x2="{x2 * sx:.1f}" y2="{y2 * sy:.1f}"/>'
            )
        lines.append('    </g>')

    lines.extend(['  </g>', '</svg>'])
    return '\n'.join(lines)


# ─────────────────────────────────────────────
#  4. КОНФІГУРАЦІЯ ТА ЗАПУСК
# ─────────────────────────────────────────────

THEMES = {
    "dark": {
        "filename": "bg_topo_dark.svg",
        "bg_color": None,                # прозорий фон — overlay-mode
        "stroke_color": "#c8a55c",       # fallen-gold
        "stroke_opacity_min": 0.04,
        "stroke_opacity_max": 0.22,
        "stroke_width": 1.4,
        "stroke_width_inner": 0.6,
        "noise_seed": 42,
        "noise_scale": 4.8,
        "noise_octaves": 4,
        "n_levels": 16,
        "level_min": 0.08,
        "level_max": 0.92,
    },
    "light": {
        "filename": "bg_topo_light.svg",
        "bg_color": None,                # прозорий фон — overlay-mode
        "stroke_color": "#a87a14",       # leaf-gold
        "stroke_opacity_min": 0.04,
        "stroke_opacity_max": 0.18,
        "stroke_width": 1.2,
        "stroke_width_inner": 0.55,
        "noise_seed": 137,
        "noise_scale": 4.8,
        "noise_octaves": 4,
        "n_levels": 16,
        "level_min": 0.08,
        "level_max": 0.92,
    },
}

# Логічна сітка (розрахункова роздільна здатність).
# Більше = плавніші лінії, але довше генерується та важчий SVG.
# 160×120 — production-friendly (~350 KB pre-gzip, ~80 KB gzipped, <1s генерації).
# Для більшої деталізації — підняти до 240×180 (~900 KB pre-gzip).
GRID_W = 160
GRID_H = 120

# Viewport (розміри viewBox у SVG)
VP_W = 1920
VP_H = 1080


def main() -> None:
    import os, time

    out_dir = os.path.dirname(os.path.abspath(__file__))

    for theme_name, cfg in THEMES.items():
        print(f"\n{'─'*48}")
        print(f"  Генеруємо тему: {theme_name.upper()}")
        print(f"{'─'*48}")

        t0 = time.perf_counter()
        print(f"  [1/3] Шум {GRID_W}×{GRID_H}, scale={cfg['noise_scale']}, octaves={cfg['noise_octaves']}...")
        field = generate_value_noise(
            GRID_W, GRID_H,
            scale=cfg["noise_scale"],
            octaves=cfg["noise_octaves"],
            seed=cfg["noise_seed"],
        )
        t1 = time.perf_counter()
        print(f"        готово за {t1 - t0:.1f}s")

        levels = [
            cfg["level_min"] + (cfg["level_max"] - cfg["level_min"]) * i / (cfg["n_levels"] - 1)
            for i in range(cfg["n_levels"])
        ]

        print(f"  [2/3] Marching Squares, {cfg['n_levels']} рівнів...")
        all_segs = []
        for lvl in levels:
            all_segs.append(marching_squares(field, lvl))
        t2 = time.perf_counter()
        total_segs = sum(len(s) for s in all_segs)
        print(f"        готово за {t2 - t1:.1f}s — всього {total_segs:,} відрізків")

        print(f"  [3/3] Будуємо SVG ({VP_W}×{VP_H} viewport)...")
        svg = build_svg(
            GRID_W, GRID_H, all_segs,
            vp_w=VP_W, vp_h=VP_H,
            bg_color=cfg["bg_color"],
            stroke_color=cfg["stroke_color"],
            stroke_opacity_min=cfg["stroke_opacity_min"],
            stroke_opacity_max=cfg["stroke_opacity_max"],
            stroke_width=cfg["stroke_width"],
            stroke_width_inner=cfg["stroke_width_inner"],
        )

        out_path = os.path.join(out_dir, cfg["filename"])
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(svg)
        t3 = time.perf_counter()
        size_kb = os.path.getsize(out_path) / 1024
        print(f"        збережено → {cfg['filename']}  ({size_kb:.0f} KB)  за {t3 - t2:.1f}s")

    print(f"\n✅  Готово! Обидва SVG знаходяться у папці _design_preview/\n")


if __name__ == "__main__":
    main()
