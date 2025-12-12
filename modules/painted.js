import {
  WebGLRenderTarget,
  ClampToEdgeWrapping,
  LinearFilter,
  RGBAFormat,
  RawShaderMaterial,
  Vector2,
  TextureLoader,
  GLSL3,
  Color,
  UnsignedByteType,
} from "three";

import orthoVertexShader from "../shaders/ortho.js";
import vignette from "../shaders/vignette.js";
import grayscale from "../shaders/grayscale.js";
import overlay from "../shaders/overlay.js";
import softLight from "../shaders/soft-light.js";
import { ShaderPass } from "../modules/shader-pass.js";
import { ShaderPingPongPass } from "../modules/shader-ping-pong-pass.js";
import {
  updateProjectionMatrixJitter,
  incPointer,
  resetPointer,
} from "./jitter.js";

const fragmentShader = `
precision highp float;

uniform vec2 resolution;

uniform sampler2D inputTexture;
uniform float vignetteBoost;
uniform float vignetteReduction;
uniform float lightenPass;
uniform sampler2D paperTexture;
uniform vec3 backgroundColor;

in vec2 vUv;

out vec4 fragColor;

${vignette}
${overlay}
${softLight}
${grayscale}

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
  
void main() {
  vec4 color = texture(inputTexture, vUv);
  
  vec4 normal = calcNormal(inputTexture, vUv);

  float l = dot(normal.rgb, normalize(vec3(1., -1., 0.)));
  l = .5 + .5 * l;
  l = 1. - l;
  float e = .3;
  l = smoothstep(.5-e, .5+e, l);
  
  vec2 offset = 10. / resolution.xy;
  vec4 shadow = texture(inputTexture, vUv + vec2(-1., 1.) * offset);
  shadow = vec4(mix(vec3(.9), vec3(1.0), 1. - shadow.a), 1.);
  shadow.rgb = mix(shadow.rgb, vec3(1.), color.a);  

  color = vec4(mix(backgroundColor, color.rgb, color.a), 1.);

  vec2 paperUv = gl_FragCoord.xy / resolution.xy;
  paperUv = paperUv * resolution.xy / vec2(textureSize(paperTexture, 0).xy);
  vec4 paper = texture(paperTexture, paperUv);
  paper *= shadow;
  // color = mix(paper, color, .5);
  color = overlay(color, paper, .2);
  
  color = softLight(color, vec4(vec3(vignette(vUv, vignetteBoost, vignetteReduction)),1.));
  color += (1. / 255.) * gradientNoise(gl_FragCoord.xy) - (.5 / 255.);

  color = overlay(color, vec4(l), 1.);
  // color = vec4(l);
  fragColor = color;
}
`;

const accumFragmentShader = `
precision highp float;

uniform sampler2D prevTexture;
uniform sampler2D inputTexture;
uniform float samples;
uniform bool invalidate;

in vec2 vUv;

out vec4 fragColor;

void main() {
  vec4 p = texture(prevTexture, vUv);
  vec4 c = texture(inputTexture, vUv);
  if(invalidate) {
    fragColor = c;
  } else {
    vec3 color = mix(p.rgb, c.rgb, .05);
    fragColor = vec4(color, 1.);
  }
}`;

const finalFragmentShader = `
precision highp float;
uniform sampler2D inputTexture;
uniform float samples;

in vec2 vUv;

out vec4 fragColor;

void main() {
  vec4 c = texture(inputTexture, vUv);
  fragColor = vec4(c.rgb, 1.);
}`;

const loader = new TextureLoader();
const paper = loader.load("./assets/Sketchbook.jpg");
// const paper = loader.load("./assets/Parchment.jpg");

class Painted {
  constructor(params = {}) {
    this.maxAccumFrames = 120;
    this.framesPerFrame = 1;
    this.frames = 0;

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

    const shader = new RawShaderMaterial({
      uniforms: {
        resolution: { value: new Vector2(w, h) },
        vignetteBoost: { value: 0.5 },
        vignetteReduction: { value: 0.5 },
        inputTexture: { value: this.colorFBO.texture },
        backgroundColor: { value: new Color() },
        lightenPass: {
          value: params.lightenPass !== undefined ? params.lightenPass : 1,
        },
        paperTexture: { value: paper },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: fragmentShader,
      glslVersion: GLSL3,
    });
    this.pass = new ShaderPass(
      shader,
      w,
      h,
      RGBAFormat,
      UnsignedByteType,
      LinearFilter,
      LinearFilter,
      ClampToEdgeWrapping,
      ClampToEdgeWrapping
    );

    const accumShader = new RawShaderMaterial({
      uniforms: {
        prevTexture: { value: this.pass.fbo.texture },
        inputTexture: { value: this.pass.fbo.texture },
        invalidate: { value: false },
        samples: { value: 0 },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: accumFragmentShader,
      glslVersion: GLSL3,
    });
    this.accumPass = new ShaderPingPongPass(accumShader);

    const finalShader = new RawShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: finalFragmentShader,
      glslVersion: GLSL3,
    });
    this.finalPass = new ShaderPass(finalShader);

    this.invalidate();
  }

  get backgroundColor() {
    return this.pass.shader.uniforms.backgroundColor.value;
  }

  invalidate() {
    this.accumPass.shader.uniforms.invalidate.value = true;
    this.accumPass.shader.uniforms.samples.value = 0;
    this.frames = 0;
    resetPointer();
  }

  setSize(w, h) {
    this.colorFBO.setSize(w, h);
    this.pass.setSize(w, h);
    this.pass.shader.uniforms.resolution.value.set(w, h);
    this.accumPass.setSize(w, h);
    this.finalPass.setSize(w, h);
    this.size.set(w, h);
    this.invalidate();
  }

  render(renderer, scene, camera) {
    if (this.frames > this.maxAccumFrames) {
      return;
    }
    for (let i = 0; i < this.framesPerFrame; i++) {
      updateProjectionMatrixJitter(camera, this.size);
      this.frames++;

      renderer.setRenderTarget(this.colorFBO);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);

      this.pass.render(renderer);

      this.accumPass.shader.uniforms.inputTexture.value = this.pass.fbo.texture;
      this.accumPass.shader.uniforms.prevTexture.value = this.accumPass.texture;
      this.accumPass.render(renderer);

      this.finalPass.shader.uniforms.inputTexture.value =
        this.accumPass.texture;
      this.finalPass.render(renderer, true);

      this.accumPass.shader.uniforms.invalidate.value = false;

      incPointer();
    }
  }
}

export { Painted };
