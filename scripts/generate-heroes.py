"""Render two palette and silhouette variants from the original Grovebound SVG."""

from pathlib import Path

import cairosvg


root = Path(__file__).resolve().parents[1] / "public" / "art"
warden = (root / "warden.svg").read_text(encoding="utf-8")

variants = {
    "ranger": (
        {
            "#9bca75": "#b4e3b4", "#44784b": "#4b9b8e", "#244735": "#255960",
            "#a5cf78": "#a5e5c4", "#b4d789": "#c1f1d2", "#c4564c": "#3c8d9a",
            "#8c3a38": "#296579", "#455b41": "#446f69", "#2a302b": "#343b32",
            "#26362d": "#244d4c", "#294a35": "#2b6465",
        },
        '<path d="M22 33 Q25 7 51 5 Q78 9 80 36 L70 26 48 14 32 29Z" fill="#356b65" stroke="#244d4c" stroke-width="3"/>'
        '<path d="M27 56 Q47 65 71 56 L63 70 Q48 75 33 66Z" fill="#52acaa" stroke="#27616a" stroke-width="2"/>',
    ),
    "ember": (
        {
            "#9bca75": "#ffd190", "#44784b": "#c56f46", "#244735": "#6b3b3d",
            "#a5cf78": "#f7ae73", "#b4d789": "#ffd485", "#c4564c": "#e9a14f",
            "#8c3a38": "#a25642", "#455b41": "#6f4b40", "#2a302b": "#312c30",
            "#26362d": "#4d3232", "#294a35": "#7a4440", "#dcb18a": "#bd866d",
            "#d7b58c": "#bc866d",
        },
        '<path d="M30 31 Q36 5 47 10 Q44 1 55 3 Q64 6 59 13 Q75 9 73 33 L64 23 48 17Z" fill="#4a3033" stroke="#33282e" stroke-width="3"/>'
        '<path d="M46 11 Q39 5 45 0 Q48 8 53 7 Q54 13 46 15Z" fill="#ffcd69" stroke="#da7442" stroke-width="2"/>'
        '<circle cx="52" cy="76" r="5" fill="#ffe09a" stroke="#ab6a42" stroke-width="2"/>',
    ),
}

for name, (replacements, extra) in variants.items():
    svg = warden
    for old, new in replacements.items():
        svg = svg.replace(old, new)
    svg = svg.replace("</svg>", f"  {extra}\n</svg>")
    (root / f"{name}.svg").write_text(svg, encoding="utf-8")
    cairosvg.svg2png(bytestring=svg.encode("utf-8"), write_to=str(root / f"{name}.png"), output_width=200, output_height=220)
