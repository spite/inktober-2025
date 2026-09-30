import {
  BufferGeometry,
  GLSL3,
  Color,
  ShaderChunk,
  Vector2,
  RepeatWrapping,
  Vector3,
  ShaderMaterial,
  Matrix4,
  UniformsLib,
  NearestFilter,
  TextureLoader,
  BufferAttribute,
  RGBADepthPacking,
  DoubleSide,
  AmbientLight,
  DirectionalLight,
  ArrowHelper,
  CameraHelper,
} from "three";
import GUI from "./gui.js";
import { signal, effect } from "./reactive.js";
import { bindKey } from "guspira";

const loader = new TextureLoader();
const blueNoise = loader.load("./assets/bluenoise64.png");
blueNoise.wrapS = blueNoise.wrapT = RepeatWrapping;
blueNoise.minFilter = blueNoise.magFilter = NearestFilter;

const shadowMode = signal("on"); // "on" | "off" | "only"
const shadowModeOptions = [
  ["on", "Shadow on"],
  ["off", "Shadow off"],
  ["only", "Only shadow"],
];
const shadowIntensity = signal(1);
const shadowRadius = signal(16);
const shadowBias = signal(-0.02);
const showLightArrow = signal(false);
const showShadowFrustum = signal(false);
export const showShadowBuffer = signal(false);
const shadingDarkLum = signal(0.55);
const shadingBrightLum = signal(1.2);
const shadingDarkSat = signal(1.5);
const shadingBrightSat = signal(1.4);
const shadowMapRes = signal("2048"); // string for select

export const paperColor = signal("#f6f2e9");
export const embossAngle = signal(1.8);
export const embossEdge = signal(0.13);
export const embossStrength = signal(0.67);
export const paperStrength = signal(0.2);
export const bumpSize = signal(4); // offset in pixels
export const bumpShadow = signal(0.1); // dark end of bump shadow (0=black, 1=white)
export const shadowStrength = signal(0.2); // blend factor for the 2D ink shadow

// Shared GUI — created lazily, repositioned to end of #gui-container once per scene
// so it always follows the active sketch's own params panel.
//
// It is advanced: shadow modes, luminance ranges and shadow-map resolution are for tuning the
// look of the renderer, not for playing with a sketch, and having it open alongside the
// sketch's own panel is what filled the screen. Hidden by default, toggled with A, and the
// choice is remembered — so it stays out of the way until it is wanted, and stays available
// once it is.
const ADVANCED_KEY = "inktober-advanced-rendering";
const showAdvanced = signal(localStorage.getItem(ADVANCED_KEY) === "1");
effect(() => localStorage.setItem(ADVANCED_KEY, showAdvanced() ? "1" : "0"));

bindKey("KeyA", () => showAdvanced.set(!showAdvanced.peek()));

let _sharedGui = null;
// Called from MeshLineMaterial.onBeforeRender, which three.js runs per mesh per draw call
// -- so per mesh, per shadow and colour pass, per accumulation pass. Past the first call it
// must return without touching the DOM.
function ensureSharedGUI() {
  if (_sharedGui) return;

  const container = document.querySelector("#gui-container");
  if (!container) return;
  // The class puts it after the sketch's own panel. It is created on the first render,
  // after that sketch's panel but before any sketch imported later, so document order
  // alone would put it above every panel but the first.
  _sharedGui = new GUI("Rendering", container, { className: "gui-rendering" });
  _sharedGui.rowsExpanded.set(false);
  _sharedGui.addSelect("Shadow mode", shadowMode, shadowModeOptions);
  _sharedGui.addSlider("Intensity", shadowIntensity, 0, 1, 0.01);
  _sharedGui.addSeparator();
  _sharedGui.addSlider("Dark lum", shadingDarkLum, 0, 1, 0.01);
  _sharedGui.addSlider("Bright lum", shadingBrightLum, 1, 2, 0.01);
  _sharedGui.addSlider("Dark sat", shadingDarkSat, 0, 2, 0.01);
  _sharedGui.addSlider("Bright sat", shadingBrightSat, 0, 2, 0.01);
  _sharedGui.addSeparator();
  _sharedGui.addSlider("Softness", shadowRadius, 0, 16, 0.1);
  _sharedGui.addSlider("Bias", shadowBias, -0.02, 0, 0.001);
  _sharedGui.addSelect("Shadow map res", shadowMapRes, [
    ["512", "512"],
    ["1024", "1024"],
    ["2048", "2048"],
    ["4096", "4096"],
  ]);
  _sharedGui.addSeparator();
  _sharedGui.addCheckbox("Light arrow", showLightArrow);
  _sharedGui.addCheckbox("Shadow frustum", showShadowFrustum);
  _sharedGui.addCheckbox("Shadow buffer", showShadowBuffer);
  _sharedGui.addSeparator();
  _sharedGui.addColor("Paper color", paperColor);
  _sharedGui.addSlider("Emboss angle", embossAngle, -Math.PI, Math.PI, 0.01);
  _sharedGui.addSlider("Emboss edge", embossEdge, 0, 0.5, 0.01);
  _sharedGui.addSlider("Emboss strength", embossStrength, 0, 2, 0.01);
  _sharedGui.addSlider("Paper bump", paperStrength, 0, 1, 0.01);
  _sharedGui.addSlider("Bump size", bumpSize, 0, 30, 0.5);
  _sharedGui.addSlider("Bump shadow", bumpShadow, 0, 1, 0.01);
  _sharedGui.addSlider("Shadow blend", shadowStrength, 0, 1, 0.01);

  // The panel is built either way — doing it lazily on a keypress would mean the first press
  // appearing to do nothing while two dozen rows were constructed. Only its visibility
  // follows the flag, and this replaces the unconditional show() that used to be here.
  effect(() => (showAdvanced() ? _sharedGui.show() : _sharedGui.hide()));
}

// The Painted whose accumulation the shadow controls below re-run. There is one, owned by the
// stage, and it registers itself when it is built.
let _activePainted = null;
export function registerActivePainted(painted) {
  _activePainted = painted;
}
let _shadowInitialized = false;
effect(() => {
  shadowMode();
  shadowIntensity();
  shadowRadius();
  shadowBias();
  showLightArrow();
  showShadowFrustum();
  showShadowBuffer();
  shadingDarkLum();
  shadingBrightLum();
  shadingDarkSat();
  shadingBrightSat();
  shadowMapRes();
  if (_shadowInitialized) {
    _activePainted?.softInvalidate();
  } else {
    _shadowInitialized = true;
  }
});

