import {
  WebGLRenderTarget,
  ClampToEdgeWrapping,
  LinearFilter,
  RGBAFormat,
  RawShaderMaterial,
  RepeatWrapping,
  Vector2,
  Vector4,
  TextureLoader,
  GLSL3,
  Color,
  UnsignedByteType,
  HalfFloatType,
  OrthographicCamera,
  Scene,
  Mesh,
  PlaneGeometry,
} from "three";

import orthoVertexShader from "../shaders/ortho.js";
import vignette from "../shaders/vignette.js";
import overlay from "../shaders/overlay.js";
import softLight from "../shaders/soft-light.js";
import lighten from "../shaders/lighten.js";
import { ShaderPass } from "../modules/shader-pass.js";
import { ShaderPingPongPass } from "../modules/shader-ping-pong-pass.js";
import {
  updateProjectionMatrixJitter,
  incPointer,
  resetPointer,
} from "./jitter.js";
import { effect } from "./reactive.js";
import { registerActivePainted, shadowMapTexture, paperColor, embossAngle, embossEdge, embossStrength, paperStrength, bumpSize, bumpShadow, shadowStrength, showShadowBuffer } from "./three-meshline.js";
import { AdaptivePassTimer } from "./gpu-timer.js";
import { renderer } from "./three.js";

const fragmentShader = `
precision highp float;

uniform vec2 resolution;
// Everything this pass measures in pixels -- the emboss edge, the bump shadow's offset and the
// paper grain -- is in CSS pixels, scaled by this to the device pixels the buffers are in, so
// a 2x display shows the same drawing as the 1x one it was tuned on rather than one with half
// the emboss, half the shadow offset and paper grain at half size.
uniform float pixelRatio;

uniform sampler2D inputTexture;
uniform float vignetteBoost;
uniform float vignetteReduction;
uniform sampler2D paperTexture;
uniform float embossAngle;
uniform float embossEdge;
uniform float embossStrength;
uniform float paperStrength;
uniform float bumpSize;
uniform float bumpShadow;
uniform float shadowStrength;

in vec2 vUv;

out vec4 fragColor;

${vignette}
${overlay}
${softLight}
${lighten}

float gradientNoise(in vec2 uv) {
	return fract(52.9829189 * fract(dot(uv, vec2(0.06711056, 0.00583715))));
}

vec4 calcNormal(in sampler2D map, in vec2 uv) {
  vec4 i = texture(map, uv);
  float s11 = i.a;

  const vec2 size = vec2(1.,0.0);
  // One CSS pixel; at 1x exactly the neighbouring texel, as textureOffset sampled it.
  vec2 px = pixelRatio / vec2(textureSize(map, 0));

  float s01 = texture(map, uv - vec2(px.x, 0.)).a;
  float s21 = texture(map, uv + vec2(px.x, 0.)).a;
  float s10 = texture(map, uv - vec2(0., px.y)).a;
  float s12 = texture(map, uv + vec2(0., px.y)).a;
  vec3 va = normalize(vec3(size.xy,s21-s01));
  vec3 vb = normalize(vec3(size.yx,s12-s10));
  vec4 bump = vec4( cross(va,vb), s11 );

  return bump;
}

float luma(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

float luma(vec4 color) {
  return luma(color.rgb);
}
  
vec4 calcNormalRGB(in sampler2D map, in vec2 uv) {
  vec4 i = texture(map, uv);
  float s11 = luma(i);

  const vec2 size = vec2(1.,0.0);
  const ivec3 off = ivec3(-1,0,1);

  float s01 = luma(textureOffset(map, uv, off.xy));
  float s21 = luma(textureOffset(map, uv, off.zy));
  float s10 = luma(textureOffset(map, uv, off.yx));
  float s12 = luma(textureOffset(map, uv, off.yz));
  vec3 va = normalize(vec3(size.xy,s21-s01));
  vec3 vb = normalize(vec3(size.yx,s12-s10));
  vec4 bump = vec4( cross(va,vb), s11 );

  return bump;
}
  
void main() {
  vec4 color = texture(inputTexture, vUv);

  vec2 paperUv = gl_FragCoord.xy / (pixelRatio * vec2(textureSize(paperTexture, 0).xy));
  vec4 paper = texture(paperTexture, paperUv);

  // paperStrength scales how much the paper texture contributes to the bump normal.
  vec4 normal = calcNormal(inputTexture, vUv) + calcNormalRGB(paperTexture, paperUv) * paperStrength;

  vec3 dir = normalize(vec3(cos(embossAngle), sin(embossAngle), 0.));
  float l = dot(normal.rgb, dir);
  l = .5 + .5 * l;
  l = smoothstep(.5 - embossEdge, .5 + embossEdge, l);

  vec2 bumpDir = vec2(cos(embossAngle), sin(embossAngle));
  vec2 offset = bumpDir * bumpSize * pixelRatio / resolution.xy;
  vec4 shadowSample = texture(inputTexture, vUv + offset);
  vec3 shadowColor = mix(vec3(bumpShadow), vec3(1.0), 1. - shadowSample.a);
  shadowColor = mix(shadowColor, vec3(1.), color.a);

  color = vec4(color.rgb, 1.);

  // Shadow blended independently of paper.
  color.rgb = mix(color.rgb, color.rgb * shadowColor, shadowStrength);

  color = softLight(color, vec4(vec3(vignette(vUv, vignetteBoost, vignetteReduction)),1.));
  color += (1. / 255.) * gradientNoise(gl_FragCoord.xy) - (.5 / 255.);

  color = overlay(color, vec4(l), embossStrength);
  color = lighten(color, vec4((l - .5) * embossStrength));

  // Opaque: this is drawn straight onto the canvas.
  fragColor = vec4(color.rgb, 1.);
}
`;

