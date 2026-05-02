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
import { onShadowChange, embossAngle, embossEdge, embossStrength, paperStrength, bumpSize, bumpShadow } from "./three-meshline.js";

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

  vec4 normal = calcNormal(inputTexture, vUv) + calcNormalRGB(paperTexture, paperUv);
  
  // vec2 mousePos = mouse/resolution.xy;
  // mousePos.y = 1.- mousePos.y;
  // vec3 dir = normalize(vec3(vUv - mousePos, 0.));

  vec3 dir = normalize(vec3(cos(embossAngle), sin(embossAngle), 0.));
  float l = dot(normal.rgb, dir);
  l = .5 + .5 * l;
  l = 1. - l;
  l = smoothstep(.5 - embossEdge, .5 + embossEdge, l);
  
  vec2 bumpDir = vec2(-cos(embossAngle), -sin(embossAngle));
  vec2 offset = bumpDir * bumpSize / resolution.xy;
  vec4 shadow = texture(inputTexture, vUv + offset);
  shadow = vec4(mix(vec3(bumpShadow), vec3(1.0), 1. - shadow.a), 1.);
  shadow.rgb = mix(shadow.rgb, vec3(1.), color.a);  

  color = vec4(color.rgb, 1.);

  paper *= shadow;
  // color = mix(paper, color, .5);
  color = overlay(color, paper, paperStrength);

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
  if(invalidate) {
    fragColor = frame;
  } else {
    fragColor = mix(p, frame, max(1.0 / samples, 0.05));
  }
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

const loader = new TextureLoader();
const paper = loader.load("./assets/Sketchbook.jpg");
paper.wrapS = paper.wrapT = RepeatWrapping;
// const paper = loader.load("./assets/Parchment.jpg");

class Painted {
  constructor(params = {}) {
    this.maxAccumFrames = 120;
    this.framesPerFrame = 1;
    this.frames = 0;
    this.compositeNeedsUpdate = true;

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
        embossStrength: { value: 1.0 },
        paperStrength:  { value: 0.2 },
        bumpSize:       { value: 10 },
        bumpShadow:     { value: 0.9 },
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

    // Emboss param changes only need a composite re-run, not a 3D re-accumulation.
    let embossReady = false;
    effect(() => {
      embossAngle(); embossEdge(); embossStrength(); paperStrength(); bumpSize(); bumpShadow();
      if (embossReady) this.compositeNeedsUpdate = true;
      else embossReady = true;
    });

    this.invalidate();
    onShadowChange(() => this.invalidate());
  }

  get backgroundColor() {
    return this.rawAccumPass.shader.uniforms.backgroundColor.value;
  }

  invalidate() {
    this.rawAccumPass.shader.uniforms.invalidate.value = true;
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

  render(renderer, scene, camera) {
    const needsAccum = this.frames <= this.maxAccumFrames;
    if (!needsAccum && !this.compositeNeedsUpdate) return;

    // Update composite uniforms — cheap, always current.
    this.pass.shader.uniforms.embossAngle.value    = embossAngle();
    this.pass.shader.uniforms.embossEdge.value     = embossEdge();
    this.pass.shader.uniforms.embossStrength.value = embossStrength();
    this.pass.shader.uniforms.paperStrength.value  = paperStrength();
    this.pass.shader.uniforms.bumpSize.value       = bumpSize();
    this.pass.shader.uniforms.bumpShadow.value     = bumpShadow();

    if (needsAccum) {
      // Warm-up pass: installs scene-level hooks (shadow light, scene.onBeforeRender)
      // before the first accumulated frame so the shadow map is correct from frame 1.
      if (this.frames === 0) {
        renderer.setRenderTarget(this.colorFBO);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
      }
      for (let i = 0; i < this.framesPerFrame; i++) {
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
      }
    }

    // Composite runs once on the fully (or partially) accumulated raw result.
    // Emboss param changes re-run only this step — no 3D re-accumulation needed.
    this.pass.shader.uniforms.inputTexture.value = this.rawAccumPass.texture;
    this.pass.render(renderer);

    this.finalPass.shader.uniforms.inputTexture.value = this.pass.fbo.texture;
    this.finalPass.render(renderer, true);

    this.compositeNeedsUpdate = false;
  }
}

export { Painted };