class MeshLine extends BufferGeometry {
  constructor() {
    super();
    this.isMeshLine = true;
    this.type = "MeshLine";

    this.positions = [];

    this.previous = [];
    this.next = [];
    this.side = [];
    this.width = [];
    this.indices_array = [];
    this.uvs = [];
    this.counters = [];
    this._points = [];
    this._geom = null;

    this.widthCallback = null;

    // Used to raycast
    this.matrixWorld = new Matrix4();

    Object.defineProperties(this, {
      // this is now a bufferGeometry
      // add getter to support previous api
      geometry: {
        enumerable: true,
        get: function () {
          return this;
        },
      },
      geom: {
        enumerable: true,
        get: function () {
          return this._geom;
        },
        set: function (value) {
          this.setGeometry(value, this.widthCallback);
        },
      },
      // for declaritive architectures
      // to return the same value that sets the points
      // eg. this.points = points
      // console.log(this.points) -> points
      points: {
        enumerable: true,
        get: function () {
          return this._points;
        },
        set: function (value) {
          this.setPoints(value, this.widthCallback);
        },
      },
    });
  }
}

MeshLine.prototype.setMatrixWorld = function (matrixWorld) {
  this.matrixWorld = matrixWorld;
};

// setting via a geometry is rather superfluous
// as you're creating a unecessary geometry just to throw away
// but exists to support previous api
MeshLine.prototype.setGeometry = function (g, c) {
  // as the input geometry are mutated we store them
  // for later retreival when necessary (declaritive architectures)
  this._geometry = g;
  this.setPoints(g.getAttribute("position").array, c);
};

MeshLine.prototype.setPoints = function (points, wcb) {
  if (!(points instanceof Float32Array) && !(points instanceof Array)) {
    console.error(
      "ERROR: The BufferArray of points is not instancied correctly.",
    );
    return;
  }
  // as the points are mutated we store them
  // for later retreival when necessary (declaritive architectures)
  this._points = points;
  this.widthCallback = wcb;
  this.positions = [];
  this.counters = [];
  if (points.length && points[0] instanceof Vector3) {
    // could transform Vector3 array into the array used below
    // but this approach will only loop through the array once
    // and is more performant
    for (var j = 0; j < points.length; j++) {
      var p = points[j];
      var c = j / points.length;
      this.positions.push(p.x, p.y, p.z);
      this.positions.push(p.x, p.y, p.z);
      this.counters.push(c);
      this.counters.push(c);
    }
  } else {
    for (var j = 0; j < points.length; j += 3) {
      var c = j / points.length;
      this.positions.push(points[j], points[j + 1], points[j + 2]);
      this.positions.push(points[j], points[j + 1], points[j + 2]);
      this.counters.push(c);
      this.counters.push(c);
    }
  }
  this.process();
};

function MeshLineRaycast(raycaster, intersects) {
  var inverseMatrix = new Matrix4();
  var ray = new Ray();
  var sphere = new Sphere();
  var interRay = new Vector3();
  var geometry = this.geometry;
  // Checking boundingSphere distance to ray

  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  sphere.copy(geometry.boundingSphere);
  sphere.applyMatrix4(this.matrixWorld);

  if (raycaster.ray.intersectSphere(sphere, interRay) === false) {
    return;
  }

  inverseMatrix.copy(this.matrixWorld).invert();
  ray.copy(raycaster.ray).applyMatrix4(inverseMatrix);

  var vStart = new Vector3();
  var vEnd = new Vector3();
  var interSegment = new Vector3();
  var step = this instanceof LineSegments ? 2 : 1;
  var index = geometry.index;
  var attributes = geometry.attributes;

  if (index !== null) {
    var indices = index.array;
    var positions = attributes.position.array;
    var widths = attributes.width.array;

    for (var i = 0, l = indices.length - 1; i < l; i += step) {
      var a = indices[i];
      var b = indices[i + 1];

      vStart.fromArray(positions, a * 3);
      vEnd.fromArray(positions, b * 3);
      var width =
        widths[Math.floor(i / 3)] !== undefined ? widths[Math.floor(i / 3)] : 1;
      var precision =
        raycaster.params.Line.threshold + (this.material.lineWidth * width) / 2;
      var precisionSq = precision * precision;

      var distSq = ray.distanceSqToSegment(
        vStart,
        vEnd,
        interRay,
        interSegment,
      );

      if (distSq > precisionSq) continue;

      interRay.applyMatrix4(this.matrixWorld); //Move back to world space for distance calculation

      var distance = raycaster.ray.origin.distanceTo(interRay);

      if (distance < raycaster.near || distance > raycaster.far) continue;

      intersects.push({
        distance: distance,
        // What do we want? intersection point on the ray or on the segment??
        // point: raycaster.ray.at( distance ),
        point: interSegment.clone().applyMatrix4(this.matrixWorld),
        index: i,
        face: null,
        faceIndex: null,
        object: this,
      });
      // make event only fire once
      i = l;
    }
  }
}
MeshLine.prototype.raycast = MeshLineRaycast;
MeshLine.prototype.compareV3 = function (a, b) {
  var aa = a * 6;
  var ab = b * 6;
  return (
    this.positions[aa] === this.positions[ab] &&
    this.positions[aa + 1] === this.positions[ab + 1] &&
    this.positions[aa + 2] === this.positions[ab + 2]
  );
};

MeshLine.prototype.copyV3 = function (a) {
  var aa = a * 6;
  return [this.positions[aa], this.positions[aa + 1], this.positions[aa + 2]];
};