const accumFragmentShader = `
precision highp float;

uniform sampler2D prevTexture;
uniform sampler2D inputTexture;
uniform bool invalidate;
uniform float invalidateBlend;
uniform vec3 backgroundColor;
uniform float samples;

in vec2 vUv;

out vec4 fragColor;

void main() {
  vec4 p = texture(prevTexture, vUv);
  vec4 c = texture(inputTexture, vUv);
  // Bake background into RGB so zero-alpha clear frames don't darken the accumulation.
  // Keep raw alpha in .a so the composite can use it for bump-shadow edge detection.
  vec4 frame = vec4(mix(backgroundColor, c.rgb, c.a), c.a);
  float blendWeight = invalidate ? invalidateBlend : 1.0 / samples;
  fragColor = mix(p, frame, blendWeight);
}`;

const shadowPreviewFragmentShader = `
precision highp float;
uniform sampler2D shadowMap;
in vec2 vUv;
out vec4 fragColor;
float unpackRGBAToDepth(vec4 v) {
  // three.js r163 packing: PackFactors=(1,256,65536,16777216), UnpackDownscale=255/256
  return dot(v, vec4(255.0/256.0, 255.0/65536.0, 255.0/16777216.0, 1.0/16777216.0));
}
void main() {
  float d = unpackRGBAToDepth(texture(shadowMap, vUv));
  fragColor = vec4(vec3(d), 1.0);
}`;

const loader = new TextureLoader();
const paper = loader.load("./assets/Sketchbook.jpg");
paper.wrapS = paper.wrapT = RepeatWrapping;
// const paper = loader.load("./assets/Parchment.jpg");

// The accumulation buffer's format. The shader weights each new frame by 1/samples, so
// by sample 100 a frame contributes 1% — in 8 bits that is below the quantisation step
// for all but the largest differences, and the picture stops converging long before the
// passes stop. Half float removes that ceiling, which is what makes a 128-point jitter
// sequence worth having (see jitter.js).
//
// Guarded: RGBA16F is only colour-renderable with one of these extensions, and falling
// back is better than a blank canvas.
function accumulationType() {
  const gl = renderer.getContext();
  const renderable =
    gl.getExtension("EXT_color_buffer_float") ||
    gl.getExtension("EXT_color_buffer_half_float");
  return renderable ? HalfFloatType : UnsignedByteType;
}

const _viewport = new Vector4();

