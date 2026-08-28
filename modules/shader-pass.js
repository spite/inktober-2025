import { OrthographicCamera, Scene, Mesh, PlaneGeometry } from "three";
import { getFBO } from "./fbo.js";

class ShaderPass {
  constructor(shader, options = {}, antialiased) {
    this.shader = shader;
    this.orthoScene = new Scene();
    // `toScreen` passes only ever run as render(renderer, true), which skips
    // setRenderTarget entirely — so a target of their own is never drawn into. Allocating
    // one anyway cost a full-resolution RGBA buffer, reallocated on every window resize.
    this.fbo = options.toScreen ? null : getFBO(1, 1, options, antialiased);
    this.orthoCamera = new OrthographicCamera(
      1 / -2,
      1 / 2,
      1 / 2,
      1 / -2,
      0.00001,
      1000
    );
    this.orthoQuad = new Mesh(new PlaneGeometry(1, 1), this.shader);
    this.orthoQuad.scale.set(1, 1, 1);
    this.orthoScene.add(this.orthoQuad);
    this.texture = this.fbo ? this.fbo.texture : null;
  }

  render(renderer, final) {
    if (!final) {
      renderer.setRenderTarget(this.fbo);
    }
    renderer.render(this.orthoScene, this.orthoCamera);
    renderer.setRenderTarget(null);
  }

  setSize(width, height) {
    // The quad scale and camera bounds are still needed when rendering to the screen.
    if (this.fbo) this.fbo.setSize(width, height);
    this.orthoQuad.scale.set(width, height, 1);
    this.orthoCamera.left = -width / 2;
    this.orthoCamera.right = width / 2;
    this.orthoCamera.top = height / 2;
    this.orthoCamera.bottom = -height / 2;
    this.orthoCamera.updateProjectionMatrix();
  }
}

export { ShaderPass };