MeshLine.prototype.process = function () {
  var l = this.positions.length / 6;

  this.previous = [];
  this.next = [];
  this.side = [];
  this.width = [];
  this.indices_array = [];
  this.uvs = [];

  var w;

  var v;
  // initial previous points
  if (this.compareV3(0, l - 1)) {
    v = this.copyV3(l - 2);
  } else {
    v = this.copyV3(0);
  }
  this.previous.push(v[0], v[1], v[2]);
  this.previous.push(v[0], v[1], v[2]);

  for (var j = 0; j < l; j++) {
    // sides
    this.side.push(1);
    this.side.push(-1);

    // widths
    if (this.widthCallback) w = this.widthCallback(j / (l - 1));
    else w = 1;
    this.width.push(w);
    this.width.push(w);

    // uvs
    this.uvs.push(j / (l - 1), 0);
    this.uvs.push(j / (l - 1), 1);

    if (j < l - 1) {
      // points previous to poisitions
      v = this.copyV3(j);
      this.previous.push(v[0], v[1], v[2]);
      this.previous.push(v[0], v[1], v[2]);

      // indices
      var n = j * 2;
      this.indices_array.push(n, n + 1, n + 2);
      this.indices_array.push(n + 2, n + 1, n + 3);
    }
    if (j > 0) {
      // points after poisitions
      v = this.copyV3(j);
      this.next.push(v[0], v[1], v[2]);
      this.next.push(v[0], v[1], v[2]);
    }
  }

  // last next point
  if (this.compareV3(l - 1, 0)) {
    v = this.copyV3(1);
  } else {
    v = this.copyV3(l - 1);
  }
  this.next.push(v[0], v[1], v[2]);
  this.next.push(v[0], v[1], v[2]);

  // Redefining the attributes prevents range errors when the caller sets a differing
  // number of vertices; when the count is unchanged the buffers are refreshed in place,
  // which is a sub-buffer upload rather than eight fresh allocations and a full one.
  //
  // The guard used to compare `position.count` against `this.positions.length`. count is
  // the number of vertices — array.length / itemSize — so the two were only ever equal
  // when both were zero, and the reuse branch below had never once run. Every setPoints
  // reallocated. That is what circle.js's fixed `segments` argument and sketch 31's
  // ARC_SEGMENTS were written to avoid: 31 redraws every growing arc each frame.
  const vertexCount = this.positions.length / 3;
  if (!this._attributes || this._attributes.position.count !== vertexCount) {
    this._attributes = {
      position: new BufferAttribute(new Float32Array(this.positions), 3),
      previous: new BufferAttribute(new Float32Array(this.previous), 3),
      next: new BufferAttribute(new Float32Array(this.next), 3),
      side: new BufferAttribute(new Float32Array(this.side), 1),
      width: new BufferAttribute(new Float32Array(this.width), 1),
      uv: new BufferAttribute(new Float32Array(this.uvs), 2),
      index: new BufferAttribute(new Uint16Array(this.indices_array), 1),
      counters: new BufferAttribute(new Float32Array(this.counters), 1),
    };
  } else {
    // copyArray takes a plain array — it is `this.array.set(array)` — so the
    // `new Float32Array(...)` these calls used to be wrapped in allocated a full
    // throwaway copy of every buffer on the path whose whole point is not to allocate.
    //
    // `counters` is refreshed here too. It was the one attribute the branch left alone,
    // which never showed because the branch was unreachable, but counters is rebuilt by
    // setPoints on every call and drives the dash pattern through vCounters.
    const update = (attribute, data) => {
      attribute.copyArray(data);
      attribute.needsUpdate = true;
    };
    update(this._attributes.position, this.positions);
    update(this._attributes.previous, this.previous);
    update(this._attributes.next, this.next);
    update(this._attributes.side, this.side);
    update(this._attributes.width, this.width);
    update(this._attributes.uv, this.uvs);
    update(this._attributes.counters, this.counters);
    update(this._attributes.index, this.indices_array);
  }

  this.setAttribute("position", this._attributes.position);
  this.setAttribute("previous", this._attributes.previous);
  this.setAttribute("next", this._attributes.next);
  this.setAttribute("side", this._attributes.side);
  this.setAttribute("width", this._attributes.width);
  this.setAttribute("uv", this._attributes.uv);
  this.setAttribute("counters", this._attributes.counters);

  this.setIndex(this._attributes.index);

  this.computeBoundingSphere();
  this.computeBoundingBox();
};

function memcpy(src, srcOffset, dst, dstOffset, length) {
  var i;

  src = src.subarray || src.slice ? src : src.buffer;
  dst = dst.subarray || dst.slice ? dst : dst.buffer;

  src = srcOffset
    ? src.subarray
      ? src.subarray(srcOffset, length && srcOffset + length)
      : src.slice(srcOffset, length && srcOffset + length)
    : src;

  if (dst.set) {
    dst.set(src, dstOffset);
  } else {
    for (i = 0; i < src.length; i++) {
      dst[i + dstOffset] = src[i];
    }
  }

  return dst;
}

/**
 * Fast method to advance the line by one position.  The oldest position is removed.
 * @param position
 */
MeshLine.prototype.advance = function (position) {
  var positions = this._attributes.position.array;
  var previous = this._attributes.previous.array;
  var next = this._attributes.next.array;
  var l = positions.length;

  // PREVIOUS
  memcpy(positions, 0, previous, 0, l);

  // POSITIONS
  memcpy(positions, 6, positions, 0, l - 6);

  positions[l - 6] = position.x;
  positions[l - 5] = position.y;
  positions[l - 4] = position.z;
  positions[l - 3] = position.x;
  positions[l - 2] = position.y;
  positions[l - 1] = position.z;

  // NEXT
  memcpy(positions, 6, next, 0, l - 6);

  next[l - 6] = position.x;
  next[l - 5] = position.y;
  next[l - 4] = position.z;
  next[l - 3] = position.x;
  next[l - 2] = position.y;
  next[l - 1] = position.z;

  this._attributes.position.needsUpdate = true;
  this._attributes.previous.needsUpdate = true;
  this._attributes.next.needsUpdate = true;
};

