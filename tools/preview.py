#!/usr/bin/env python3
"""
Headless preview of the plugin's fragment shader (Linux + Mesa llvmpipe, no GPU needed).
Compiles tools/out/full_shader.frag (run tools/gen_shader.py first) and renders PNGs.

  python tools/preview.py sheet  out.png            # every engine, default params
  python tools/preview.py shapes out.png            # every Shape for the shape-driven engines
  python tools/preview.py palettes out.png          # every palette on one engine
  python tools/preview.py one out.png Engine=5 Shape=3 Palette=8 Density=0.7 t=12
"""
import ctypes
import colorsys
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_shader as G  # noqa: E402

os.environ.setdefault("EGL_PLATFORM", "surfaceless")
os.environ.setdefault("LIBGL_ALWAYS_SOFTWARE", "1")

egl = ctypes.CDLL("libEGL.so.1")
egl.eglGetProcAddress.restype = ctypes.c_void_p
egl.eglGetProcAddress.argtypes = [ctypes.c_char_p]
egl.eglGetPlatformDisplay.restype = ctypes.c_void_p
egl.eglGetPlatformDisplay.argtypes = [ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]
egl.eglInitialize.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int)]
egl.eglChooseConfig.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_void_p),
                                ctypes.c_int, ctypes.POINTER(ctypes.c_int)]
egl.eglCreateContext.restype = ctypes.c_void_p
egl.eglCreateContext.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(ctypes.c_int)]
egl.eglMakeCurrent.argtypes = [ctypes.c_void_p] * 4
egl.eglBindAPI.argtypes = [ctypes.c_uint]


def _init_gl():
    dpy = egl.eglGetPlatformDisplay(0x31DD, None, None)  # EGL_PLATFORM_SURFACELESS_MESA
    assert dpy, "no EGL display"
    maj, mnr = ctypes.c_int(), ctypes.c_int()
    assert egl.eglInitialize(dpy, ctypes.byref(maj), ctypes.byref(mnr)), "eglInitialize failed"
    assert egl.eglBindAPI(0x30A2)  # EGL_OPENGL_API
    cfg_attr = (ctypes.c_int * 5)(0x3040, 0x8, 0x3038, 0, 0)  # RENDERABLE_TYPE=OPENGL_BIT, NONE
    cfg = ctypes.c_void_p()
    n = ctypes.c_int()
    egl.eglChooseConfig(dpy, cfg_attr, ctypes.byref(cfg), 1, ctypes.byref(n))
    ctx_attr = (ctypes.c_int * 7)(0x3098, 4, 0x30FB, 1, 0x30FD, 1, 0x3038)
    ctx = egl.eglCreateContext(dpy, cfg, None, ctx_attr)
    assert ctx, "no GL 4.1 core context (llvmpipe missing?)"
    assert egl.eglMakeCurrent(dpy, None, None, ctx), "eglMakeCurrent failed"


_init_gl()
_fn = {}


def gl(name, res, *args):
    if name not in _fn:
        addr = egl.eglGetProcAddress(name.encode())
        assert addr, "missing GL function " + name
        _fn[name] = ctypes.CFUNCTYPE(res, *args)(addr)
    return _fn[name]


c_int, c_uint, c_float, c_char_p, c_void_p = ctypes.c_int, ctypes.c_uint, ctypes.c_float, ctypes.c_char_p, ctypes.c_void_p
P = ctypes.POINTER

VERT = b"""#version 410 core
out vec2 i_uv;
void main(){
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    i_uv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
"""


def _compile(kind, src):
    s = gl("glCreateShader", c_uint, c_uint)(kind)
    arr = (c_char_p * 1)(src)
    gl("glShaderSource", None, c_uint, c_int, P(c_char_p), P(c_int))(s, 1, arr, None)
    gl("glCompileShader", None, c_uint)(s)
    ok = c_int()
    gl("glGetShaderiv", None, c_uint, c_uint, P(c_int))(s, 0x8B81, ctypes.byref(ok))
    if not ok.value:
        buf = ctypes.create_string_buffer(8192)
        gl("glGetShaderInfoLog", None, c_uint, c_int, P(c_int), c_char_p)(s, 8192, None, buf)
        raise RuntimeError("shader compile failed:\n" + buf.value.decode(errors="replace"))
    return s


_prog = None
_w = _h = 0
_fbo = _tex = _vao = 0


