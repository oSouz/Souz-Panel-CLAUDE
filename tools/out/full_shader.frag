#version 410 core
out vec4 fragColor;
uniform vec2 resolution;
uniform float time;
uniform float deltaTime;
uniform int frame;
uniform float bpm;
uniform float phase;
in vec2 i_uv;
uniform float animTime;
uniform float Engine;
uniform float Shape;
uniform float Palette;
uniform float Scale;
uniform float Density;
uniform float Smoothness;
uniform float Blur;
uniform float Speed;
uniform float Warp;
uniform float Seed;
uniform float Rotation;
uniform float Brightness;
uniform float Contrast;
uniform float Saturation;
uniform float ColorShift;
uniform float Pulse;
uniform bool Reverse;
uniform bool Invert;
uniform vec4 Color1;
uniform vec4 Color2;
uniform vec4 Color3;
uniform vec4 Color4;
// ---- generated engine ids ----
#define ENG_FOG 0
#define ENG_LAVA 1
#define ENG_NEON 2
#define ENG_AURORA 3
#define ENG_SMOKE 4
#define ENG_GRAD2 5
#define ENG_GRAD3 6
#define ENG_GRAD4 7
#define ENG_MESH 8
#define ENG_LASERS 9
#define ENG_LINES 10
#define ENG_BLOCKS 11
#define ENG_SHAPES 12
#define ENG_INK 13

// ============================================================================
//  00_common.glsl  -  helpers: hash, noise, fbm, SDFs, shape metrics, palette
//  (The uniforms for every parameter + time/resolution are declared by the
//   FFGL quickstart framework and by tools/gen_shader.py - not here.)
// ============================================================================
#define PI  3.14159265359
#define TAU 6.28318530718

// ---- globals filled in main() ----------------------------------------------
vec3  gC0, gC1, gC2, gC3;   // active 4-color palette
int   gNCol;                // how many of those colors the engine uses (2/3/4)
float gT;                   // animated time (speed already applied on the CPU)
float gSeed;                // integer seed 0..9999
vec2  gSO;                  // seed -> noise-domain offset
float gDens, gSm, gBl, gWarp, gShift;
float gAsp;
float gOct, gGain;          // fbm octaves / gain (driven by Blur / Smoothness)
int   gShape;

// ---- hashes (Dave Hoskins) --------------------------------------------------
float hash11(float p){
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}
float hash12(vec2 p){
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p){
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
float hash13(vec3 p3){
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

mat2 rot2(float a){
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// ---- 3D value noise + fbm ---------------------------------------------------
float vnoise3(vec3 x){
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), f.x);
    float b = mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x);
    float c = mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x);
    float d = mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

// oct = number of (fractional) octaves; gain = amplitude falloff
float fbm3(vec3 p, float oct, float gain){
    float a = 0.5, s = 0.0, n = 0.0;
    mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 6; i++){
        float w = clamp(oct - float(i), 0.0, 1.0);
        s += a * w * vnoise3(p);
        n += a * w;
        p = vec3(R * p.xy, p.z) * 2.02 + vec3(11.7, 3.1, 1.7);
        a *= gain;
    }
    return s / max(n, 1e-4);
}
// global-parameter version: Blur removes octaves, Smoothness lowers the gain
float fbm(vec2 p, float z){
    return fbm3(vec3(p, z), gOct, gGain);
}