ShaderChunk["meshline_vert"] = `
  ${ShaderChunk.logdepthbuf_pars_vertex}
  ${ShaderChunk.fog_pars_vertex}
  ${ShaderChunk.shadowmap_pars_vertex}
  
  attribute vec3 previous;
  attribute vec3 next;
  attribute float side;
  attribute float width;
  attribute float counters;
  
  uniform vec2 resolution;
  uniform float lineWidth;
  uniform vec3 color;
  uniform float opacity;
  uniform float sizeAttenuation;
  uniform sampler2D blueNoiseMap;
  uniform float time;
  uniform vec3 lightDirection;

  varying vec2 vUV;
  varying vec4 vColor;
  varying float vCounters;
  varying float vDiffuse;
  
  vec2 fix( vec4 i, float aspect ) {  
    vec2 res = i.xy / i.w;
    res.x *= aspect;
    vCounters = counters;
    return res;
  }
  

  vec2 rot2d(vec2 position, float theta) {
    float dx = position.x * cos(theta) - position.y * sin(theta);
    float dy = position.x * sin(theta) + position.y * cos(theta);
	  return vec2(dx, dy);
  }

  void main() {
  
      float aspect = resolution.x / resolution.y;
  
      vColor = vec4( color, opacity );
      vUV = uv;
  
      mat4 m = projectionMatrix * modelViewMatrix;
      vec4 finalPosition = m * vec4( position, 1.0 );
      vec4 prevPos = m * vec4( previous, 1.0 );
      vec4 nextPos = m * vec4( next, 1.0 );
  
      vec2 currentP = fix( finalPosition, aspect );
      vec2 prevP = fix( prevPos, aspect );
      vec2 nextP = fix( nextPos, aspect );
  
      float w = lineWidth * width;
  
      vec2 dir;
      if( nextP == currentP ) dir = normalize( currentP - prevP );
      else if( prevP == currentP ) dir = normalize( nextP - currentP );
      else {
          vec2 dir1 = normalize( currentP - prevP );
          vec2 dir2 = normalize( nextP - currentP );
          dir = normalize( dir1 + dir2 );
  
          vec2 perp = vec2( -dir1.y, dir1.x );
          vec2 miter = vec2( -dir.y, dir.x );
          //w = clamp( w / dot( miter, perp ), 0., 4. * lineWidth * width );
  
      }
  
      //vec2 normal = ( cross( vec3( dir, 0. ), vec3( 0., 0., 1. ) ) ).xy;
      vec4 normal = vec4( -dir.y, dir.x, 0., 1. );
      normal.xy *= .5 * w;
      normal *= projectionMatrix;
      if( sizeAttenuation == 0. ) {
          normal.xy *= finalPosition.w;
          normal.xy /= ( vec4( resolution, 0., 1. ) * projectionMatrix ).xy;
      }
  
      finalPosition.xy += normal.xy * side;

      vec2 uv = finalPosition.xy;
      uv = rot2d(uv, time);
      uv += length(position);
      finalPosition.z += .001 * texture(blueNoiseMap, uv).r;
  
      gl_Position = finalPosition;

  // Cylindrical diffuse: treat the ribbon as a tube so shading is independent
  // of the camera angle. Project the camera direction onto the plane perpendicular
  // to the line, giving the surface normal of an imaginary cylinder.
  vec3 _wPos  = (modelMatrix * vec4(position,  1.0)).xyz;
  vec3 _wPrev = (modelMatrix * vec4(previous,  1.0)).xyz;
  vec3 _wNext = (modelMatrix * vec4(next,      1.0)).xyz;
  vec3 _lineDir;
  if      (distance(_wNext, _wPos)  < 0.0001) _lineDir = normalize(_wPos  - _wPrev);
  else if (distance(_wPos,  _wPrev) < 0.0001) _lineDir = normalize(_wNext - _wPos);
  else                                          _lineDir = normalize(_wNext - _wPrev);
  vec3 _toCam     = normalize(cameraPosition - _wPos);
  vec3 _cylNormal = normalize(_toCam - dot(_toCam, _lineDir) * _lineDir);
  vDiffuse = 0.5 + 0.5 * max(0.0, dot(_cylNormal, lightDirection));

  #if defined( USE_SHADOWMAP )
      // Use the same world-space expanded position as the depth material so the
      // shadow lookup point matches the geometry recorded in the shadow map.
      vec3 _toLight    = lightDirection;
      vec3 _shadowExp  = cross(_toLight, _lineDir);
      if (length(_shadowExp) < 0.0001) _shadowExp = vec3(0.0, 1.0, 0.0);
      _shadowExp = normalize(_shadowExp);
      vec3 _expandedWPos = _wPos + _shadowExp * (lineWidth * width * 0.5) * side;
      vec4 _worldPosition = vec4(_expandedWPos, 1.0);
      #if NUM_DIR_LIGHT_SHADOWS > 0
        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
          vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * _worldPosition;
        }
        #pragma unroll_loop_end
      #endif
  #endif

  ${ShaderChunk.logdepthbuf_vertex}
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  ${ShaderChunk.fog_vertex}
  }
`;

ShaderChunk["meshline_depth_vert"] = `
  attribute vec3 previous;
  attribute vec3 next;
  attribute float side;
  attribute float width;

  uniform float lineWidth;

  varying vec2 vUV;

  void main() {
    vUV = uv;

    // Expand in world space so the shadow width is camera-independent.
    // MeshLine ribbons face whatever camera renders them, so a clip-space
    // expansion would make the ribbon face the light, collapsing its shadow
    // to a thin line. Instead we treat the ribbon as a cylinder: expand
    // perpendicular to both the line direction and the light direction.
    vec3 wPos  = (modelMatrix * vec4(position,  1.0)).xyz;
    vec3 wPrev = (modelMatrix * vec4(previous,  1.0)).xyz;
    vec3 wNext = (modelMatrix * vec4(next,      1.0)).xyz;

    vec3 lineDir;
    if      (distance(wNext, wPos)  < 0.0001) lineDir = normalize(wPos  - wPrev);
    else if (distance(wPos,  wPrev) < 0.0001) lineDir = normalize(wNext - wPos);
    else                                       lineDir = normalize(wNext - wPrev);

    vec3 toLight   = normalize(cameraPosition - wPos);
    vec3 expandDir = cross(toLight, lineDir);
    if (length(expandDir) < 0.0001) expandDir = vec3(0.0, 1.0, 0.0);
    expandDir = normalize(expandDir);

    vec3 expanded = wPos + expandDir * (lineWidth * width * 0.5) * side;
    gl_Position = projectionMatrix * viewMatrix * vec4(expanded, 1.0);
  }
`;

ShaderChunk["meshline_depth_frag"] = `
  ${ShaderChunk.packing}

  uniform sampler2D map;
  uniform bool useMap;
  uniform sampler2D blueNoiseMap;
  uniform float opacity;
  uniform float time;
  uniform vec2 repeat;
  uniform vec2 uvOffset;
  uniform float offset;

  varying vec2 vUV;

  out vec4 color;

  vec2 rot2d( vec2 p, float theta ) {
    return vec2( p.x * cos(theta) - p.y * sin(theta),
                 p.x * sin(theta) + p.y * cos(theta) );
  }

  void main() {
    vec2 tuv = mod( (vUV + uvOffset) * repeat, vec2(1.) );

    vec4 t = vec4(1.);
    if( useMap ) {
      float e = .01;
      if( tuv.x < e || tuv.x > 1. - e || tuv.y < e || tuv.y > 1. - e ) {
        discard;
      }
      t = texture( map, tuv );
    }

    float alpha = t.r * opacity;

    vec2 uv = vUV * 100.;
    uv = rot2d( uv, time );
    uv += offset * 100.;

    if( texture(blueNoiseMap, uv).r > alpha ) {
      discard;
    }

    color = packDepthToRGBA( gl_FragCoord.z );
  }
`;

