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
