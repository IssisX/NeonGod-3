
import { VERTEX_SHADER, FRAGMENT_SHADER } from './shaders';

export class WebGLRenderer {
  gl: WebGLRenderingContext | null = null;
  program: WebGLProgram | null = null;
  positionBuffer: WebGLBuffer | null = null;
  gameTexture: WebGLTexture | null = null;
  distortionTexture: WebGLTexture | null = null;
  locs: any = {};

  init(canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext('webgl', { alpha: false, preserveDrawingBuffer: false });
    if (!this.gl) return;

    const gl = this.gl;
    const vs = this.createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;
    
    this.program = this.createProgram(gl, vs, fs);
    if (!this.program) return;

    gl.useProgram(this.program);

    this.locs = {
      position: gl.getAttribLocation(this.program, 'position'),
      uGameTexture: gl.getUniformLocation(this.program, 'uGameTexture'),
      uDistortionTexture: gl.getUniformLocation(this.program, 'uDistortionTexture'),
      uTime: gl.getUniformLocation(this.program, 'uTime'),
      uGlitchIntensity: gl.getUniformLocation(this.program, 'uGlitchIntensity'),
      uAberration: gl.getUniformLocation(this.program, 'uAberration'),
      uDamage: gl.getUniformLocation(this.program, 'uDamage'),
      uResolution: gl.getUniformLocation(this.program, 'uResolution'),
    };

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

    this.gameTexture = this.createTexture(gl);
    this.distortionTexture = this.createTexture(gl);
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

  createTexture(gl: WebGLRenderingContext) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  render(gameCanvas: HTMLCanvasElement, distortionCanvas: HTMLCanvasElement, time: number, glitch: number, aberration: number, damage: number) {
    if (!this.gl || !this.program) return;
    const gl = this.gl;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.locs.position);
    gl.vertexAttribPointer(this.locs.position, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.gameTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gameCanvas);
    gl.uniform1i(this.locs.uGameTexture, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.distortionTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, distortionCanvas);
    gl.uniform1i(this.locs.uDistortionTexture, 1);

    gl.uniform1f(this.locs.uTime, time);
    gl.uniform1f(this.locs.uGlitchIntensity, glitch);
    gl.uniform1f(this.locs.uAberration, aberration);
    gl.uniform1f(this.locs.uDamage, damage);
    gl.uniform2f(this.locs.uResolution, gl.canvas.width, gl.canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
