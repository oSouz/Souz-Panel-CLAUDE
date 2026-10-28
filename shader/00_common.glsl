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

//@PALETTES@