ShaderChunk["meshline_frag"] = `
  ${ShaderChunk.fog_pars_fragment}
  ${ShaderChunk.logdepthbuf_pars_fragment}
  ${ShaderChunk.packing}
  ${ShaderChunk.shadowmap_pars_fragment}
  
  uniform sampler2D map;
  uniform sampler2D alphaMap;
  uniform bool useMap;
  uniform bool useAlphaMap;
  uniform bool useDash;
  uniform vec2 dashArray;
  uniform float dashOffset;
  uniform float dashRatio;
  uniform float visibility;
  uniform float alphaTest;
  uniform vec2 repeat;
  uniform vec2 uvOffset;
  uniform sampler2D blueNoiseMap;
  uniform vec2 resolution;
  uniform float offset;
  uniform float opacity;
  uniform float time;
  uniform float frameIndex;
  uniform float shadingIntensity;
  uniform bool shadingOnly;
  uniform float shadingDarkLum;
  uniform float shadingBrightLum;
  uniform float shadingDarkSat;
  uniform float shadingBrightSat;

  varying vec2 vUV;
  varying vec4 vColor;
  varying float vCounters;
  varying float vDiffuse;

  out vec4 color;
  
  float blueNoise(in vec2 uv) {
    return texture(blueNoiseMap, uv).r;
  }

  float gradientNoise(in vec2 uv) {
    return fract(52.9829189 * fract(dot(uv, vec2(0.06711056, 0.00583715))));
  }

  vec2 rot2d(vec2 position, float theta) {
    float dx = position.x * cos(theta) - position.y * sin(theta);
    float dy = position.x * sin(theta) + position.y * cos(theta);
	  return vec2(dx, dy);
  }

  float fmod(in float x, in float y) {
    return x - y * trunc(x/y);
  }

  vec2 fmod(in vec2 x, in vec2 y) {
    return x - y * trunc(x/y);
  }

  vec3 rgb2hsl( vec3 c ) {
    float mx = max( c.r, max( c.g, c.b ) );
    float mn = min( c.r, min( c.g, c.b ) );
    float l = ( mx + mn ) * 0.5;
    if ( mx == mn ) return vec3( 0.0, 0.0, l );
    float d = mx - mn;
    float s = l > 0.5 ? d / ( 2.0 - mx - mn ) : d / ( mx + mn );
    float h;
    if      ( mx == c.r ) h = ( c.g - c.b ) / d + ( c.g < c.b ? 6.0 : 0.0 );
    else if ( mx == c.g ) h = ( c.b - c.r ) / d + 2.0;
    else                  h = ( c.r - c.g ) / d + 4.0;
    return vec3( h / 6.0, s, l );
  }

  float hue2rgb( float p, float q, float t ) {
    t = fract( t );
    if ( t < 1.0/6.0 ) return p + ( q - p ) * 6.0 * t;
    if ( t < 0.5      ) return q;
    if ( t < 2.0/3.0  ) return p + ( q - p ) * ( 2.0/3.0 - t ) * 6.0;
    return p;
  }

  vec3 hsl2rgb( vec3 c ) {
    if ( c.y == 0.0 ) return vec3( c.z );
    float q = c.z < 0.5 ? c.z * ( 1.0 + c.y ) : c.z + c.y - c.z * c.y;
    float p = 2.0 * c.z - q;
    return vec3( hue2rgb( p, q, c.x + 1.0/3.0 ),
                 hue2rgb( p, q, c.x ),
                 hue2rgb( p, q, c.x - 1.0/3.0 ) );
  }

  // factor 0 = dark/shadowed, factor 1 = fully lit
  vec3 applyShading( vec3 rgb, float factor ) {
    vec3 hsl = rgb2hsl( rgb );
    hsl.z = mix( hsl.z * shadingDarkLum,                min( hsl.z * shadingBrightLum, 1.0 ), factor );
    hsl.y = mix( min( hsl.y * shadingDarkSat,   1.0 ),  min( hsl.y * shadingBrightSat, 1.0 ), factor );
    return hsl2rgb( hsl );
  }

  void main() {

    ${ShaderChunk.logdepthbuf_fragment}

    vec4 c = vColor;
    
    vec2 tuv = mod((vUV + uvOffset) * repeat, vec2(1.));
    
    if(useDash) {
      float dash = (vCounters + uvOffset.x) * repeat.x + dashOffset;
      float i = floor((mod(vUV.x + uvOffset.x, 1.)) * repeat.x + dashOffset);
      if((mod(i, length(dashArray))) >= dashArray.x) {
        discard;
      }
    }
      
    vec4 t = vec4(1.);
    if(useMap) {
      float e = .01;
      if(tuv.x < e || tuv.x > 1. - e  || tuv.y < e  || tuv.y > 1. - e ) {
        discard;
      }
        
      t = texture(map, tuv);
    }
  
    float alpha = t.r * opacity;

    vec2 uv = vUV * 100.;
    uv = rot2d(uv, time);
    uv += offset * 100.;

    if(blueNoise(uv) > alpha) {
      discard;
    }
    
    c.a = t.r;

    if ( shadingOnly ) c.rgb = vec3( 1.0 );
    c.rgb = mix( c.rgb, applyShading( c.rgb, vDiffuse ), shadingIntensity );

  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    // N taps per frame on a Vogel spiral — each frame advances N steps so the
    // spiral continues seamlessly across accumulated frames with no gaps.
    // N taps per pass reduces per-frame variance by sqrt(N) vs a single tap.
    const int N_SHADOW_TAPS = 4;

    float shadowFactor = 1.0;
    #pragma unroll_loop_start
    for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
      vec4 sc = vDirectionalShadowCoord[ i ];
      sc.xyz /= sc.w;
      sc.z += directionalLightShadows[ i ].shadowBias;

      bool inFrustum = sc.x >= 0.0 && sc.x <= 1.0 && sc.y >= 0.0 && sc.y <= 1.0;
      if ( inFrustum && sc.z <= 1.0 ) {
        float tapSum = 0.0;
        for (int s = 0; s < N_SHADOW_TAPS; s++) {
          float sampleIdx = frameIndex * float(N_SHADOW_TAPS) + float(s);
          float angle = sampleIdx * 2.3999632;
          float mag = fract(gradientNoise(gl_FragCoord.xy) + fract(sampleIdx * 0.6180339887));
          vec2 jitter = vec2(cos(angle), sin(angle)) * mag
                        * directionalLightShadows[ i ].shadowRadius
                        / directionalLightShadows[ i ].shadowMapSize;
          tapSum += texture2DCompare( directionalShadowMap[ i ], sc.xy + jitter, sc.z );
        }
        shadowFactor *= tapSum / float(N_SHADOW_TAPS);
      }
    }
    #pragma unroll_loop_end

    c.rgb = mix( c.rgb, applyShading( c.rgb, shadowFactor ), shadingIntensity );
  #endif

    color = c;

    ${ShaderChunk.fog_fragment}
  }`;

