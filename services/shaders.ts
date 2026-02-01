
export const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y; // FLIP Y: Fixes inverted rendering (Canvas Top-Left 0,0 maps to Screen Top-Left)
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;

uniform sampler2D uGameTexture;
uniform sampler2D uDistortionTexture;
uniform float uTime;
uniform float uGlitchIntensity;
uniform float uAberration;
uniform float uDamage; // 0.0 to 1.0 (Low HP = High Value)
uniform vec2 uResolution;

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
    vec2 uv = vUv;
    
    // Distortion
    vec4 distMap = texture2D(uDistortionTexture, uv);
    float distortionStrength = distMap.r;
    
    // Anomaly Shake
    vec2 distOffset = vec2(
        (rand(uv + uTime) - 0.5) * 0.02, 
        (rand(uv - uTime) - 0.5) * 0.02
    ) * distortionStrength;
    
    uv += distOffset;

    // Glitch Slicing
    if (uGlitchIntensity > 0.0) {
        float sliceY = floor(uv.y * 10.0 + uTime * 2.0);
        float sliceOffset = (rand(vec2(sliceY, uTime)) - 0.5) * 0.1 * uGlitchIntensity;
        if (rand(vec2(uv.y, uTime)) > 0.95) {
            uv.x += sliceOffset;
        }
    }

    // Chromatic Aberration (Increases with Damage)
    vec2 center = vec2(0.5);
    vec2 distToCenter = uv - center;
    float distLen = length(distToCenter);
    
    // Base aberration + Damage bonus + Glitch bonus
    float aber = (uAberration * 0.02) + (distortionStrength * 0.03) + (distLen * 0.01) + (uDamage * 0.02 * sin(uTime * 10.0));
    
    vec2 rUV = uv - distToCenter * aber;
    vec2 bUV = uv + distToCenter * aber;
    
    float r = texture2D(uGameTexture, rUV).r;
    float g = texture2D(uGameTexture, uv).g;
    float b = texture2D(uGameTexture, bUV).b;

    vec3 color = vec3(r, g, b);

    // Scanlines
    float scanline = sin(uv.y * uResolution.y * 0.5) * 0.04;
    color -= scanline;
    
    // Vignette
    float vignette = 1.0 - smoothstep(0.5, 1.5, distLen);
    color *= vignette;

    // Damage Overlay (Red Pulsing Vignette)
    if (uDamage > 0.2) {
        float pulse = (sin(uTime * 8.0) * 0.5 + 0.5);
        float damageVignette = smoothstep(0.4, 1.0, distLen) * uDamage * pulse * 0.8;
        color.r += damageVignette;
        color.gb -= damageVignette * 0.5; // Desaturate others
    }

    // Tone map / Brightness
    color = pow(color, vec3(0.9)); 
    color *= 1.1;

    gl_FragColor = vec4(color, 1.0);
}
`;