// ---- 2D SDFs (all roughly unit size, centred at the origin) -----------------
float sdCircle(vec2 p){ return length(p) - 0.9; }
float sdBox(vec2 p){
    vec2 d = abs(p) - vec2(0.78);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float sdTri(vec2 p){
    const float k = 1.7320508;
    float r = 0.95;
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
}
float sdHex(vec2 p){
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    float r = 0.8;
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
}
float sdStar(vec2 p){
    const vec2 k1 = vec2(0.809016994375, -0.587785252292);
    const vec2 k2 = vec2(-0.809016994375, -0.587785252292);
    float r = 0.95;
    float rf = 0.42;
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
float sdDiamond(vec2 p){
    return (abs(p.x) + abs(p.y)) * 0.70710678 - 0.80;
}
float sdCross(vec2 p){
    vec2 b = vec2(0.95, 0.30);
    p = abs(p);
    p = (p.y > p.x) ? p.yx : p.xy;
    vec2 q = p - b;
    float k = max(q.y, q.x);
    vec2 w = (k > 0.0) ? q : vec2(b.y - p.x, -k);
    return sign(k) * length(max(w, 0.0));
}
float sdRing(vec2 p){
    return abs(length(p) - 0.68) - 0.22;
}
float sdPill(vec2 p){
    vec2 q = vec2(p.x - clamp(p.x, -0.55, 0.55), p.y);
    return length(q) - 0.36;
}
float sdHeartRaw(vec2 p){
    p.x = abs(p.x);
    if (p.y + p.x > 1.0){
        vec2 d = p - vec2(0.25, 0.75);
        return sqrt(dot(d, d)) - 0.35355339;
    }
    vec2 a = p - vec2(0.0, 1.0);
    vec2 b = p - 0.5 * max(p.x + p.y, 0.0);
    return sqrt(min(dot(a, a), dot(b, b))) * sign(p.x - p.y);
}
float sdHeart(vec2 p){
    return sdHeartRaw(vec2(p.x, p.y + 0.55) * 0.95) / 0.95;
}

// Shape ids: 0 Circle 1 Square 2 Triangle 3 Hexagon 4 Star 5 Diamond 6 Cross
//            7 Ring 8 Pill 9 Heart   (10 Linear 11 Angular 12 Spiral 13 Wave:
//            only meaningful for the gradient / lines engines)
float shapeSD(vec2 p, int sh){
    if (sh >= 10) sh = (sh - 10) * 2 + 1;     // Linear/Angular/Spiral/Wave -> Square/Hex/Diamond/Ring
    if (sh == 0) return sdCircle(p);
    if (sh == 1) return sdBox(p);
    if (sh == 2) return sdTri(p);
    if (sh == 3) return sdHex(p);
    if (sh == 4) return sdStar(p);
    if (sh == 5) return sdDiamond(p);
    if (sh == 6) return sdCross(p);
    if (sh == 7) return sdRing(p);
    if (sh == 8) return sdPill(p);
    return sdHeart(p);
}

// A "distance-like" scalar field per shape. Used by gradient + line engines.
// ~0 at the centre and growing outwards (range roughly 0..2 across the screen).
float metric(vec2 p, int sh){
    if (sh == 10) return p.y * 0.5 + 1.0;                                     // Linear
    if (sh == 11) return (atan(p.y, p.x) / TAU + 0.5) * 2.0;                  // Angular
    if (sh == 12) return (atan(p.y, p.x) / TAU + 0.5 + length(p) * 0.35) * 2.0; // Spiral
    if (sh == 13) return (p.y * 0.5 + 1.0) + 0.22 * sin(p.x * 2.4 + gT * 0.6); // Wave
    return max(shapeSD(p, sh) + 0.9, 0.0) * 1.1;
}

// ---- palette ----------------------------------------------------------------
vec3 gcol(int i){
    i = i - (i / 4) * 4;
    if (i == 0) return gC0;
    if (i == 1) return gC1;
    if (i == 2) return gC2;
    return gC3;
}

// t is any real number; it is ping-ponged into 0..1 (so colour never "jumps"),
// ColorShift slides it along the palette, Smoothness < ~0.6 posterises it.
vec3 pal(float t){
    t = t + gShift;
    t = 1.0 - abs(fract(t * 0.5) * 2.0 - 1.0);

    float steps = 6.0;
    float s = t * steps;
    float f = fract(s);
    float w = mix(0.03, 0.5, gSm);
    f = smoothstep(0.5 - w, 0.5 + w, f);
    float tq = (floor(s) + f) / steps;
    t = mix(tq, t, smoothstep(0.55, 0.95, gSm));
    t = clamp(t, 0.0, 1.0);

    if (gNCol == 2) return mix(gC0, gC1, t);
    if (gNCol == 3){
        float x = t * 2.0;
        return mix(mix(gC0, gC1, clamp(x, 0.0, 1.0)), gC2, clamp(x - 1.0, 0.0, 1.0));
    }
    float x = t * 3.0;
    return mix(mix(mix(gC0, gC1, clamp(x, 0.0, 1.0)), gC2, clamp(x - 1.0, 0.0, 1.0)), gC3, clamp(x - 2.0, 0.0, 1.0));
}

const vec3 PRESETS[124] = vec3[124](
    vec3(0.1059,0.0431,0.2314), vec3(0.5569,0.1725,0.4275), vec3(0.9490,0.3333,0.4196), vec3(1.0000,0.7059,0.3608),  // Sunset
    vec3(0.0118,0.0706,0.1843), vec3(0.0431,0.3098,0.5412), vec3(0.1216,0.6353,0.7882), vec3(0.6078,0.9059,0.9490),  // Ocean
    vec3(0.0157,0.0706,0.1216), vec3(0.0431,0.4784,0.4588), vec3(0.2314,0.8902,0.6039), vec3(0.6275,0.4196,1.0000),  // Aurora
    vec3(0.0706,0.0000,0.1686), vec3(1.0000,0.1098,0.6588), vec3(0.0000,0.8980,1.0000), vec3(0.7137,1.0000,0.2314),  // Neon Club
    vec3(0.1020,0.0000,0.0000), vec3(0.5412,0.0588,0.0000), vec3(1.0000,0.2941,0.0392), vec3(1.0000,0.8235,0.2471),  // Lava Flow
    vec3(0.0118,0.1020,0.0431), vec3(0.0588,0.4196,0.1176), vec3(0.4902,1.0000,0.1216), vec3(0.9569,1.0000,0.4196),  // Toxic
    vec3(1.0000,0.7020,0.9020), vec3(0.7216,0.6314,1.0000), vec3(0.5608,0.8471,1.0000), vec3(1.0000,0.9451,0.9804),  // Cotton Candy
    vec3(0.0431,0.0078,0.1294), vec3(0.3569,0.1020,0.9020), vec3(1.0000,0.1804,0.5333), vec3(0.0980,0.8902,1.0000),  // Cyberpunk
    vec3(0.0235,0.1059,0.2000), vec3(0.1686,0.4353,0.6588), vec3(0.5490,0.7961,1.0000), vec3(0.9490,0.9843,1.0000),  // Ice
    vec3(0.0157,0.0824,0.0510), vec3(0.0510,0.2902,0.1686), vec3(0.2275,0.5608,0.2902), vec3(0.7882,0.8980,0.5412),  // Forest
    vec3(0.0706,0.0000,0.0000), vec3(0.7608,0.0941,0.0000), vec3(1.0000,0.4784,0.0000), vec3(1.0000,0.8784,0.4000),  // Fire
    vec3(0.0196,0.0000,0.0784), vec3(0.1647,0.0431,0.4510), vec3(0.5412,0.1686,0.8863), vec3(1.0000,0.4353,0.8471),  // Galaxy
    vec3(0.1686,0.0431,0.3608), vec3(1.0000,0.4157,0.8353), vec3(0.5804,0.8157,1.0000), vec3(1.0000,0.9529,0.6588),  // Vaporwave
    vec3(0.0196,0.0196,0.0196), vec3(0.2275,0.2275,0.2275), vec3(0.6039,0.6039,0.6039), vec3(1.0000,1.0000,1.0000),  // Mono
    vec3(0.1020,0.0627,0.0000), vec3(0.4784,0.2941,0.0000), vec3(0.8510,0.6353,0.1059), vec3(1.0000,0.9412,0.6510),  // Gold
    vec3(1.0000,0.3020,0.4275), vec3(1.0000,0.7176,0.0118), vec3(0.2980,0.7882,0.9412), vec3(0.4471,0.0353,0.7176),  // Candy
    vec3(0.0000,0.0157,0.0510), vec3(0.0000,0.1255,0.2471), vec3(0.0000,0.4275,0.4667), vec3(0.5137,0.7725,0.7451),  // Deep Sea
    vec3(0.0431,0.0000,0.0980), vec3(0.3529,0.0588,0.3020), vec3(0.8392,0.2275,0.2275), vec3(1.0000,0.7961,0.3608),  // Magma
    vec3(0.0196,0.1686,0.1686), vec3(0.1059,0.6000,0.5451), vec3(0.4980,0.8784,0.7686), vec3(0.9451,1.0000,0.9725),  // Mint
    vec3(0.1020,0.0196,0.1333), vec3(0.4196,0.1059,0.4196), vec3(0.8235,0.1882,0.4980), vec3(1.0000,0.6941,0.7843),  // Berry
    vec3(0.1686,0.0784,0.0353), vec3(0.5490,0.2902,0.1843), vec3(0.8510,0.5373,0.2941), vec3(0.9647,0.8392,0.6275),  // Desert
    vec3(0.0392,0.0392,0.1647), vec3(0.2392,0.1686,0.5490), vec3(0.7608,0.3529,0.6078), vec3(1.0000,0.7686,0.5412),  // Twilight
    vec3(0.0392,0.0392,0.0392), vec3(0.7137,1.0000,0.0000), vec3(1.0000,0.0000,0.8314), vec3(0.0000,0.9412,1.0000),  // Acid
    vec3(0.1647,0.0392,0.0941), vec3(0.5608,0.1647,0.3216), vec3(0.9098,0.4078,0.5412), vec3(1.0000,0.8392,0.8784),  // Rose
    vec3(0.0000,0.0745,0.0471), vec3(0.0000,0.4196,0.3059), vec3(0.0784,0.7686,0.5490), vec3(0.7647,1.0000,0.9098),  // Emerald
    vec3(0.0000,0.0235,0.1216), vec3(0.0000,0.1294,0.6588), vec3(0.1176,0.4196,1.0000), vec3(0.5608,0.9529,1.0000),  // Electric Blue
    vec3(0.0392,0.0000,0.1255), vec3(0.2941,0.0000,0.7098), vec3(0.6314,0.1725,1.0000), vec3(0.9412,0.6588,1.0000),  // Ultraviolet
    vec3(0.0510,0.0118,0.0000), vec3(0.3686,0.0824,0.0000), vec3(0.8784,0.2902,0.0000), vec3(1.0000,0.7020,0.4196),  // Ember
    vec3(1.0000,0.6039,0.5451), vec3(1.0000,0.7647,0.6275), vec3(1.0000,0.8667,0.7569), vec3(1.0000,0.9608,0.9137),  // Peach
    vec3(0.0000,0.0392,0.0078), vec3(0.0000,0.2314,0.0784), vec3(0.0000,0.7608,0.2275), vec3(0.7176,1.0000,0.7843),  // Matrix
    vec3(0.1216,0.0667,0.2784), vec3(1.0000,0.1647,0.4275), vec3(1.0000,0.7255,0.0000), vec3(0.0196,0.8510,0.9098)  // Retro 80s
);

// ============================================================================
//  10_engines.glsl  -  one function per engine. All take the aspect-corrected,
//  rotated + scaled domain p (screen height ~ -1..1 at Scale = 0.5) and
//  return linear-ish RGB. Parameters arrive through the g* globals.
// ============================================================================

vec2 warpField(vec2 p, float freq, float speed){
    float t = gT * speed;
    return vec2(fbm(p * freq + gSO, t), fbm(p * freq + gSO + vec2(7.3, 2.9), t + 4.0)) - 0.5;
}

// ---- FOG / NEVOA ------------------------------------------------------------
vec3 eng_fog(vec2 p){
    float t = gT * 0.10;
    vec2 q = p * 0.75 + gSO;
    vec2 w = vec2(fbm(q * 0.8 + vec2(0.0, t), t * 0.7),
                  fbm(q * 0.8 + vec2(5.2, 1.3), t * 0.7 + 3.0)) - 0.5;
    q += w * gWarp * 3.5;
    float f1 = fbm(q * 0.9, t);
    float f2 = fbm(q * 2.1 + vec2(7.0, 3.0), t * 1.3 + 9.0);
    float f  = mix(f1, f2, 0.35);

    float lo  = mix(0.72, 0.16, gDens);                 // Density = coverage
    float wid = mix(0.10, 0.65, gSm);
    float m   = smoothstep(lo, lo + wid, f);

    float tt = clamp(m * 0.80 + (f2 - 0.5) * 0.35 + 0.12, 0.0, 1.0);
    vec3 c   = pal(tt);
    return mix(gC0 * 0.25, c, smoothstep(0.0, 0.35, m + 0.15));
}

// ---- LAVA -------------------------------------------------------------------
vec3 eng_lava(vec2 p){
    float t = gT * 0.35;
    vec2 q = p + warpField(p, 0.9, 0.05) * gWarp * 1.4;

    int n = 3 + int(floor(gDens * 7.0));                // 3..10 blobs
    float field = 0.0;
    for (int i = 0; i < 10; i++){
        if (i >= n) break;
        float fi = float(i);
        vec2  h  = hash22(vec2(fi + 1.0, gSeed * 0.37 + 1.0));
        float h2 = hash11(fi * 7.13 + gSeed);
        vec2 c = vec2(sin(t * (0.25 + h.x * 0.45) + h.y * TAU) * 0.95 * gAsp,
                      sin(t * (0.20 + h.y * 0.40) + h.x * TAU + 1.7) * 0.95);
        float r = mix(0.20, 0.48, h2);
        vec2 d = q - c;
        field += r * r / (dot(d, d) + 1e-4);
    }
    float edge = mix(0.03, 1.1, gSm);
    float s = smoothstep(1.0 - edge, 1.0 + edge * 0.6, field);
    float k = 1.0 - exp(-field * 0.55);

    vec3 bg   = gC0 * 0.30;
    vec3 blob = pal(0.20 + 0.80 * k);
    vec3 col  = mix(bg, blob, s);
    // glow outside the blobs; Blur widens it
    float glow = smoothstep(0.0, 1.0, field) * (0.25 + gBl * 1.1) * (1.0 - s);
    col += pal(0.45) * glow * 0.55;
    return col;
}

// ---- NEON -------------------------------------------------------------------
vec3 eng_neon(vec2 p){
    float freq = mix(0.9, 4.2, gDens);
    vec2 q = p * freq;
    q += gWarp * 0.30 * vec2(sin(q.y * 1.7 + gT * 0.7 + gSO.x), cos(q.x * 1.5 + gT * 0.6 + gSO.y));
    vec2 id = floor(q);
    vec2 f  = fract(q) - 0.5;
    int sh = gShape;

    vec3 col = gC0 * 0.05;
    float w = mix(0.016, 0.07, gBl);
    float fill = mix(0.45, 0.95, gDens);

    for (int j = -1; j <= 1; j++){
        for (int i = -1; i <= 1; i++){
            vec2 o = vec2(float(i), float(j));
            vec2 cid = id + o;
            float h  = hash12(cid + gSeed * 1.7);
            float h2 = hash12(cid * 1.31 + 9.7 + gSeed);
            if (h > fill) continue;
            float r   = mix(0.18, 0.42, h2);
            float ang = (h - 0.5) * TAU + gT * (h2 - 0.5) * 0.7;
            vec2 pp = rot2(ang) * (f - o) / r;
            float d = shapeSD(pp, sh) * r;
            float ad = abs(d);
            float core = 1.0 - smoothstep(w * 0.5, w * 1.1, ad);
            float halo = pow(w / (ad + w), mix(1.8, 1.1, gBl));
            float pulse = 0.72 + 0.28 * sin(gT * (1.5 + 3.0 * h2) + h * TAU);
            vec3 c = pal(h * 0.9 + gT * 0.02);
            col += c * (halo * 1.15 + core * 1.1) * pulse;
            col += vec3(core * 0.35 * pulse);           // hot white-ish core
        }
    }
    return col;
}

// ---- AURORA -----------------------------------------------------------------
vec3 eng_aurora(vec2 p){
    float tt = gT * 0.25;
    vec3 col = mix(gC0 * 0.12, gC0 * 0.02, smoothstep(-1.0, 1.0, p.y));

    // sparse twinkling stars
    vec2 gq = (p + gSO) * 22.0;
    vec2 gi = floor(gq);
    vec2 gf = fract(gq) - 0.5;
    float s = hash12(gi + gSeed);
    vec2 so = (hash22(gi + gSeed * 1.3) - 0.5) * 0.6;
    float star = smoothstep(0.985, 1.0, s) * smoothstep(0.14, 0.0, length(gf - so));
    col += vec3(star) * (0.5 + 0.5 * sin(gT * 2.0 + s * 60.0));

    int n = 3 + int(floor(gDens * 5.0));                // 3..8 curtains
    float k = mix(40.0, 5.0, clamp(gBl * 0.6 + gSm * 0.4, 0.0, 1.0));
    for (int i = 0; i < 8; i++){
        if (i >= n) break;
        float fi = float(i);
        float h  = hash11(fi * 3.7 + gSeed);
        float xw = p.x * mix(0.5, 1.2, h) + fi * 3.1 + gSO.x * 0.05;
        float yc = (fi / float(n) - 0.5) * 0.9
                 + (fbm(vec2(xw * 0.8, fi * 1.9 + gSeed * 0.01), tt + fi * 0.7) - 0.5) * (0.6 + gWarp * 1.6);
        float streak = 0.55 + 0.45 * vnoise3(vec3(p.x * mix(6.0, 14.0, h) + fi * 5.0, p.y * 0.5, tt * 2.0));
        float dy = p.y - yc;
        float e = (dy > 0.0) ? exp(-dy * dy * k * 0.35) : exp(-dy * dy * k * 1.8);
        vec3 c = pal(fi / float(n) * 0.9 + 0.1 * streak + dy * 0.25);
        col += c * e * streak * mix(0.95, 0.55, float(n) / 8.0);
    }
    return col;
}

// ---- SMOKE / FUMACA ---------------------------------------------------------
vec3 eng_smoke(vec2 p){
    float t = gT * 0.12;
    vec2 q0 = p * 0.85 + gSO;
    q0.y -= gT * 0.10;                                   // rises
    vec2 q = vec2(fbm(q0, t), fbm(q0 + vec2(5.2, 1.3), t + 1.0));
    float wk = 1.0 + gWarp * 4.0;
    vec2 r = vec2(fbm(q0 + wk * q + vec2(1.7, 9.2), t * 1.3),
                  fbm(q0 + wk * q + vec2(8.3, 2.8), t * 1.1 + 2.0));
    float f = fbm(q0 + (0.6 + gWarp * 3.0) * r, t * 0.8);
    float ridge = 1.0 - abs(2.0 * f - 1.0);
    ridge = pow(ridge, mix(4.0, 1.5, gSm));              // wisps <-> soft cloud
    float m = mix(f, ridge, 0.5) * mix(0.65, 1.45, gDens);
    vec3 c = pal(clamp(m * 1.1 + 0.15 * length(r - 0.5), 0.0, 1.0));
    return mix(gC0 * 0.15, c, smoothstep(0.10, 0.60, m));
}

// ---- GRADIENT 2 / 3 / 4 colours --------------------------------------------
vec3 eng_grad(vec2 p){
    vec2 q = p + warpField(p, 0.8, 0.12) * gWarp * 2.2;
    float m = metric(q, gShape) * 0.5;
    float bands = mix(1.0, 9.0, gDens * gDens);
    // Angular / Spiral wrap around once per turn: the band count must be an even
    // integer or the ping-pong palette shows a seam along the negative x axis.
    if (gShape == 11 || gShape == 12) bands = max(2.0, 2.0 * floor(bands * 0.5 + 0.5));
    float t = m * bands - gT * 0.05;
    return pal(t);
}

// ---- MESH gradient (4 moving colour blobs) ---------------------------------
vec3 eng_mesh(vec2 p){
    float t = gT * 0.35;
    float pw = mix(5.0, 1.8, gSm) + 0.8;
    float spread = mix(0.5, 1.2, gDens);
    vec2 q = p + warpField(p, 0.9, 0.08) * gWarp * 1.6;
    int off = int(floor(gShift * 4.0));
    vec3 num = vec3(0.0);
    float den = 0.0;
    for (int i = 0; i < 4; i++){
        float fi = float(i);
        vec2 h = hash22(vec2(fi + 1.0, gSeed + 3.1));
        vec2 c = vec2(sin(t * (0.5 + h.x * 0.7) + h.y * TAU) * gAsp * spread,
                      cos(t * (0.4 + h.y * 0.6) + h.x * TAU) * spread);
        float d = length(q - c);
        float w = 1.0 / pow(d + 0.05, pw);
        num += gcol(i + off) * w;
        den += w;
    }
    return num / den;
}

// ---- LASERS -----------------------------------------------------------------
vec3 eng_lasers(vec2 p){
    vec3 col = gC0 * 0.04;
    int n = 2 + int(floor(gDens * 14.0));               // 2..16 beams
    float w = mix(0.008, 0.08, gBl);
    vec2 o = vec2(0.0, -1.15);
    vec2 d0 = p - o;
    float haze = 0.55 + 0.9 * fbm(p * 0.9 + gSO, gT * 0.15);
    float spread = mix(0.7, 2.0, gDens);
    for (int i = 0; i < 16; i++){
        if (i >= n) break;
        float fi = float(i);
        float h = hash11(fi * 5.31 + gSeed);
        float a = PI * 0.5 + (fi / float(max(n - 1, 1)) - 0.5) * spread
                + sin(gT * (0.4 + h * 0.9) + h * TAU) * mix(0.15, 0.6, clamp(gWarp + 0.2, 0.0, 1.0));
        vec2 dir = vec2(cos(a), sin(a));
        float along = dot(d0, dir);
        float perp  = abs(d0.x * dir.y - d0.y * dir.x);
        float wid   = w * (1.0 + max(along, 0.0) * 0.35);
        float beam  = pow(wid / (perp + wid), mix(3.0, 1.5, gSm));
        beam *= smoothstep(0.0, 0.3, along);
        beam *= 0.65 + 0.35 * sin(gT * 3.0 * h + fi);
        col += pal(h * 0.8 + fi * 0.07) * beam * haze * 1.5;
    }
    return col;
}

// ---- LINES ------------------------------------------------------------------
vec3 eng_lines(vec2 p){
    vec2 q = p + warpField(p, 0.7, 0.10) * gWarp * 2.0;
    float m = metric(q, gShape) * 0.5;
    float freq = mix(3.0, 40.0, gDens);
    if (gShape == 11 || gShape == 12) freq = floor(freq + 0.5);   // integer count -> no seam
    float x = m * freq - gT * 0.4;
    float id = floor(x);
    bool wrapAng = (gShape == 11 || gShape == 12);
    if (wrapAng) id = mod(id, freq);                              // keep per-line colour continuous over the seam
    float f = fract(x);
    float th = mix(0.12, 0.55, hash11(gSeed + 11.0));
    // fwidth spikes on the atan seam, so it is clamped
    float aa = max(mix(0.01, 0.5, gSm * gSm * 0.6 + gBl * 0.5), min(fwidth(x) * 1.2, 0.4));
    float lo = 0.5 - th * 0.5;
    float hi = 0.5 + th * 0.5;
    float line = smoothstep(lo - aa, lo, f) * (1.0 - smoothstep(hi, hi + aa, f));
    float h = hash11(id * 1.7 + gSeed);
    float cm = wrapAng ? abs(fract(m) * 2.0 - 1.0) : m;
    vec3 c = pal(mix(h, cm, 0.5));
    return mix(gC0 * 0.08, c, line * mix(0.6, 1.0, h));
}

// ---- BLOCKS -----------------------------------------------------------------
float hexDist(vec2 p){
    p = abs(p);
    float c = dot(p, normalize(vec2(1.0, 1.73)));
    return max(c, p.x);
}

vec3 eng_blocks(vec2 p){
    float cells = mix(2.0, 18.0, gDens);
    vec2 q = p * cells * 0.5;
    q += gWarp * 0.5 * vec2(sin(q.y * 0.8 + gT * 0.5), cos(q.x * 0.8 + gT * 0.4));

    vec2 id;
    float edge;
    if (gShape == 3){                                    // hexagon cells
        vec2 r = vec2(1.0, 1.73);
        vec2 h = r * 0.5;
        vec2 a = mod(q, r) - h;
        vec2 b = mod(q - h, r) - h;
        vec2 gv = (dot(a, a) < dot(b, b)) ? a : b;
        id = q - gv;
        edge = 0.5 - hexDist(gv);
    } else {
        id = floor(q);
        vec2 f = fract(q) - 0.5;
        edge = 0.5 - max(abs(f.x), abs(f.y));
    }

    float k  = hash12(id + gSeed);
    float ph = gT * 0.35 + k * 10.0;
    float h0 = hash12(id + floor(ph) * 7.13 + gSeed);
    float h1 = hash12(id + (floor(ph) + 1.0) * 7.13 + gSeed);
    float fr = clamp(fract(ph) * mix(4.0, 1.0, gSm), 0.0, 1.0);
    float h  = mix(h0, h1, smoothstep(0.0, 1.0, fr));
    float coh = fbm(id * 0.18 + gSO, gT * 0.1);
    float v = mix(h, coh, 0.45);

    float gap = mix(0.0, 0.12, hash11(gSeed + 5.0));
    float fw = fwidth(edge) * 1.2 + mix(0.0, 0.2, gBl);
    float mask = smoothstep(gap, gap + fw + 1e-4, edge);
    vec3 c = pal(v) * (0.85 + 0.3 * smoothstep(0.0, 0.5, edge));
    return mix(gC0 * 0.05, c, mask);
}

// ---- SHAPES -----------------------------------------------------------------
vec3 eng_shapes(vec2 p){
    vec3 col = gC0 * 0.12;
    int sh = gShape;
    float fillT = mix(0.45, 0.9, gDens);
    for (int L = 0; L < 3; L++){
        float fl = float(L);
        float freq = mix(1.0, 5.0, gDens) * (1.0 + fl * 0.55);
        float dirx = (L == 1) ? -1.0 : 1.0;
        vec2 q = p * freq * 0.6 + vec2(fl * 17.3, fl * 5.1)
               + vec2(gT * 0.05 * (1.0 + fl) * dirx, gT * 0.03 * (fl + 1.0));
        vec2 id = floor(q);
        vec2 f  = fract(q) - 0.5;
        for (int j = -1; j <= 1; j++){
            for (int i = -1; i <= 1; i++){
                vec2 o = vec2(float(i), float(j));
                vec2 cid = id + o;
                float h  = hash12(cid + fl * 31.7 + gSeed);
                float h2 = hash12(cid * 1.37 + 5.5 + gSeed + fl);
                if (h > fillT) continue;
                float r = mix(0.12, 0.40, h2) * (1.0 + 0.15 * sin(gT * (0.8 + h) + h * TAU));
                float ang = (h - 0.5) * TAU + gT * (h2 - 0.5) * 0.8;
                vec2 wander = 0.15 * vec2(sin(gT * 0.5 + h * TAU), cos(gT * 0.4 + h2 * TAU));
                vec2 pp = rot2(ang) * ((f - o) - wander) / r;
                float d = shapeSD(pp, sh) * r;
                float soft = (mix(0.002, 0.35, gSm * gSm) + mix(0.0, 0.25, gBl)) * r + 1e-4;
                float a = 1.0 - smoothstep(-soft, soft, d);
                vec3 c = pal(h2 * 0.7 + fl * 0.15 + 0.1 * sin(gT * 0.3 + h * TAU)) * (0.7 + 0.3 * h);
                col = mix(col, c, a * mix(0.55, 1.0, h));
            }
        }
    }
    return col;
}

// ---- INK IN WATER / TINTA NA AGUA ------------------------------------------
vec3 eng_ink(vec2 p){
    vec3 col = mix(gC0 * 0.12, gC0 * 0.30, fbm(p * 0.6 + gSO, gT * 0.05));
    int n = 2 + int(floor(gDens * 3.0));                // 2..5 drops
    for (int i = 0; i < 5; i++){
        if (i >= n) break;
        float fi = float(i);
        float rate = 0.05 + hash11(fi * 3.3 + gSeed) * 0.03;
        float tt = gT * rate + fi * 0.37;
        float cyc = floor(tt);
        float age = fract(tt);
        vec2 pos = (hash22(vec2(fi * 11.0 + cyc * 3.7, gSeed * 0.13 + cyc)) - 0.5) * vec2(1.8 * gAsp, 1.4);
        vec2 d = p - pos;
        float rr = length(d);
        float sw = gWarp * 3.0 * age * exp(-rr * 1.2);
        d = rot2(sw) * d;
        float nz = fbm(d * 2.2 + vec2(fi * 7.0 + cyc * 13.0, gSeed * 0.01), age * 1.5) - 0.5;
        float R = (0.12 + 1.05 * pow(age, 0.55)) * mix(0.55, 1.15, gDens);
        float edge = R + nz * R * mix(0.5, 1.6, clamp(gWarp + 0.3, 0.0, 1.0));
        float soft = mix(0.02, 0.35, gSm) * R + gBl * 0.4 * R + 1e-4;
        float m = smoothstep(edge + soft, edge - soft, rr);
        float life = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.55, 1.0, age));
        float inner = fbm(d * 4.0 + vec2(sw * 2.0, fi * 3.0), age * 2.5);
        float k = clamp(0.25 + m * 0.55 + (inner - 0.5) * 0.9 + age * 0.15, 0.0, 1.0);
        vec3 ink = pal(k + fi * 0.17) * (0.7 + 0.5 * inner);
        col = mix(col, ink, m * life * 0.92);
    }
    return col;
}