class MeshLineMaterial extends ShaderMaterial {
  constructor(parameters) {
    super({
      uniforms: Object.assign({}, UniformsLib.fog, UniformsLib.lights, {
        blueNoiseMap: { value: blueNoise },
        lineWidth: { value: 1 },
        map: { value: null },
        useMap: { value: false },
        alphaMap: { value: null },
        useAlphaMap: { value: false },
        color: { value: new Color(0xffffff) },
        opacity: { value: 1 },
        resolution: { value: new Vector2(1, 1) },
        sizeAttenuation: { value: 1 },
        depthWrite: { value: 1 },
        depthTest: { value: 1 },
        dashArray: { value: new Vector2(1, 1) },
        dashOffset: { value: 0 },
        offset: { value: 0 },
        dashRatio: { value: 0.5 },
        useDash: { value: 0 },
        visibility: { value: 1 },
        alphaTest: { value: 0 },
        time: { value: 0 },
        frameIndex: { value: 0 },
        repeat: { value: new Vector2(1, 1) },
        uvOffset: { value: new Vector2(0, 0) },
        lightDirection: { value: new Vector3(0.408, 0.816, 0.408) },
        shadingIntensity: { value: 0.5 },
        shadingOnly: { value: true },
        shadingDarkLum: { value: 0.55 },
        shadingBrightLum: { value: 1.2 },
        shadingDarkSat: { value: 1.5 },
        shadingBrightSat: { value: 1.4 },
      }),
      vertexShader: ShaderChunk.meshline_vert,
      fragmentShader: ShaderChunk.meshline_frag,
      glslVersion: GLSL3,
      lights: true,
    });
    this.isMeshLineMaterial = true;
    this.type = "MeshLineMaterial";
    this.shadowSide = DoubleSide;

    Object.defineProperties(this, {
      lineWidth: {
        enumerable: true,
        get: function () {
          return this.uniforms.lineWidth.value;
        },
        set: function (value) {
          this.uniforms.lineWidth.value = value;
        },
      },
      map: {
        enumerable: true,
        get: function () {
          return this.uniforms.map.value;
        },
        set: function (value) {
          this.uniforms.map.value = value;
        },
      },
      useMap: {
        enumerable: true,
        get: function () {
          return this.uniforms.useMap.value;
        },
        set: function (value) {
          this.uniforms.useMap.value = value;
        },
      },
      alphaMap: {
        enumerable: true,
        get: function () {
          return this.uniforms.alphaMap.value;
        },
        set: function (value) {
          this.uniforms.alphaMap.value = value;
        },
      },
      useAlphaMap: {
        enumerable: true,
        get: function () {
          return this.uniforms.useAlphaMap.value;
        },
        set: function (value) {
          this.uniforms.useAlphaMap.value = value;
        },
      },
      color: {
        enumerable: true,
        get: function () {
          return this.uniforms.color.value;
        },
        set: function (value) {
          this.uniforms.color.value = value;
        },
      },
      opacity: {
        enumerable: true,
        get: function () {
          return this.uniforms.opacity.value;
        },
        set: function (value) {
          this.uniforms.opacity.value = value;
        },
      },
      resolution: {
        enumerable: true,
        get: function () {
          return this.uniforms.resolution.value;
        },
        set: function (value) {
          this.uniforms.resolution.value.copy(value);
        },
      },
      sizeAttenuation: {
        enumerable: true,
        get: function () {
          return this.uniforms.sizeAttenuation.value;
        },
        set: function (value) {
          this.uniforms.sizeAttenuation.value = value;
        },
      },
      dashArray: {
        enumerable: true,
        get: function () {
          return this.uniforms.dashArray.value;
        },
        set: function (value) {
          this.uniforms.dashArray.value = value;
          this.useDash = value !== 0 ? 1 : 0;
        },
      },
      offset: {
        enumerable: true,
        get: function () {
          return this.uniforms.offset.value;
        },
        set: function (value) {
          this.uniforms.offset.value = value;
        },
      },
      dashOffset: {
        enumerable: true,
        get: function () {
          return this.uniforms.dashOffset.value;
        },
        set: function (value) {
          this.uniforms.dashOffset.value = value;
        },
      },
      dashRatio: {
        enumerable: true,
        get: function () {
          return this.uniforms.dashRatio.value;
        },
        set: function (value) {
          this.uniforms.dashRatio.value = value;
        },
      },
      useDash: {
        enumerable: true,
        get: function () {
          return this.uniforms.useDash.value;
        },
        set: function (value) {
          this.uniforms.useDash.value = value;
        },
      },
      visibility: {
        enumerable: true,
        get: function () {
          return this.uniforms.visibility.value;
        },
        set: function (value) {
          this.uniforms.visibility.value = value;
        },
      },
      alphaTest: {
        enumerable: true,
        get: function () {
          return this.uniforms.alphaTest.value;
        },
        set: function (value) {
          this.uniforms.alphaTest.value = value;
        },
      },
      repeat: {
        enumerable: true,
        get: function () {
          return this.uniforms.repeat.value;
        },
        set: function (value) {
          this.uniforms.repeat.value.copy(value);
        },
      },
      uvOffset: {
        enumerable: true,
        get: function () {
          return this.uniforms.uvOffset.value;
        },
        set: function (value) {
          this.uniforms.uvOffset.value.copy(value);
        },
      },
      time: {
        enumerable: true,
        get: function () {
          return this.uniforms.time.value;
        },
        set: function (value) {
          this.uniforms.time.value = value;
        },
      },
    });

    this.setValues(parameters);
  }
}

const _lightDir = new Vector3();

