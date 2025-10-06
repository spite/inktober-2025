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
import { shader as fxaa } from "../shaders/fxaa.js";
import grayscale from "../shaders/grayscale.js";
import sobel from "../shaders/sobel.js";
import overlay from "../shaders/overlay.js";
import softLight from "../shaders/soft-light.js";
import lighten from "../shaders/lighten.js";
import { levelRange } from "../shaders/levels.js";
import { blur5 } from "../shaders/fast-separable-gaussian-blur.js";
import highPass from "../shaders/high-pass.js";
import { noise2d } from "../shaders/noise2d.js";
import { ShaderPass } from "../modules/shader-pass.js";
import { shader as median } from "../shaders/median.js";
import { ShaderPingPongPass } from "../modules/shader-ping-pong-pass.js";

const antialiasFragmentShader = `
precision highp float;

uniform vec2 resolution;

uniform sampler2D inputTexture;
uniform float minLevel;
uniform float maxLevel;

in vec2 vUv;

out vec4 fragColor;

${fxaa}
${levelRange}
${median}

void main() {
  vec4 c = texture(inputTexture, vUv);
  // fragColor = vec4(fxaa(inputTexture, vUv, 1. / resolution.xy).rgb, c.a);
  fragColor = vec4(median(inputTexture, vUv).rgb, c.a);
  // fragColor = c;
}
`;

const grayscaleFragmentShader = `
precision highp float;

uniform vec2 resolution;

uniform sampler2D inputTexture;
uniform vec2 direction;

in vec2 vUv;

out vec4 fragColor;

${grayscale}
${blur5}

void main() {
  vec4 color = blur5(inputTexture, vUv, resolution, direction);
  fragColor = vec4(vec3(grayscale(color)),1.);
}
`;

const edgesFragmentShader = `
precision highp float;

uniform vec2 resolution;

uniform sampler2D inputTexture;

in vec2 vUv;

out vec4 fragColor;

${sobel}

void main() {
  fragColor = vec4(sobel(inputTexture, vUv, resolution.x/800.),1.);
}
`;

