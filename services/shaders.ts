
export const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y; 
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const BLOOM_VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  // No Y-flip for FBO textures typically needed if consistent
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const BLOOM_FRAGMENT_SHADER = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform vec2 uDirection;

// Gaussian Weights for 9-tap filter
// 0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216
void main() {
    vec4 color = texture2D(uTexture, vUv) * 0.227027;
    vec2 off1 = vec2(1.3846153846) * uDirection;
    vec2 off2 = vec2(3.2307692308) * uDirection;

    color += texture2D(uTexture, vUv + (off1 / uResolution)) * 0.3162162162;
    color += texture2D(uTexture, vUv - (off1 / uResolution)) * 0.3162162162;
    color += texture2D(uTexture, vUv + (off2 / uResolution)) * 0.0702702703;
    color += texture2D(uTexture, vUv - (off2 / uResolution)) * 0.0702702703;

    gl_FragColor = color;
}
`;

export const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;

uniform sampler2D uGameTexture;
uniform sampler2D uDistortionTexture;
uniform sampler2D uBloomTexture; // NEW: Bloom result
uniform float uTime;
uniform float uGlitchIntensity;
uniform float uAberration;
uniform float uDamage; 
uniform vec2 uResolution;

// Simplex Noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ; m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
    vec2 uv = vUv;
    
    // 1. DISTORTION MAP SAMPLING
    vec4 distMap = texture2D(uDistortionTexture, uv);
    float heatStrength = distMap.r; // Red channel: Heat/Expansion
    float gravityStrength = distMap.g; // Green channel: Gravity/Implosion
    
    // 2. HEAT HAZE (Turbulent Noise)
    float noise = snoise(uv * 20.0 + vec2(0.0, uTime * 3.0));
    vec2 heatOffset = vec2(noise * 0.005, noise * 0.01) * heatStrength;
    
    vec2 gravityOffset = vec2(sin(uv.y * 50.0 + uTime * 10.0), cos(uv.x * 50.0 + uTime)) * 0.02 * gravityStrength;

    uv += heatOffset + gravityOffset;

    // 4. GLITCH ARTIFACTS
    if (uGlitchIntensity > 0.0) {
        float strip = floor(uv.y * 20.0 + uTime * 50.0);
        float stripNoise = rand(vec2(strip, floor(uTime * 20.0)));
        if (stripNoise < 0.1 * uGlitchIntensity) {
            uv.x += (rand(vec2(uTime, strip)) - 0.5) * 0.2 * uGlitchIntensity;
            uv.x += 0.01 * uGlitchIntensity; 
        }
        uv.y += (rand(vec2(uTime * 10.0, 0.0)) - 0.5) * 0.01 * uGlitchIntensity;
    }

    // 5. CHROMATIC ABERRATION
    vec2 center = vec2(0.5);
    vec2 distToCenter = uv - center;
    float distLen = length(distToCenter);
    
    float totalAberration = (uAberration * 0.01) 
                          + (heatStrength * 0.02) 
                          + (gravityStrength * 0.05)
                          + (uGlitchIntensity * 0.03)
                          + (uDamage * 0.02 * sin(uTime * 20.0));
                          
    totalAberration *= (1.0 + distLen);

    vec2 rUV = uv - distToCenter * totalAberration;
    vec2 bUV = uv + distToCenter * totalAberration;

    float r = texture2D(uGameTexture, rUV).r;
    float g = texture2D(uGameTexture, uv).g;
    float b = texture2D(uGameTexture, bUV).b;

    vec3 color = vec3(r, g, b);

    // 6. BLOOM COMPOSITE (Additive)
    // Bloom texture doesn't need chromatic aberration usually
    vec3 bloom = texture2D(uBloomTexture, vUv).rgb;
    color += bloom * 1.5; // Boost bloom intensity

    // 7. SCANLINES
    float scanline = sin(uv.y * uResolution.y * 0.8) * 0.04;
    color -= scanline;

    // 8. VIGNETTE
    float vignette = smoothstep(1.5, 0.4, distLen);
    color *= vignette;

    // 9. DAMAGE OVERLAY
    if (uDamage > 0.0) {
        float pulse = sin(uTime * 10.0) * 0.5 + 0.5;
        float edge = smoothstep(0.3, 0.8, distLen);
        vec3 dmgColor = vec3(0.8, 0.0, 0.0) * uDamage * edge * pulse;
        color += dmgColor;
    }
    
    // 10. GAMMA / TONE
    color = pow(color, vec3(0.9));
    color *= 1.15;

    gl_FragColor = vec4(color, 1.0);
}
`;
