#!/usr/bin/env python3
"""
Single source of truth for the plugin.

Reads  shader/*.glsl  and the tables below and generates:

  src/ShaderSource.h      the fragment-shader body as <16 KB raw-string chunks
                          (MSVC refuses single string literals above ~16 KB)
  src/ParamsGenerated.inc parameter registration code, included by the plugin
                          constructor (so GLSL uniforms and C++ params can
                          never drift apart)
  tools/out/full_shader.frag  the exact shader the host will compile
                          (framework header + uniforms + body), for glslang
                          validation and for tools/preview.py

Run:  python tools/gen_shader.py
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --------------------------------------------------------------------------
#  Tables
# --------------------------------------------------------------------------
ENGINES = [
    ("Fog",        "ENG_FOG"),
    ("Lava",       "ENG_LAVA"),
    ("Neon",       "ENG_NEON"),
    ("Aurora",     "ENG_AURORA"),
    ("Smoke",      "ENG_SMOKE"),
    ("Gradient 2", "ENG_GRAD2"),
    ("Gradient 3", "ENG_GRAD3"),
    ("Gradient 4", "ENG_GRAD4"),
    ("Mesh",       "ENG_MESH"),
    ("Lasers",     "ENG_LASERS"),
    ("Lines",      "ENG_LINES"),
    ("Blocks",     "ENG_BLOCKS"),
    ("Shapes",     "ENG_SHAPES"),
    ("Ink",        "ENG_INK"),
]

SHAPES = [
    "Circle", "Square", "Triangle", "Hexagon", "Star", "Diamond", "Cross",
    "Ring", "Pill", "Heart", "Linear", "Angular", "Spiral", "Wave",
]

# name, 4 stops (dark -> light-ish, but any order works)
PALETTES = [
    ("Sunset",       ["#1B0B3B", "#8E2C6D", "#F2556B", "#FFB45C"]),
    ("Ocean",        ["#03122F", "#0B4F8A", "#1FA2C9", "#9BE7F2"]),
    ("Aurora",       ["#04121F", "#0B7A75", "#3BE39A", "#A06BFF"]),
    ("Neon Club",    ["#12002B", "#FF1CA8", "#00E5FF", "#B6FF3B"]),
    ("Lava Flow",    ["#1A0000", "#8A0F00", "#FF4B0A", "#FFD23F"]),
    ("Toxic",        ["#031A0B", "#0F6B1E", "#7DFF1F", "#F4FF6B"]),
    ("Cotton Candy", ["#FFB3E6", "#B8A1FF", "#8FD8FF", "#FFF1FA"]),
    ("Cyberpunk",    ["#0B0221", "#5B1AE6", "#FF2E88", "#19E3FF"]),
    ("Ice",          ["#061B33", "#2B6FA8", "#8CCBFF", "#F2FBFF"]),
    ("Forest",       ["#04150D", "#0D4A2B", "#3A8F4A", "#C9E58A"]),
    ("Fire",         ["#120000", "#C21800", "#FF7A00", "#FFE066"]),
    ("Galaxy",       ["#050014", "#2A0B73", "#8A2BE2", "#FF6FD8"]),
    ("Vaporwave",    ["#2B0B5C", "#FF6AD5", "#94D0FF", "#FFF3A8"]),
    ("Mono",         ["#050505", "#3A3A3A", "#9A9A9A", "#FFFFFF"]),
    ("Gold",         ["#1A1000", "#7A4B00", "#D9A21B", "#FFF0A6"]),
    ("Candy",        ["#FF4D6D", "#FFB703", "#4CC9F0", "#7209B7"]),
    ("Deep Sea",     ["#00040D", "#00203F", "#006D77", "#83C5BE"]),
    ("Magma",        ["#0B0019", "#5A0F4D", "#D63A3A", "#FFCB5C"]),
    ("Mint",         ["#052B2B", "#1B998B", "#7FE0C4", "#F1FFF8"]),
    ("Berry",        ["#1A0522", "#6B1B6B", "#D2307F", "#FFB1C8"]),
    ("Desert",       ["#2B1409", "#8C4A2F", "#D9894B", "#F6D6A0"]),
    ("Twilight",     ["#0A0A2A", "#3D2B8C", "#C25A9B", "#FFC48A"]),
    ("Acid",         ["#0A0A0A", "#B6FF00", "#FF00D4", "#00F0FF"]),
    ("Rose",         ["#2A0A18", "#8F2A52", "#E8688A", "#FFD6E0"]),
    ("Emerald",      ["#00130C", "#006B4E", "#14C48C", "#C3FFE8"]),
    ("Electric Blue", ["#00061F", "#0021A8", "#1E6BFF", "#8FF3FF"]),
    ("Ultraviolet",  ["#0A0020", "#4B00B5", "#A12CFF", "#F0A8FF"]),
    ("Ember",        ["#0D0300", "#5E1500", "#E04A00", "#FFB36B"]),
    ("Peach",        ["#FF9A8B", "#FFC3A0", "#FFDDC1", "#FFF5E9"]),
    ("Matrix",       ["#000A02", "#003B14", "#00C23A", "#B7FFC8"]),
    ("Retro 80s",    ["#1F1147", "#FF2A6D", "#FFB900", "#05D9E8"]),
]

# (name, kind, default)  kind: option | range | bool | color
# Order here == order in Resolume.  Colour groups must stay at the very end.
PARAMS = [
    ("Engine",     "option_engine", 0),
    ("Shape",      "option_shape",  0),
    ("Palette",    "option_palette", 1),
    ("Scale",      "range", 0.50),
    ("Density",    "range", 0.50),
    ("Smoothness", "range", 0.80),
    ("Blur",       "range", 0.20),
    ("Speed",      "range", 0.35),
    ("Warp",       "range", 0.40),
    ("Seed",       "range", 0.00),
    ("Rotation",   "range", 0.00),
    ("Brightness", "range", 0.50),
    ("Contrast",   "range", 0.50),
    ("Saturation", "range", 0.50),
    ("ColorShift", "range", 0.00),
    ("Pulse",      "range", 0.00),
    ("Reverse",    "bool",  False),
    ("Invert",     "bool",  False),
    # custom palette colours (hue, sat, bri, alpha) - defaults are a blue>violet>pink>orange ramp
    ("Color1",     "color", (0.62, 0.90, 0.35)),
    ("Color2",     "color", (0.78, 0.85, 0.65)),
    ("Color3",     "color", (0.92, 0.75, 0.95)),
    ("Color4",     "color", (0.08, 0.70, 1.00)),
]

FRAMEWORK_HEADER = """#version 410 core
out vec4 fragColor;
uniform vec2 resolution;
uniform float time;
uniform float deltaTime;
uniform int frame;
uniform float bpm;
uniform float phase;
in vec2 i_uv;
uniform float animTime;
"""

CHUNK = 8000


def hex_to_glsl(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return "vec3(%.4f,%.4f,%.4f)" % (r, g, b)


def build_palette_glsl():
    lines = ["const vec3 PRESETS[%d] = vec3[%d](" % (len(PALETTES) * 4, len(PALETTES) * 4)]
    rows = []
    for name, cols in PALETTES:
        rows.append("    " + ", ".join(hex_to_glsl(c) for c in cols) + "  // " + name)
    # commas between rows, none after the last
    out = []
    for i, r in enumerate(rows):
        head, comment = r.split("  // ")
        out.append(head + ("," if i < len(rows) - 1 else "") + "  // " + comment)
    lines += out
    lines.append(");")
    return "\n".join(lines)


def read(path):
    with open(os.path.join(ROOT, path), "r", encoding="utf-8") as f:
        return f.read()


def build_body():
    defs = "\n".join("#define %s %d" % (macro, i) for i, (_, macro) in enumerate(ENGINES))
    common = read("shader/00_common.glsl").replace("//@PALETTES@", build_palette_glsl())
    return "\n".join([
        "// ---- generated engine ids ----", defs, "",
        common, read("shader/10_engines.glsl"), read("shader/90_main.glsl"),
    ])


def uniform_decls():
    out = []
    for name, kind, _ in PARAMS:
        if kind == "bool":
            out.append("uniform bool %s;" % name)
        elif kind == "color":
            out.append("uniform vec4 %s;" % name)
        else:
            out.append("uniform float %s;" % name)
    return "\n".join(out) + "\n"


def chunk_lines(text):
    chunks, cur = [], ""
    for line in text.splitlines(True):
        if len(cur) + len(line) > CHUNK and cur:
            chunks.append(cur)
            cur = ""
        cur += line
    if cur:
        chunks.append(cur)
    return chunks


def cstr(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def gen_shader_header(body):
    chunks = chunk_lines(body)
    for c in chunks:
        assert ")GLSL\"" not in c
        assert len(c) < 15000
    parts = ["#pragma once", "#include <string>", "",
             "// GENERATED by tools/gen_shader.py - do not edit by hand.",
             "// Split into small chunks because MSVC limits a single string literal to ~16 KB.", "",
             "static const char* const kShaderChunks[] = {"]
    for c in chunks:
        parts.append('R"GLSL(' + c + ')GLSL",')
    parts += ["nullptr", "};", "",
              "inline std::string BuildBackgroundShader()", "{",
              "\tstd::string s;",
              "\tfor( const char* const* c = kShaderChunks; *c; ++c )",
              "\t\ts += *c;",
              "\treturn s;", "}", ""]
    return "\n".join(parts)


def gen_params_inc():
    L = ["// GENERATED by tools/gen_shader.py - do not edit by hand.",
         "// Included inside the plugin constructor.", ""]
    index = 0
    for name, kind, default in PARAMS:
        if kind == "option_engine":
            opts = ", ".join('{ %s, %d.0f }' % (cstr(n), i) for i, (n, _) in enumerate(ENGINES))
            L.append('AddParam( ffglqs::ParamOption::Create( %s, { %s }, %d ) );' % (cstr(name), opts, default))
        elif kind == "option_shape":
            opts = ", ".join('{ %s, %d.0f }' % (cstr(n), i) for i, n in enumerate(SHAPES))
            L.append('AddParam( ffglqs::ParamOption::Create( %s, { %s }, %d ) );' % (cstr(name), opts, default))
        elif kind == "option_palette":
            names = ["Custom (Color1-4)"] + [n for n, _ in PALETTES]
            opts = ", ".join('{ %s, %d.0f }' % (cstr(n), i) for i, n in enumerate(names))
            L.append('AddParam( ffglqs::ParamOption::Create( %s, { %s }, %d ) );' % (cstr(name), opts, default))
        elif kind == "range":
            L.append('AddParam( ffglqs::ParamRange::Create( %s, %.3ff, ffglqs::ParamRange::Range( 0.0f, 1.0f ) ) );'
                     % (cstr(name), default))
        elif kind == "bool":
            L.append('AddParam( ffglqs::ParamBool::Create( %s, %s ) );' % (cstr(name), "true" if default else "false"))
        elif kind == "color":
            h, s, b = default
            L.append('AddParam( ffglqs::Param::Create( %s, FF_TYPE_HUE, %.3ff ) );' % (cstr(name), h))
            L.append('AddParam( ffglqs::Param::Create( %s, FF_TYPE_SATURATION, %.3ff ) );' % (cstr(name + "_saturation"), s))
            L.append('AddParam( ffglqs::Param::Create( %s, FF_TYPE_BRIGHTNESS, %.3ff ) );' % (cstr(name + "_brightness"), b))
            L.append('AddParam( ffglqs::Param::Create( %s, FF_TYPE_ALPHA, 1.0f ) );' % cstr(name + "_alpha"))
            nice = "Color " + name[-1]
            L.append('SetParamDisplayName( %d, %s, false );' % (index, cstr(nice)))
            L.append('SetParamDisplayName( %d, %s, false );' % (index + 1, cstr(nice + " Sat")))
            L.append('SetParamDisplayName( %d, %s, false );' % (index + 2, cstr(nice + " Bri")))
            L.append('SetParamDisplayName( %d, %s, false );' % (index + 3, cstr(nice + " Alpha")))
            index += 3
        index += 1
    L.append("")
    return "\n".join(L)


def main():
    body = build_body()
    os.makedirs(os.path.join(ROOT, "src"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "tools", "out"), exist_ok=True)

    with open(os.path.join(ROOT, "src", "ShaderSource.h"), "w", encoding="utf-8", newline="\n") as f:
        f.write(gen_shader_header(body))
    with open(os.path.join(ROOT, "src", "ParamsGenerated.inc"), "w", encoding="utf-8", newline="\n") as f:
        f.write(gen_params_inc())
    with open(os.path.join(ROOT, "tools", "out", "full_shader.frag"), "w", encoding="utf-8", newline="\n") as f:
        f.write(FRAMEWORK_HEADER + uniform_decls() + body)

    n_eng, n_sh, n_pal = len(ENGINES), len(SHAPES), len(PALETTES) + 1
    print("engines=%d shapes=%d palettes=%d (incl. Custom)" % (n_eng, n_sh, n_pal))
    print("structural combos (engine x shape x palette) = %d" % (n_eng * n_sh * n_pal))
    print("x 10,000 seeds                              = %d" % (n_eng * n_sh * n_pal * 10000))
    print("wrote src/ShaderSource.h, src/ParamsGenerated.inc, tools/out/full_shader.frag")


if __name__ == "__main__":
    sys.exit(main())
