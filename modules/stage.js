import { Scene, Vector3 } from "three";
import { OrbitControls } from "OrbitControls";
import { renderer, onResize, camera } from "./three.js";
import { Painted } from "./painted.js";
import { refitShadowCamera } from "./three-meshline.js";

// The renderer, the scene, the camera, the controls and the accumulation buffer belong to the
// app, not to the sketches. A sketch contributes a Group and the pose it wants to be seen
// from; everything else is shared.
//
// It used to be the other way round: all 31 sketches built their own Painted, Scene, camera,
// OrbitControls and resize handler, and module caching kept every one of them alive for the
// session. Almost all of this project's switching machinery existed to manage that crowd —
// pausing 31 resize handlers, evicting render targets from 31 Painteds, tracking which of 31
// Painteds was on screen, releasing 31 shadow maps, and repairing shadow uniforms that went
// stale because 31 scenes shared one compiled program. One of each removes the problems
// rather than managing them; the shadow-uniform bug in particular cannot occur with a single
// scene, because it needs two of them sharing a program.
//
// What a sketch keeps is its Group, so returning to one is still instant: the geometry is
// never thrown away, only detached.

export const scene = new Scene();
export { camera };
export const canvas = renderer.domElement;
export const painted = new Painted();
export const controls = new OrbitControls(camera, canvas);

controls.enableDamping = true;
controls.addEventListener("change", () => painted.invalidate());

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

renderer.setClearColor(0, 0);

const _origin = new Vector3();
let _current = null;

// Puts a sketch's group on stage and frames it. The camera is not carried over between
// sketches: each one names the pose it was composed for and gets it back every time, which is
// both simpler than saving and restoring per-sketch camera state and more predictable than
// returning to whatever angle the last visit was left at.
export function show(group, pose, { screenSpacePanning = false } = {}) {
  if (_current) scene.remove(_current);
  _current = group;
  scene.add(group);

  // The controls orbit by rotating camera.up, so the last sketch's roll is still in it, and
  // they damp out momentum over several frames — both would carry into this pose.
  controls.stopMotion();
  camera.up.set(0, 1, 0);
  camera.position.copy(pose);
  camera.lookAt(_origin);
  controls.screenSpacePanning = screenSpacePanning;
  controls.target.copy(_origin);
  controls.enabled = true;
  controls.update();

  // The shadow frustum is sized from the camera distance and then frozen for the life of the
  // scene. With one scene serving every sketch that has to be redone on each change: the
  // poses range from roughly 3.6 to 26.6 units out, so without this the first sketch loaded
  // would fix the frustum for all of them and the rest would cast shadows from a box of the
  // wrong size.
  refitShadowCamera(scene);

  // The pass budget was learned from the sketch we just left and says nothing about this one.
  painted.resetPassBudget();
  painted.invalidate();
}

// Empties a sketch's group and releases what it built. Every sketch carried its own copy of
// this, in three barely-different spellings — the only real variation was whether it also swept
// group.children afterwards, so this always does.
//
// The material.dispose() matters and is not just tidiness: MeshLineMaterial.dispose also frees
// the customDepthMaterial that onBeforeRender attaches to each mesh, which nothing else owns.
export function clearGroup(group, meshes = []) {
  for (const entry of meshes) {
    const mesh = entry.mesh ?? entry;
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  }
  while (group.children.length) group.remove(group.children[0]);
  meshes.length = 0;
}

export function hide() {
  if (_current) scene.remove(_current);
  _current = null;
  controls.enabled = false;
}