def _setup(w, h):
    global _prog, _w, _h, _fbo, _tex, _vao
    if _prog is None:
        frag = open(os.path.join(G.ROOT, "tools", "out", "full_shader.frag"), "rb").read()
        vs, fs = _compile(0x8B31, VERT), _compile(0x8B30, frag)
        _prog = gl("glCreateProgram", c_uint)()
        gl("glAttachShader", None, c_uint, c_uint)(_prog, vs)
        gl("glAttachShader", None, c_uint, c_uint)(_prog, fs)
        gl("glLinkProgram", None, c_uint)(_prog)
        ok = c_int()
        gl("glGetProgramiv", None, c_uint, c_uint, P(c_int))(_prog, 0x8B82, ctypes.byref(ok))
        if not ok.value:
            buf = ctypes.create_string_buffer(8192)
            gl("glGetProgramInfoLog", None, c_uint, c_int, P(c_int), c_char_p)(_prog, 8192, None, buf)
            raise RuntimeError("link failed:\n" + buf.value.decode(errors="replace"))
        v = c_uint()
        gl("glGenVertexArrays", None, c_int, P(c_uint))(1, ctypes.byref(v))
        _vao = v.value
    if (w, h) != (_w, _h):
        t, f = c_uint(), c_uint()
        gl("glGenTextures", None, c_int, P(c_uint))(1, ctypes.byref(t))
        gl("glBindTexture", None, c_uint, c_uint)(0x0DE1, t.value)
        gl("glTexImage2D", None, c_uint, c_int, c_int, c_int, c_int, c_int, c_uint, c_uint, c_void_p)(
            0x0DE1, 0, 0x8058, w, h, 0, 0x1908, 0x1401, None)
        gl("glGenFramebuffers", None, c_int, P(c_uint))(1, ctypes.byref(f))
        gl("glBindFramebuffer", None, c_uint, c_uint)(0x8D40, f.value)
        gl("glFramebufferTexture2D", None, c_uint, c_uint, c_uint, c_uint, c_int)(0x8D40, 0x8CE0, 0x0DE1, t.value, 0)
        _fbo, _tex, _w, _h = f.value, t.value, w, h


def _defaults():
    d = {}
    for name, kind, default in G.PARAMS:
        if kind == "color":
            h, s, b = default
            d[name] = tuple(colorsys.hsv_to_rgb(h, s, b)) + (1.0,)
        else:
            d[name] = float(default)
    d["t"] = 8.0
    return d


def render(w=320, h=180, **over):
    _setup(w, h)
    p = _defaults()
    p.update(over)
    gl("glBindFramebuffer", None, c_uint, c_uint)(0x8D40, _fbo)
    gl("glViewport", None, c_int, c_int, c_int, c_int)(0, 0, w, h)
    gl("glUseProgram", None, c_uint)(_prog)

    def loc(n):
        return gl("glGetUniformLocation", c_int, c_uint, c_char_p)(_prog, n.encode())

    u1f = gl("glUniform1f", None, c_int, c_float)
    u2f = gl("glUniform2f", None, c_int, c_float, c_float)
    u4f = gl("glUniform4f", None, c_int, c_float, c_float, c_float, c_float)
    u1i = gl("glUniform1i", None, c_int, c_int)
    u2f(loc("resolution"), w, h)
    u1f(loc("time"), p["t"])
    u1f(loc("animTime"), p["t"])
    u1f(loc("deltaTime"), 0.016)
    u1i(loc("frame"), 1)
    u1f(loc("bpm"), 120.0)
    u1f(loc("phase"), p.get("phase", 0.3))
    for name, kind, _ in G.PARAMS:
        v = p[name]
        if kind == "color":
            u4f(loc(name), *v)
        elif kind == "bool":
            u1i(loc(name), int(bool(v)))
        else:
            u1f(loc(name), float(v))
    gl("glBindVertexArray", None, c_uint)(_vao)
    gl("glDrawArrays", None, c_uint, c_int, c_int)(0x0004, 0, 3)
    buf = (ctypes.c_ubyte * (w * h * 4))()
    gl("glReadPixels", None, c_int, c_int, c_int, c_int, c_uint, c_uint, c_void_p)(0, 0, w, h, 0x1908, 0x1401, buf)
    img = np.frombuffer(buf, dtype=np.uint8).reshape(h, w, 4)[::-1, :, :3]
    return img.copy()


def sheet(items, cols, out, w=320, h=180):
    rows = (len(items) + cols - 1) // cols
    img = Image.new("RGB", (cols * w, rows * (h + 16)), (20, 20, 20))
    d = ImageDraw.Draw(img)
    for i, (label, kw) in enumerate(items):
        x, y = (i % cols) * w, (i // cols) * (h + 16)
        img.paste(Image.fromarray(render(w, h, **kw)), (x, y + 16))
        d.text((x + 4, y + 2), label, fill=(230, 230, 230))
    img.save(out)
    print("wrote", out, img.size)


def parse_kv(args):
    kw = {}
    for a in args:
        k, v = a.split("=")
        kw[k] = float(v)
    return kw


if __name__ == "__main__":
    mode, out = sys.argv[1], sys.argv[2]
    if mode == "sheet":
        sheet([(n, dict(Engine=i)) for i, (n, _) in enumerate(G.ENGINES)], 4, out)
    elif mode == "shapes":
        eng = {n: i for i, (n, _) in enumerate(G.ENGINES)}
        items = []
        for e in ("Gradient 2", "Lines", "Shapes", "Neon"):
            for s, sn in enumerate(G.SHAPES):
                items.append(("%s / %s" % (e, sn), dict(Engine=eng[e], Shape=s, Palette=8)))
        sheet(items, 7, out, 240, 135)
    elif mode == "palettes":
        eng = int(sys.argv[3]) if len(sys.argv) > 3 else 12
        items = [("Custom", dict(Engine=eng, Palette=0))] + [(n, dict(Engine=eng, Palette=i + 1)) for i, (n, _) in enumerate(G.PALETTES)]
        sheet(items, 6, out, 240, 135)
    elif mode == "one":
        kw = parse_kv(sys.argv[3:])
        w, h = int(kw.pop("w", 960)), int(kw.pop("h", 540))
        Image.fromarray(render(w, h, **kw)).save(out)
        print("wrote", out)