function fitShadowCamera(scene, camera, light) {
  // Frozen on first call — r must not change after the initial framing.
  if (scene.userData.__meshlineShadowFrustumR) return;

  const camDist = camera.position.length();
  const halfFov = (camera.fov * Math.PI) / 180 / 2;
  const halfH = camDist * Math.tan(halfFov);
  // Use halfH (vertical content radius) + 10% padding instead of the diagonal.
  // All sketches share camera distance ≈ 9.36 with FOV 35°, so this produces
  // the same r ≈ 3.25 for every sketch regardless of aspect ratio.
  const r = halfH * 1.1;

  _applyShadowRadius(scene, light, r);
}

function _applyShadowRadius(scene, light, r) {
  if (!light.target.parent) scene.add(light.target);
  light.target.updateMatrixWorld();

  const cam = light.shadow.camera;
  cam.left = -r;
  cam.right = r;
  cam.top = r;
  cam.bottom = -r;
  // Light is placed at r * 2.5 from the origin (set in onBeforeRender),
  // so use that distance — not light.position.length() which reflects the
  // initial placeholder position before the first frame repositions the light.
  const lightDist = r * 2.5;
  cam.near = Math.max(0.1, lightDist - r);
  cam.far = lightDist + r;
  cam.updateProjectionMatrix();
  scene.userData.__meshlineShadowFrustumR = r;
}

// Drops the frozen frustum radius so the next frame fits it again from the current camera.
//
// fitShadowCamera deliberately computes r once and then leaves it alone — it must not drift
// while a drawing is on screen. That was safe while every sketch owned its own scene. With
// one scene shared across all of them it is not: the sketches' camera distances run from
// about 3.6 to 26.6, so whichever loaded first would otherwise impose its frustum on every
// sketch after it, and their shadows would be cast from a box the wrong size.
export function refitShadowCamera(scene) {
  scene.userData.__meshlineShadowFrustumR = null;
}

// Call before the first render to override the auto-computed frustum radius.
// r is the half-width of the square shadow frustum in world units.
export function setShadowRadius(scene, r) {
  scene.userData.__meshlineShadowFrustumR = r; // freeze early so fitShadowCamera skips
  const light = scene.userData.__meshlineShadowLight;
  if (light) _applyShadowRadius(scene, light, r); // apply if light already exists
}

MeshLineMaterial.prototype.onBeforeRender = (renderer, scene, camera, _geometry, mesh) => {
  const canvas = renderer.domElement;
  const t = scene.userData.__meshlineFrameTime ?? performance.now() / 1000;
  ensureSharedGUI();

  const w = canvas.width;
  const h = canvas.height;
  mesh.material.uniforms.time.value = t;
  mesh.material.uniforms.frameIndex.value =
    scene.userData.__meshlineJitterIndex ?? 0;
  mesh.material.uniforms.resolution.value.set(w, h);

  // Apply shared shadow mode and settings to this material.
  const mode = shadowMode();
  mesh.material.uniforms.shadingIntensity.value =
    mode === "off" ? 0.0 : shadowIntensity();
  mesh.material.uniforms.shadingOnly.value = mode === "only";
  mesh.material.uniforms.shadingDarkLum.value = shadingDarkLum();
  mesh.material.uniforms.shadingBrightLum.value = shadingBrightLum();
  mesh.material.uniforms.shadingDarkSat.value = shadingDarkSat();
  mesh.material.uniforms.shadingBrightSat.value = shadingBrightSat();
  if (mesh.customDepthMaterial) {
    mesh.customDepthMaterial.visible = mode !== "off";
  }

  // Auto-add a fixed shadow light to any scene that doesn't have one yet.
  if (!scene.userData.__meshlineShadowLight) {
    const ambient = new AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const dir = new DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 10, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.camera.left = -6;
    dir.shadow.camera.right = 6;
    dir.shadow.camera.top = 6;
    dir.shadow.camera.bottom = -6;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 30;
    dir.shadow.bias = shadowBias();
    dir.shadow.radius = shadowRadius();
    scene.add(dir);

    scene.userData.__meshlineShadowLight = dir;
    scene.userData.__meshlineAmbientLight = ambient;
    scene.userData.__meshlineShadowBasePos = dir.position.clone();
    scene.userData.__meshlineLightDir = new Vector3();

    const lightDir = new Vector3()
      .subVectors(new Vector3(0, 0, 0), dir.position)
      .normalize();
    const arrow = new ArrowHelper(
      lightDir,
      dir.position,
      dir.position.length(),
      0xffff00,
      0.15,
      0.06,
    );
    scene.add(arrow);
    scene.userData.__meshlineLightArrow = arrow;

    const frustumHelper = new CameraHelper(dir.shadow.camera);
    frustumHelper.visible = false;
    scene.add(frustumHelper);
    scene.userData.__meshlineShadowFrustumHelper = frustumHelper;

    // Install a scene-level hook that runs BEFORE the shadow pass each frame,
    // so the shadow map always uses the current frame's light position.
    scene.onBeforeRender = (function (origHook) {
      return function (renderer, scene, camera) {
        origHook?.call(this, renderer, scene, camera);
        const shadowLight = scene.userData.__meshlineShadowLight;
        if (!shadowLight) return;

        // Shadow map resolution — rebuild if changed.
        const wantRes = parseInt(shadowMapRes());
        if (shadowLight.shadow.mapSize.width !== wantRes) {
          shadowLight.shadow.mapSize.width = wantRes;
          shadowLight.shadow.mapSize.height = wantRes;
          shadowLight.shadow.map?.dispose();
          shadowLight.shadow.map = null;
        }

        shadowLight.shadow.radius = shadowRadius();
        shadowLight.shadow.bias = shadowBias();

        // Fit frustum from camera FOV + distance (no bounding box needed).
        fitShadowCamera(scene, camera, shadowLight);
        const r = scene.userData.__meshlineShadowFrustumR;

        // Light direction follows emboss angle in camera space.
        const _a = embossAngle();
        _lightDir.set(Math.cos(_a), Math.sin(_a), 1.0).normalize().transformDirection(camera.matrixWorld);
        scene.userData.__meshlineShadowBasePos
          .copy(_lightDir)
          .multiplyScalar(r * 2.5);
        scene.userData.__meshlineLightDir.copy(_lightDir);

        scene.userData.__meshlineJitterIndex = (scene.userData.__meshlineJitterIndex ?? 0) + 1;
        scene.userData.__meshlineFrameTime = performance.now() / 1000;
        shadowLight.position.copy(scene.userData.__meshlineShadowBasePos);

        // Frustum helper.
        const frustumHelper = scene.userData.__meshlineShadowFrustumHelper;
        if (frustumHelper) {
          frustumHelper.visible = showShadowFrustum();
          if (frustumHelper.visible) frustumHelper.update();
        }

        // Arrow helper.
        const arrow = scene.userData.__meshlineLightArrow;
        if (arrow) {
          arrow.visible = showLightArrow();
          arrow.position.copy(scene.userData.__meshlineShadowBasePos);
          _lightDir
            .set(0, 0, 0)
            .sub(scene.userData.__meshlineShadowBasePos)
            .normalize();
          arrow.setDirection(_lightDir);
          arrow.setLength(
            scene.userData.__meshlineShadowBasePos.length(),
            0.15,
            0.06,
          );
        }
      };
    })(scene.onBeforeRender);
  }

  // Auto-enable shadow casting/receiving on the mesh.
  if (!mesh.castShadow) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  // Auto-create a matching depth material for shadow casting. Paired to the material it
  // was derived from, so disposing that one disposes this one too -- see the dispose
  // override below. Nothing else can free it: it is created here, at render time, and the
  // sketches only ever see mesh.material.
  if (!mesh.customDepthMaterial) {
    const mat = mesh.material;
    mesh.customDepthMaterial = new MeshLineDepthMaterial({
      map: mat.uniforms.map?.value,
      useMap: mat.uniforms.useMap?.value ? 1 : 0,
      opacity: mat.uniforms.opacity?.value ?? 1,
      offset: mat.uniforms.offset?.value ?? 0,
    });
    mesh.customDepthMaterial.lineWidth = mat.lineWidth;
    mat.__depthMaterial = mesh.customDepthMaterial;
  }

  // Keep light direction in sync — written by the scene-level hook each frame.
  const lightDirStore = scene.userData.__meshlineLightDir;
  if (lightDirStore) {
    mesh.material.uniforms.lightDirection.value.copy(lightDirStore);
  }

  if (mesh.customDepthMaterial?.uniforms) {
    mesh.customDepthMaterial.lineWidth = mesh.material.lineWidth;
    mesh.customDepthMaterial.uniforms.time.value = t;
  }
};