class Painted {
  constructor() {
    this.maxAccumFrames = 120;
    this.frames = 0;
    this.compositeNeedsUpdate = true;
    this._passTimer = new AdaptivePassTimer({ budgetMs: 10 });

    let w = 1;
    let h = 1;

    this.size = new Vector2(w, h);

    this.colorFBO = new WebGLRenderTarget(w, h, {
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      minFilter: LinearFilter,
      format: RGBAFormat,
      stencilBuffer: false,
      depthBuffer: true,
    });

    // Accumulates raw 3D renders — emboss composite is NOT baked in here.
    const rawAccumShader = new RawShaderMaterial({
      uniforms: {
        prevTexture:      { value: null },
        inputTexture:     { value: null },
        invalidate:       { value: false },
        invalidateBlend:  { value: 1.0 },
        samples:          { value: 1 },
        backgroundColor:  { value: new Color() },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: accumFragmentShader,
      glslVersion: GLSL3,
    });
    // Full-screen quads never depth-test, so neither target needs a depth buffer -- at 2x
    // on a 1400x800 window each one was 18 MB of video memory spent on nothing.
    this.rawAccumPass = new ShaderPingPongPass(rawAccumShader, {
      type: accumulationType(),
      depthBuffer: false,
    });

    // Composite pass — reads the accumulated raw result, applies emboss/paper/etc.
    const shader = new RawShaderMaterial({
      uniforms: {
        resolution:     { value: new Vector2(w, h) },
        pixelRatio:     { value: 1 },
        vignetteBoost:  { value: 0.5 },
        vignetteReduction: { value: 0.5 },
        inputTexture:   { value: null },
        paperTexture:   { value: paper },
        embossAngle:    { value: -Math.PI / 4 },
        embossEdge:     { value: 0.1 },
        embossStrength:  { value: 1.0 },
        paperStrength:   { value: 0.2 },
        bumpSize:        { value: 4 },
        bumpShadow:      { value: 0.1 },
        shadowStrength:  { value: 0.2 },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: fragmentShader,
      glslVersion: GLSL3,
    });
    // Drawn straight onto the canvas. It used to go to a target of its own, which a final
    // pass then copied to the screen with alpha forced to 1 -- a full-screen pass and a
    // full-resolution buffer for what one line at the end of this shader now does.
    this.pass = new ShaderPass(shader, { toScreen: true });

    // embossAngle drives the 3D light — needs shadow re-accumulation.
    let angleReady = false;
    effect(() => {
      embossAngle();
      if (angleReady) this.softInvalidate();
      else angleReady = true;
    });

    // Other emboss params only need a composite re-run, not 3D re-accumulation.
    let embossReady = false;
    effect(() => {
      embossEdge(); embossStrength(); paperStrength(); bumpSize(); bumpShadow(); shadowStrength(); showShadowBuffer();
      if (embossReady) this.compositeNeedsUpdate = true;
      else embossReady = true;
    });

    // Paper color is baked into the accumulation — needs a full re-accumulation.
    let colorReady = false;
    effect(() => {
      this.backgroundColor.set(paperColor());
      if (colorReady) this.invalidate();
      else colorReady = true;
    });

    registerActivePainted(this);
    this.invalidate();
  }

  get backgroundColor() {
    return this.rawAccumPass.shader.uniforms.backgroundColor.value;
  }

  // The accumulation budget is calibrated to whatever was last on screen, so a new drawing
  // has to earn its own measurement rather than inherit one.
  resetPassBudget() {
    this._passTimer.reset();
  }

  // Restarts accumulation. The next pass replaces the buffer outright (blend 1); a soft
  // restart blends it half and half with what was there, for changes to lighting where
  // snapping to one noisy sample would flash.
  invalidate(blend = 1.0) {
    const uniforms = this.rawAccumPass.shader.uniforms;
    uniforms.invalidate.value = true;
    uniforms.invalidateBlend.value = blend;
    uniforms.samples.value = 1;
    this.frames = 0;
    this.compositeNeedsUpdate = true;
    resetPointer();
  }

  softInvalidate() {
    this.invalidate(0.5);
  }

  setSize(w, h) {
    // Every setSize reallocates four full-resolution targets and throws away the
    // accumulation. three.js's own setSize calls are already no-ops at an unchanged size,
    // but the invalidate() below is not, so the guard belongs here rather than in them.
    if (this.size.x === w && this.size.y === h) return;

    this.colorFBO.setSize(w, h);
    this.rawAccumPass.setSize(w, h);
    this.pass.setSize(w, h);
    this.pass.shader.uniforms.resolution.value.set(w, h);
    this.size.set(w, h);
    this.invalidate();
  }

  render(renderer, scene, camera, frameStart = performance.now()) {
    const needsAccum = this.frames <= this.maxAccumFrames;
    if (!needsAccum && !this.compositeNeedsUpdate) {
      this._drawShadowPreview(renderer);
      return;
    }

    // Update composite uniforms — cheap, always current.
    this.pass.shader.uniforms.embossAngle.value    = embossAngle();
    this.pass.shader.uniforms.embossEdge.value     = embossEdge();
    this.pass.shader.uniforms.embossStrength.value = embossStrength();
    this.pass.shader.uniforms.paperStrength.value  = paperStrength();
    this.pass.shader.uniforms.bumpSize.value       = bumpSize();
    this.pass.shader.uniforms.bumpShadow.value     = bumpShadow();
    this.pass.shader.uniforms.shadowStrength.value = shadowStrength();
    this.pass.shader.uniforms.pixelRatio.value     = renderer.getPixelRatio();

    if (needsAccum) {
      // No clear on a hard invalidate: its first pass blends the new frame in at weight 1,
      // which replaces the buffer whatever was in it. Nor a warm-up render -- the light and
      // its hook are installed with the stage, before anything is drawn.
      this._passTimer.beginFrame(renderer, frameStart);
      this._passTimer.beginPasses();
      let passesRun = 0;
      while (this._passTimer.shouldContinue(passesRun) && this.frames <= this.maxAccumFrames) {
        updateProjectionMatrixJitter(camera, this.size);
        this.frames++;

        renderer.setRenderTarget(this.colorFBO);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);

        this.rawAccumPass.shader.uniforms.inputTexture.value = this.colorFBO.texture;
        this.rawAccumPass.shader.uniforms.prevTexture.value  = this.rawAccumPass.texture;
        this.rawAccumPass.render(renderer);
        this.rawAccumPass.shader.uniforms.invalidate.value = false;
        this.rawAccumPass.shader.uniforms.samples.value++;

        incPointer();
        passesRun++;
      }
      this._passTimer.endPasses(passesRun);
    }

    // Composite runs once on the fully (or partially) accumulated raw result.
    // Emboss param changes re-run only this step — no 3D re-accumulation needed.
    this.pass.shader.uniforms.inputTexture.value = this.rawAccumPass.texture;
    this.pass.render(renderer, true);

    this.compositeNeedsUpdate = false;
    this._drawShadowPreview(renderer);
  }

  _drawShadowPreview(renderer) {
    if (!showShadowBuffer()) return;
    const shadowTex = shadowMapTexture();
    if (!shadowTex) return;
    if (!this._shadowPreview) {
      const mat = new RawShaderMaterial({
        uniforms: { shadowMap: { value: null } },
        vertexShader: orthoVertexShader,
        fragmentShader: shadowPreviewFragmentShader,
        glslVersion: GLSL3,
        depthTest: false,
        depthWrite: false,
      });
      // near=0.00001 so the z=0 plane maps to clip_z≈-1 (on the near plane, not culled)
      const cam = new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.00001, 1000);
      const sc = new Scene();
      sc.add(new Mesh(new PlaneGeometry(1, 1), mat));
      this._shadowPreview = { mat, cam, sc };
    }
    const { mat, cam, sc } = this._shadowPreview;
    mat.uniforms.shadowMap.value = shadowTex;
    // setViewport and setScissor take CSS pixels and scale them by the pixel ratio. This used
    // to hand them this.size, which is in device pixels, and then "restore" the viewport to
    // it: on a 2x display the viewport was left at twice the canvas, and every pass after
    // it drew only the bottom-left quarter of the picture.
    renderer.getViewport(_viewport);
    const size = Math.floor(Math.min(_viewport.z, _viewport.w) / 4);
    const margin = 8;
    // Disable autoClear: the shadow renderer sets gl.clearColor(1,1,1,1) and never
    // resets it, so autoClear would wipe the preview viewport to white.
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setViewport(margin, margin, size, size);
    renderer.setScissor(margin, margin, size, size);
    renderer.setScissorTest(true);
    renderer.render(sc, cam);
    renderer.setScissorTest(false);
    renderer.setViewport(_viewport);
    renderer.autoClear = prevAutoClear;
  }
}

export { Painted };
