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
