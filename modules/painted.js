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
import fxaa from "../shaders/fxaa-pixel-shift.js";
import grayscale from "../shaders/grayscale.js";
import sobel from "../shaders/sobel.js";
import overlay from "../shaders/overlay.js";
import softLight from "../shaders/soft-light.js";
import lighten from "../shaders/lighten.js";
import { levelRange } from "../shaders/levels.js";
import { blur5 } from "../shaders/fast-separable-gaussian-blur.js";
import highPass from "../shaders/high-pass.js";
import { noise2d } from "../shaders/noise2d.js";
import ShaderPass from "../modules/shader-pass.js";

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

void main() {
  vec4 c = texture(inputTexture, vUv);
  fragColor = vec4(fxaa(inputTexture, vUv), c.a);
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

float gradientNoise(in vec2 uv) {
	return fract(52.9829189 * fract(dot(uv, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec4 color = texture(inputTexture, vUv);
  vec4 edges = texture(edgesTexture, vUv);
  vec4 grayEdges = 1.-texture(grayscaleTexture, vUv);

  color = vec4(mix(backgroundColor, color.rgb, color.a), 1.);

  float offset = .05;
  vec4 shadow = texture(inputTexture, vUv + vec2(-1., 1.) * offset);
  shadow = vec4(1. - shadow.aaa, 1.);

  edges.rgb = vec3(length(edges.rgb));

  color = overlay(color, edges, .4);

  vec4 hp = highPass(inputTexture, vUv);
  color = softLight(color, hp);

  if(lightenPass==1.) {
    // color = lighten(color, grayEdges);
  }

  vec2 paperUv = gl_FragCoord.xy / resolution.xy;
  paperUv = paperUv * resolution.xy / vec2(textureSize(paperTexture, 0).xy);
  vec4 paper = texture(paperTexture, paperUv);
  color = overlay(color, paper, 1.);
  
  color = softLight(color, vec4(vec3(vignette(vUv, vignetteBoost, vignetteReduction)),1.));
  color += (1. / 255.) * gradientNoise(gl_FragCoord.xy) - (.5 / 255.);

  fragColor = color;
}
`;

const loader = new TextureLoader();
const paper = loader.load("./assets/Parchment.jpg");

function Painted(renderer, params = {}) {
  let w = 1;
  let h = 1;

  const colorFBO = new WebGLRenderTarget(w, h, {
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
      inputTexture: { value: colorFBO.texture },
      minLevel: { value: 0 },
      maxLevel: { value: 1 },
    },
    vertexShader: orthoVertexShader,
    fragmentShader: antialiasFragmentShader,
    glslVersion: GLSL3,
  });
  const antialiasPass = new ShaderPass(
    renderer,
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
      inputTexture: { value: colorFBO.texture },
    },
    vertexShader: orthoVertexShader,
    fragmentShader: edgesFragmentShader,
    glslVersion: GLSL3,
  });
  const edgesPass = new ShaderPass(
    renderer,
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
      inputTexture: { value: edgesPass.fbo.texture },
    },
    vertexShader: orthoVertexShader,
    fragmentShader: grayscaleFragmentShader,
    glslVersion: GLSL3,
  });
  const blurHPass = new ShaderPass(
    renderer,
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
  const blurVPass = new ShaderPass(
    renderer,
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
      inputTexture: { value: antialiasPass.fbo.texture },
      edgesTexture: { value: edgesPass.fbo.texture },
      grayscaleTexture: { value: blurVPass.fbo.texture },
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
  const pass = new ShaderPass(
    renderer,
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

  function render(scene, camera) {
    const size = new Vector2();
    renderer.getSize(size);
    if (size.width !== w || size.height !== h) {
      console.log(`Resize ${size.width}, ${size.height}`);
      const dPR = 1; //renderer.getPixelRatio();
      w = size.width * dPR;
      h = size.height * dPR;
      colorFBO.setSize(w, h);
      antialiasPass.setSize(w, h);
      antialiasShader.uniforms.resolution.value.set(w, h);
      edgesPass.setSize(w, h);
      edgesShader.uniforms.resolution.value.set(w, h);
      blurHPass.setSize(w, h);
      blurShader.uniforms.resolution.value.set(w, h);
      blurVPass.setSize(w, h);
      pass.setSize(w, h);
      shader.uniforms.resolution.value.set(w, h);
    }

    renderer.setRenderTarget(colorFBO);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    antialiasPass.shader.uniforms.inputTexture.value = colorFBO.texture;
    antialiasPass.shader.uniforms.minLevel.value = params.minLevel || 0.2;
    antialiasPass.shader.uniforms.maxLevel.value = params.maxLevel || 1;
    antialiasPass.render();
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
    pass.render(true);
    // antialiasPass.shader.uniforms.minLevel.value = 0;
    // antialiasPass.shader.uniforms.maxLevel.value = 1;
    // antialiasPass.shader.uniforms.inputTexture.value = pass.fbo.texture;
    // antialiasPass.render(true);
  }

  return {
    render,
    backgroundColor: shader.uniforms.backgroundColor.value,
  };
}

export default Painted;