const fragmentShader = `
precision highp float;

uniform vec2 resolution;

uniform sampler2D inputTexture;
uniform sampler2D edgesTexture;
uniform sampler2D grayscaleTexture;
uniform float vignetteBoost;
uniform float vignetteReduction;
uniform float lightenPass;
uniform sampler2D paperTexture;
uniform vec3 backgroundColor;

in vec2 vUv;

out vec4 fragColor;

${vignette}
${fxaa}
${sobel}
${overlay}
${softLight}
${lighten}
${highPass}
${grayscale}

float gradientNoise(in vec2 uv) {
	return fract(52.9829189 * fract(dot(uv, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec4 color = texture(inputTexture, vUv);
  
  vec2 offset = 10.  / resolution.xy;
  vec4 shadow = texture(inputTexture, vUv + vec2(-1., 1.) * offset);
  shadow = vec4(mix(vec3(.9), vec3(1.0), 1. - shadow.a), 1.);
  shadow.rgb = mix(shadow.rgb, vec3(1.), color.a);  

  color = vec4(mix(backgroundColor, color.rgb, color.a), 1.);

  // color = overlay(color, .5 * (1.-grayEdges), .2);

  // vec4 hp = highPass(inputTexture, vUv);
  // color = softLight(color, hp);

  vec2 paperUv = gl_FragCoord.xy / resolution.xy;
  paperUv = paperUv * resolution.xy / vec2(textureSize(paperTexture, 0).xy);
  vec4 paper = texture(paperTexture, paperUv);
  paper *= shadow;
  // color = mix(paper, color, .5);
  color = overlay(color, paper, .2);
  
  color = softLight(color, vec4(vec3(vignette(vUv, vignetteBoost, vignetteReduction)),1.));
  color += (1. / 255.) * gradientNoise(gl_FragCoord.xy) - (.5 / 255.);

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

    this.colorFBO = new WebGLRenderTarget(w, h, {
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      minFilter: LinearFilter,
      format: RGBAFormat,
      stencilBuffer: false,
      depthBuffer: true,
    });

    const antialiasShader = new RawShaderMaterial({
      uniforms: {
        resolution: { value: new Vector2(w, h) },
        inputTexture: { value: this.colorFBO.texture },
        minLevel: { value: 0 },
        maxLevel: { value: 1 },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: antialiasFragmentShader,
      glslVersion: GLSL3,
    });
    this.antialiasPass = new ShaderPass(
      antialiasShader,
      w,
      h,
      RGBAFormat,
      UnsignedByteType,
      LinearFilter,
      LinearFilter,
      ClampToEdgeWrapping,
      ClampToEdgeWrapping
    );

    const edgesShader = new RawShaderMaterial({
      uniforms: {
        resolution: { value: new Vector2(w, h) },
        inputTexture: { value: this.colorFBO.texture },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: edgesFragmentShader,
      glslVersion: GLSL3,
    });
    this.edgesPass = new ShaderPass(
      edgesShader,
      w,
      h,
      RGBAFormat,
      UnsignedByteType,
      LinearFilter,
      LinearFilter,
      ClampToEdgeWrapping,
      ClampToEdgeWrapping
    );

    const blurShader = new RawShaderMaterial({
      uniforms: {
        resolution: { value: new Vector2(w, h) },
        direction: { value: new Vector2(10, 0) },
        inputTexture: { value: this.edgesPass.fbo.texture },
      },
      vertexShader: orthoVertexShader,
      fragmentShader: grayscaleFragmentShader,
      glslVersion: GLSL3,
    });
    this.blurHPass = new ShaderPass(
      blurShader,
      w,
      h,
      RGBAFormat,
      UnsignedByteType,
      LinearFilter,
      LinearFilter,
      ClampToEdgeWrapping,
      ClampToEdgeWrapping
    );
    this.blurVPass = new ShaderPass(
      blurShader,
      w,
      h,
      RGBAFormat,
      UnsignedByteType,
      LinearFilter,
      LinearFilter,
      ClampToEdgeWrapping,
      ClampToEdgeWrapping
    );

    const shader = new RawShaderMaterial({
      uniforms: {
        resolution: { value: new Vector2(w, h) },
        vignetteBoost: { value: 0.5 },
        vignetteReduction: { value: 0.5 },
        inputTexture: { value: this.colorFBO.texture },
        edgesTexture: { value: this.edgesPass.fbo.texture },
        grayscaleTexture: { value: this.blurVPass.fbo.texture },
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
  }

  setSize(w, h) {
    this.colorFBO.setSize(w, h);
    this.antialiasPass.setSize(w, h);
    this.antialiasPass.shader.uniforms.resolution.value.set(w, h);
    // this.edgesPass.setSize(w, h);
    // this.edgesPass.shader.uniforms.resolution.value.set(w, h);
    // this.blurHPass.setSize(w, h);
    // this.blurHPPass.shader.uniforms.resolution.value.set(w, h);
    // this.blurVPass.setSize(w, h);
    this.pass.setSize(w, h);
    this.pass.shader.uniforms.resolution.value.set(w, h);
    this.accumPass.setSize(w, h);
    this.finalPass.setSize(w, h);

    this.invalidate();
  }

  render(renderer, scene, camera) {
    if (this.frames > this.maxAccumFrames) {
      return;
    }
    for (let i = 0; i < this.framesPerFrame; i++) {
      this.frames++;

      renderer.setRenderTarget(this.colorFBO);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      // antialiasPass.shader.uniforms.inputTexture.value = colorFBO.texture;
      // antialiasPass.shader.uniforms.minLevel.value = params.minLevel || 0.2;
      // antialiasPass.shader.uniforms.maxLevel.value = params.maxLevel || 1;
      // antialiasPass.render();
      // edgesPass.render();
      // const d = (2 * w) / 800;
      // blurHPass.shader.uniforms.inputTexture.value = edgesPass.fbo.texture;
      // blurHPass.shader.uniforms.direction.value.set(d, 0);
      // blurHPass.render();
      // blurVPass.shader.uniforms.inputTexture.value = blurHPass.fbo.texture;
      // blurVPass.shader.uniforms.direction.value.set(0, d);
      // blurVPass.render();
      // blurHPass.shader.uniforms.inputTexture.value = blurVPass.fbo.texture;
      // blurHPass.shader.uniforms.direction.value.set(d, 0);
      // blurHPass.render();
      // blurVPass.shader.uniforms.inputTexture.value = blurHPass.fbo.texture;
      // blurVPass.shader.uniforms.direction.value.set(0, d);
      // blurVPass.render();

      this.pass.render(renderer);

      this.accumPass.shader.uniforms.inputTexture.value = this.pass.fbo.texture;
      this.accumPass.shader.uniforms.prevTexture.value = this.accumPass.texture;
      this.accumPass.render(renderer);

      this.finalPass.shader.uniforms.inputTexture.value =
        this.accumPass.texture;
      this.finalPass.render(renderer, true);

      // antialiasPass.shader.uniforms.minLevel.value = 0;
      // antialiasPass.shader.uniforms.maxLevel.value = 1;
      // antialiasPass.shader.uniforms.inputTexture.value = pass.fbo.texture;
      // antialiasPass.render(true);

      this.accumPass.shader.uniforms.invalidate.value = false;
    }
  }
}

export { Painted };
