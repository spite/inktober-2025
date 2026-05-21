import {
  WebGLRenderTarget,
  ClampToEdgeWrapping,
  LinearFilter,
  RGBAFormat,
  RawShaderMaterial,
  RepeatWrapping,
  Vector2,
  TextureLoader,
  GLSL3,
  Color,
  UnsignedByteType,
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
import { registerActivePainted, embossAngle, embossEdge, embossStrength, paperStrength, bumpSize, bumpShadow, shadowStrength, showShadowBuffer } from "./three-meshline.js";
import { AdaptivePassTimer } from "./gpu-timer.js";

const fragmentShader = `
precision highp float;

uniform vec2 resolution;

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
  const ivec3 off = ivec3(-1,0,1);

  float s01 = textureOffset(map, uv, off.xy).a;
  float s21 = textureOffset(map, uv, off.zy).a;
  float s10 = textureOffset(map, uv, off.yx).a;
  float s12 = textureOffset(map, uv, off.yz).a;
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

  vec2 paperUv = gl_FragCoord.xy / vec2(textureSize(paperTexture, 0).xy);
  vec4 paper = texture(paperTexture, paperUv);

  // paperStrength scales how much the paper texture contributes to the bump normal.
  vec4 normal = calcNormal(inputTexture, vUv) + calcNormalRGB(paperTexture, paperUv) * paperStrength;

  vec3 dir = normalize(vec3(cos(embossAngle), sin(embossAngle), 0.));
  float l = dot(normal.rgb, dir);
  l = .5 + .5 * l;
  l = smoothstep(.5 - embossEdge, .5 + embossEdge, l);

  vec2 bumpDir = vec2(cos(embossAngle), sin(embossAngle));
  vec2 offset = bumpDir * bumpSize / resolution.xy;
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
  
  fragColor = color;
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

const finalFragmentShader = `
precision highp float;
uniform sampler2D inputTexture;

in vec2 vUv;

out vec4 fragColor;

void main() {
  vec4 c = texture(inputTexture, vUv);
  fragColor = vec4(c.rgb, 1.);
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

class Painted {
  constructor(params = {}) {
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
    this.rawAccumPass = new ShaderPingPongPass(rawAccumShader);

    // Composite pass — reads the accumulated raw result, applies emboss/paper/etc.
    const shader = new RawShaderMaterial({
      uniforms: {
        resolution:     { value: new Vector2(w, h) },
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
    this.pass = new ShaderPass(
      shader, w, h,
      RGBAFormat, UnsignedByteType,
      LinearFilter, LinearFilter,
      ClampToEdgeWrapping, ClampToEdgeWrapping
    );

    const finalShader = new RawShaderMaterial({
      uniforms: { inputTexture: { value: null } },
      vertexShader: orthoVertexShader,
      fragmentShader: finalFragmentShader,
      glslVersion: GLSL3,
    });
    this.finalPass = new ShaderPass(finalShader);

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

    this.invalidate();
  }

  get backgroundColor() {
    return this.rawAccumPass.shader.uniforms.backgroundColor.value;
  }

  invalidate() {
    registerActivePainted(this);

    this.rawAccumPass.shader.uniforms.invalidate.value = true;
    this.rawAccumPass.shader.uniforms.invalidateBlend.value = 1.0;
    this.rawAccumPass.shader.uniforms.samples.value = 1;
    this.frames = 0;
    this.compositeNeedsUpdate = true;
    resetPointer();
  }

  softInvalidate() {
    this.rawAccumPass.shader.uniforms.invalidate.value = true;
    this.rawAccumPass.shader.uniforms.invalidateBlend.value = 0.5;
    this.rawAccumPass.shader.uniforms.samples.value = 1;
    this.frames = 0;
    this.compositeNeedsUpdate = true;
    resetPointer();
  }

  setSize(w, h) {
    this.colorFBO.setSize(w, h);
    this.rawAccumPass.setSize(w, h);
    this.pass.setSize(w, h);
    this.pass.shader.uniforms.resolution.value.set(w, h);
    this.finalPass.setSize(w, h);
    this.size.set(w, h);
    this.invalidate();
  }

  render(renderer, scene, camera, frameStart = performance.now()) {
    const needsAccum = this.frames <= this.maxAccumFrames;
    if (!needsAccum && !this.compositeNeedsUpdate) {
      this._drawShadowPreview(renderer, scene);
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

    if (needsAccum) {
      // Hard invalidate: wipe both ping-pong FBOs so no previous-sketch depth can
      // bleed through, even if prevTexture is stale from a cached module revisit.
      if (this.rawAccumPass.shader.uniforms.invalidate.value &&
          this.rawAccumPass.shader.uniforms.invalidateBlend.value === 1.0) {
        for (const fbo of this.rawAccumPass.fbos) {
          renderer.setRenderTarget(fbo);
          renderer.clear(true, false, false);
        }
        renderer.setRenderTarget(null);
      }

      // Warm-up pass: installs scene-level hooks (shadow light, scene.onBeforeRender)
      // before the first accumulated frame so the shadow map is correct from frame 1.
      // Skipped once the shadow system is initialized — avoids a full redundant render
      // every time the camera moves (OrbitControls resets frames to 0 each frame).
      if (this.frames === 0 && !scene.userData.__meshlineShadowLight) {
        renderer.setRenderTarget(this.colorFBO);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
      }
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
    this.pass.render(renderer);

    this.finalPass.shader.uniforms.inputTexture.value = this.pass.fbo.texture;
    this.finalPass.render(renderer, true);

    this.compositeNeedsUpdate = false;
    this._drawShadowPreview(renderer, scene);
  }

  _drawShadowPreview(renderer, scene) {
    if (!showShadowBuffer()) return;
    const shadowTex = scene.userData.__meshlineShadowLight?.shadow?.map?.texture;
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
    const size = Math.floor(Math.min(this.size.x, this.size.y) / 4);
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
    renderer.setViewport(0, 0, this.size.x, this.size.y);
    renderer.autoClear = prevAutoClear;
  }
}

export { Painted };
