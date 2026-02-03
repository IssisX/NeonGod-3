
export const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y; 
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
    
    // 3. GRAVITY LENS (Pincushion/Swirl)
    // We ideally need the center of the gravity well, but since we are using a texture map,
    // we simulate "pull" by using the texture gradient or just noise.
    // Better: The Green channel represents "intensity of pull". We can warp UVs based on local gradient?
    // Simplified: Just use noise but pulling inward or twisting.
    vec2 gravityOffset = vec2(sin(uv.y * 50.0 + uTime * 10.0), cos(uv.x * 50.0 + uTime)) * 0.02 * gravityStrength;

    uv += heatOffset + gravityOffset;

    // 4. GLITCH ARTIFACTS (Screen Tearing / Block Displacement)
    if (uGlitchIntensity > 0.0) {
        // Horizontal strips
        float strip = floor(uv.y * 20.0 + uTime * 50.0);
        float stripNoise = rand(vec2(strip, floor(uTime * 20.0)));
        
        if (stripNoise < 0.1 * uGlitchIntensity) {
            uv.x += (rand(vec2(uTime, strip)) - 0.5) * 0.2 * uGlitchIntensity;
            // RGB Split inside the glitch strip
            uv.x += 0.01 * uGlitchIntensity; 
        }
        
        // Vertical Jitter
        uv.y += (rand(vec2(uTime * 10.0, 0.0)) - 0.5) * 0.01 * uGlitchIntensity;
    }

    // 5. CHROMATIC ABERRATION
    vec2 center = vec2(0.5);
    vec2 distToCenter = uv - center;
    float distLen = length(distToCenter);
    
    // Total Aberration = Base + Distortion + Glitch + Damage
    float totalAberration = (uAberration * 0.01) 
                          + (heatStrength * 0.02) 
                          + (gravityStrength * 0.05)
                          + (uGlitchIntensity * 0.03)
                          + (uDamage * 0.02 * sin(uTime * 20.0));
                          
    // Radial Falloff for aberration (stronger at edges)
    totalAberration *= (1.0 + distLen);

    vec2 rUV = uv - distToCenter * totalAberration;
    vec2 bUV = uv + distToCenter * totalAberration;

    float r = texture2D(uGameTexture, rUV).r;
    float g = texture2D(uGameTexture, uv).g;
    float b = texture2D(uGameTexture, bUV).b;

    // 6. SCANLINES
    float scanline = sin(uv.y * uResolution.y * 0.8) * 0.04;
    vec3 color = vec3(r, g, b) - scanline;

    // 7. VIGNETTE
    float vignette = smoothstep(1.5, 0.4, distLen); // Inverse logic
    color *= vignette;

    // 8. DAMAGE OVERLAY (Red Pulse)
    if (uDamage > 0.0) {
        float pulse = sin(uTime * 10.0) * 0.5 + 0.5;
        float edge = smoothstep(0.3, 0.8, distLen);
        vec3 dmgColor = vec3(0.8, 0.0, 0.0) * uDamage * edge * pulse;
        color += dmgColor;
    }
    
    // 9. GAMMA / TONE
    color = pow(color, vec3(0.9)); // Slight gamma lift
    color *= 1.15; // Contrast boost

    gl_FragColor = vec4(color, 1.0);
}
`;