MeshLineMaterial.prototype.copy = function (source) {
  ShaderMaterial.prototype.copy.call(this, source);

  this.lineWidth = source.lineWidth;
  this.map = source.map;
  this.useMap = source.useMap;
  this.alphaMap = source.alphaMap;
  this.useAlphaMap = source.useAlphaMap;
  this.color.copy(source.color);
  this.opacity = source.opacity;
  this.resolution.copy(source.resolution);
  this.time.copy(source.time);
  this.sizeAttenuation = source.sizeAttenuation;
  this.dashArray.copy(source.dashArray);
  this.dashOffset.copy(source.dashOffset);
  this.offset.copy(source.offset);
  this.dashRatio.copy(source.dashRatio);
  this.useDash = source.useDash;
  this.visibility = source.visibility;
  this.alphaTest = source.alphaTest;
  this.repeat.copy(source.repeat);
  this.uvOffset.copy(source.uvOffset);

  return this;
};

// Every sketch's clearScene() disposes mesh.material on rebuild, and used to leave the
// depth material that onBeforeRender had quietly attached to the mesh behind. Nothing
// referenced it any more and nothing freed it, so each rebuild leaked one shader material
// per line: with a couple of hundred lines and a slider being dragged, that is thousands of
// live materials and a program whose usedTimes climbed by ~50 per rebuild and never came
// back down. Pairing the two here means the existing dispose() calls free both.
const _disposeMeshLineMaterial = MeshLineMaterial.prototype.dispose;
MeshLineMaterial.prototype.dispose = function () {
  if (this.__depthMaterial) {
    this.__depthMaterial.dispose();
    this.__depthMaterial = null;
  }
  return _disposeMeshLineMaterial.call(this);
};

class MeshLineDepthMaterial extends ShaderMaterial {
  constructor(parameters) {
    super({
      uniforms: {
        blueNoiseMap: { value: blueNoise },
        lineWidth: { value: 1 },
        map: { value: null },
        useMap: { value: false },
        opacity: { value: 1 },
        resolution: { value: new Vector2(1, 1) },
        time: { value: 0 },
        repeat: { value: new Vector2(1, 1) },
        uvOffset: { value: new Vector2(0, 0) },
        offset: { value: 0 },
      },
      vertexShader: ShaderChunk.meshline_depth_vert,
      fragmentShader: ShaderChunk.meshline_depth_frag,
      glslVersion: GLSL3,
    });
    this.depthPacking = RGBADepthPacking;
    this.isMeshLineDepthMaterial = true;
    this.type = "MeshLineDepthMaterial";

    Object.defineProperties(this, {
      lineWidth: {
        enumerable: true,
        get: function () {
          return this.uniforms.lineWidth.value;
        },
        set: function (v) {
          this.uniforms.lineWidth.value = v;
        },
      },
      map: {
        enumerable: true,
        get: function () {
          return this.uniforms.map.value;
        },
        set: function (v) {
          this.uniforms.map.value = v;
        },
      },
      useMap: {
        enumerable: true,
        get: function () {
          return this.uniforms.useMap.value;
        },
        set: function (v) {
          this.uniforms.useMap.value = v;
        },
      },
      opacity: {
        enumerable: true,
        get: function () {
          return this.uniforms.opacity.value;
        },
        set: function (v) {
          this.uniforms.opacity.value = v;
        },
      },
      resolution: {
        enumerable: true,
        get: function () {
          return this.uniforms.resolution.value;
        },
        set: function (v) {
          this.uniforms.resolution.value.copy(v);
        },
      },
      repeat: {
        enumerable: true,
        get: function () {
          return this.uniforms.repeat.value;
        },
        set: function (v) {
          this.uniforms.repeat.value.copy(v);
        },
      },
      uvOffset: {
        enumerable: true,
        get: function () {
          return this.uniforms.uvOffset.value;
        },
        set: function (v) {
          this.uniforms.uvOffset.value.copy(v);
        },
      },
      offset: {
        enumerable: true,
        get: function () {
          return this.uniforms.offset.value;
        },
        set: function (v) {
          this.uniforms.offset.value = v;
        },
      },
    });

    this.setValues(parameters);
  }
}

export { MeshLine, MeshLineMaterial, MeshLineDepthMaterial };
