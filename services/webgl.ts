
import { VERTEX_SHADER, FRAGMENT_SHADER, BLOOM_VERTEX_SHADER, BLOOM_FRAGMENT_SHADER } from './shaders';

export class WebGLRenderer {
  gl: WebGLRenderingContext | null = null;

  // Programs
  mainProgram: WebGLProgram | null = null;
  bloomProgram: WebGLProgram | null = null;

  // Buffers
  positionBuffer: WebGLBuffer | null = null;

  // Textures
  gameTexture: WebGLTexture | null = null;
  distortionTexture: WebGLTexture | null = null;

  // FBOs for Bloom
  bloomFBOs: WebGLFramebuffer[] = [];
  bloomTextures: WebGLTexture[] = []; // 0: Ping, 1: Pong

  // Locations
  mainLocs: any = {};
  bloomLocs: any = {};

  init(canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext('webgl', { alpha: false, preserveDrawingBuffer: false });
    if (!this.gl) return;

    const gl = this.gl;

    // --- SHADER SETUP ---
    const vs = this.createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const bvs = this.createShader(gl, gl.VERTEX_SHADER, BLOOM_VERTEX_SHADER);
    const bfs = this.createShader(gl, gl.FRAGMENT_SHADER, BLOOM_FRAGMENT_SHADER);

    if (!vs || !fs || !bvs || !bfs) return;

    this.mainProgram = this.createProgram(gl, vs, fs);
    this.bloomProgram = this.createProgram(gl, bvs, bfs);
    
    if (!this.mainProgram || !this.bloomProgram) return;

    // --- LOCATIONS ---

    // Main Program
    gl.useProgram(this.mainProgram);
    this.mainLocs = {
      position: gl.getAttribLocation(this.mainProgram, 'position'),
      uGameTexture: gl.getUniformLocation(this.mainProgram, 'uGameTexture'),
      uDistortionTexture: gl.getUniformLocation(this.mainProgram, 'uDistortionTexture'),
      uBloomTexture: gl.getUniformLocation(this.mainProgram, 'uBloomTexture'),
      uTime: gl.getUniformLocation(this.mainProgram, 'uTime'),
      uGlitchIntensity: gl.getUniformLocation(this.mainProgram, 'uGlitchIntensity'),
      uAberration: gl.getUniformLocation(this.mainProgram, 'uAberration'),
      uDamage: gl.getUniformLocation(this.mainProgram, 'uDamage'),
      uResolution: gl.getUniformLocation(this.mainProgram, 'uResolution'),
    };

    // Bloom Program
    gl.useProgram(this.bloomProgram);
    this.bloomLocs = {
        position: gl.getAttribLocation(this.bloomProgram, 'position'),
        uTexture: gl.getUniformLocation(this.bloomProgram, 'uTexture'),
        uResolution: gl.getUniformLocation(this.bloomProgram, 'uResolution'),
        uDirection: gl.getUniformLocation(this.bloomProgram, 'uDirection')
    };

    // --- BUFFERS ---
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

    // --- TEXTURES ---
    this.gameTexture = this.createTexture(gl);
    this.distortionTexture = this.createTexture(gl);

    // --- BLOOM FBOs (Ping Pong) ---
    // Downscale bloom for performance and glow size (1/4 size)
    const bloomW = canvas.width / 4;
    const bloomH = canvas.height / 4;

    for(let i=0; i<2; i++) {
        const tex = this.createTexture(gl, bloomW, bloomH);
        this.bloomTextures.push(tex!);

        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        this.bloomFBOs.push(fbo!);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  createShader(gl: WebGLRenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  createProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader) {
    const p = gl.createProgram();
    if (!p) return null;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    return p;
  }

  createTexture(gl: WebGLRenderingContext, w?: number, h?: number) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (w && h) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    return tex;
  }

  render(gameCanvas: HTMLCanvasElement, distortionCanvas: HTMLCanvasElement, time: number, glitch: number, aberration: number, damage: number) {
    if (!this.gl || !this.mainProgram || !this.bloomProgram) return;
    const gl = this.gl;

    // --- STEP 1: UPLOAD TEXTURES ---

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.gameTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gameCanvas);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.distortionTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, distortionCanvas);

    // --- STEP 2: BLOOM PASS (Gaussian Blur Ping Pong) ---
    // Pass 1: Horizontal Blur (GameTex -> FBO 0)
    // Actually, we first need to copy the GameTex to FBO 0 (acting as Pre-Filter/Downsample)
    // For simplicity, we assume the GameTex is already thresholded or we blur the whole thing (Glowy style)

    gl.useProgram(this.bloomProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.bloomLocs.position);
    gl.vertexAttribPointer(this.bloomLocs.position, 2, gl.FLOAT, false, 0, 0);

    const bloomW = gl.canvas.width / 4;
    const bloomH = gl.canvas.height / 4;
    gl.viewport(0, 0, bloomW, bloomH);

    // Iteration 1: Horizontal from GameTex -> FBO 0
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBOs[0]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.gameTexture); // Source
    gl.uniform1i(this.bloomLocs.uTexture, 0);
    gl.uniform2f(this.bloomLocs.uResolution, bloomW, bloomH);
    gl.uniform2f(this.bloomLocs.uDirection, 1.0, 0.0); // Horizontal
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Iteration 2: Vertical from FBO 0 -> FBO 1
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBOs[1]);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTextures[0]); // Source
    gl.uniform2f(this.bloomLocs.uDirection, 0.0, 1.0); // Vertical
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Iteration 3: Horizontal from FBO 1 -> FBO 0 (More blur)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBOs[0]);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTextures[1]);
    gl.uniform2f(this.bloomLocs.uDirection, 1.0, 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Iteration 4: Vertical from FBO 0 -> FBO 1 (Final Result in FBO 1)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBOs[1]);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTextures[0]);
    gl.uniform2f(this.bloomLocs.uDirection, 0.0, 1.0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // --- STEP 3: COMPOSITE PASS ---

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Screen
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(this.mainProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.mainLocs.position);
    gl.vertexAttribPointer(this.mainLocs.position, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.gameTexture);
    gl.uniform1i(this.mainLocs.uGameTexture, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.distortionTexture);
    gl.uniform1i(this.mainLocs.uDistortionTexture, 1);

    // Bind Bloom Result (FBO 1)
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTextures[1]);
    gl.uniform1i(this.mainLocs.uBloomTexture, 2);

    gl.uniform1f(this.mainLocs.uTime, time);
    gl.uniform1f(this.mainLocs.uGlitchIntensity, glitch);
    gl.uniform1f(this.mainLocs.uAberration, aberration);
    gl.uniform1f(this.mainLocs.uDamage, damage);
    gl.uniform2f(this.mainLocs.uResolution, gl.canvas.width, gl.canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