// ============================================================================
//  90_main.glsl  -  parameter decoding, engine dispatch, final grading
// ============================================================================
void main(){
    int eng = int(Engine + 0.5);
    int pIdx = int(Palette + 0.5);

    gShape = int(Shape + 0.5);
    gAsp   = resolution.x / max(resolution.y, 1.0);
    gT     = animTime;
    gSeed  = floor(Seed * 9999.0 + 0.5);
    gSO    = vec2(hash11(gSeed * 1.13 + 0.5), hash11(gSeed * 2.71 + 3.0)) * 80.0;
    gDens  = Density;
    gSm    = Smoothness;
    gBl    = Blur;
    gWarp  = Warp;
    gShift = ColorShift;
    gOct   = mix(5.5, 1.3, gBl);
    gGain  = mix(0.62, 0.34, gSm);

    if (pIdx <= 0){
        gC0 = Color1.rgb; gC1 = Color2.rgb; gC2 = Color3.rgb; gC3 = Color4.rgb;
    } else {
        int b = (pIdx - 1) * 4;
        gC0 = PRESETS[b]; gC1 = PRESETS[b + 1]; gC2 = PRESETS[b + 2]; gC3 = PRESETS[b + 3];
    }
    gNCol = 4;
    if (eng == ENG_GRAD2) gNCol = 2;
    else if (eng == ENG_GRAD3) gNCol = 3;

    vec2 p = (i_uv - 0.5) * vec2(gAsp, 1.0) * 2.0;
    p = rot2(Rotation * TAU) * p;
    p /= exp2(mix(-1.5, 1.5, Scale));

    vec3 col;
    if      (eng == ENG_FOG)    col = eng_fog(p);
    else if (eng == ENG_LAVA)   col = eng_lava(p);
    else if (eng == ENG_NEON)   col = eng_neon(p);
    else if (eng == ENG_AURORA) col = eng_aurora(p);
    else if (eng == ENG_SMOKE)  col = eng_smoke(p);
    else if (eng == ENG_GRAD2 || eng == ENG_GRAD3 || eng == ENG_GRAD4) col = eng_grad(p);
    else if (eng == ENG_MESH)   col = eng_mesh(p);
    else if (eng == ENG_LASERS) col = eng_lasers(p);
    else if (eng == ENG_LINES)  col = eng_lines(p);
    else if (eng == ENG_BLOCKS) col = eng_blocks(p);
    else if (eng == ENG_SHAPES) col = eng_shapes(p);
    else                        col = eng_ink(p);

    // ---- final grade ----
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, mix(0.0, 2.0, Saturation));
    col = (col - 0.5) * mix(0.4, 1.6, Contrast) + 0.5;
    col *= mix(0.0, 2.0, Brightness);
    float beat = pow(1.0 - fract(phase * 4.0), 3.0);
    col *= 1.0 + Pulse * 0.8 * beat;
    if (Invert) col = 1.0 - col;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
