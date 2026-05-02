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
} from "three";
import GUI from "./gui.js";
import { signal, effect } from "./reactive.js";

const loader = new TextureLoader();
const blueNoise = loader.load("./assets/bluenoise64.png");
blueNoise.wrapS = blueNoise.wrapT = RepeatWrapping;
blueNoise.minFilter = blueNoise.magFilter = NearestFilter;

const shadowMode = signal("on"); // "on" | "off" | "only"
const shadowModeOptions = [
  ["on",   "Shadow on"],
  ["off",  "Shadow off"],
  ["only", "Only shadow"],
];
const shadowIntensity  = signal(0.5);
const shadowRadius     = signal(4);
const shadowBias       = signal(-0.005);
const showLightArrow   = signal(true);
const shadingDarkLum   = signal(0.55);
const shadingBrightLum = signal(1.2);
const shadingDarkSat   = signal(1.5);
const shadingBrightSat = signal(1.4);
const shadowMapRes     = signal("2048"); // string for select
const castJitterScale  = signal(4);

export const embossAngle    = signal(-Math.PI / 4); // vec3(1,-1,0) normalised ≈ -45°
export const embossEdge     = signal(0.1);
export const embossStrength = signal(0.25);
export const paperStrength  = signal(0.2);
export const bumpSize       = signal(10);   // offset in pixels
export const bumpShadow     = signal(0.9);  // dark end of bump shadow (0=black, 1=white)

// Shared GUI — created lazily, repositioned to end of #gui-container once per scene
// so it always follows the active sketch's own params panel.
let _sharedGui = null;
const _sharedGuiScenes = new WeakSet();
function ensureSharedGUI(scene) {
  const container = document.querySelector("#gui-container");
  if (!container) return;
  if (!_sharedGui) {
    _sharedGui = new GUI("Rendering", container);
    _sharedGui.addSelect("Shadow mode", shadowModeOptions, shadowMode);
    _sharedGui.addSlider("Intensity",       shadowIntensity,  0,     1,    0.01);
    _sharedGui.addSeparator();
    _sharedGui.addSlider("Dark lum",        shadingDarkLum,   0,     1,    0.01);
    _sharedGui.addSlider("Bright lum",      shadingBrightLum, 1,     2,    0.01);
    _sharedGui.addSlider("Dark sat",        shadingDarkSat,   0,     2,    0.01);
    _sharedGui.addSlider("Bright sat",      shadingBrightSat, 0,     2,    0.01);
    _sharedGui.addSeparator();
    _sharedGui.addSlider("Softness",        shadowRadius,     0,     16,   0.1);
    _sharedGui.addSlider("Cast jitter",     castJitterScale,  0,     32,   0.1);
    _sharedGui.addSlider("Bias",            shadowBias,       -0.02, 0,    0.001);
    _sharedGui.addSelect("Shadow map res",  [["512","512"],["1024","1024"],["2048","2048"],["4096","4096"]], shadowMapRes);
    _sharedGui.addSeparator();
    _sharedGui.addCheckbox("Light arrow", showLightArrow);
    _sharedGui.addSeparator();
    _sharedGui.addSlider("Emboss angle",    embossAngle,    -Math.PI, Math.PI, 0.01);
    _sharedGui.addSlider("Emboss edge",     embossEdge,     0,        0.5,     0.01);
    _sharedGui.addSlider("Emboss strength", embossStrength, 0,        2,       0.01);
    _sharedGui.addSlider("Paper",           paperStrength,  0,        1,       0.01);
    _sharedGui.addSlider("Bump size",       bumpSize,       0,        30,      0.5);
    _sharedGui.addSlider("Bump shadow",     bumpShadow,     0,        1,       0.01);
    _sharedGui.show();
  }
  if (!_sharedGuiScenes.has(scene)) {
    _sharedGuiScenes.add(scene);
    container.appendChild(_sharedGui.container);
  }
}

// Invalidation registry — any Painted instance can subscribe.
const _shadowChangeCallbacks = [];
export function onShadowChange(fn) {
  _shadowChangeCallbacks.push(fn);
}
let _shadowInitialized = false;
effect(() => {
  shadowMode(); shadowIntensity(); shadowRadius(); shadowBias(); showLightArrow();
  shadingDarkLum(); shadingBrightLum(); shadingDarkSat(); shadingBrightSat();
  shadowMapRes(); castJitterScale();
  if (_shadowInitialized) {
    for (const fn of _shadowChangeCallbacks) fn();
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
      "ERROR: The BufferArray of points is not instancied correctly."
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
        interSegment
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

  // redefining the attribute seems to prevent range errors
  // if the user sets a differing number of vertices
  if (
    !this._attributes ||
    this._attributes.position.count !== this.positions.length
  ) {
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
    this._attributes.position.copyArray(new Float32Array(this.positions));
    this._attributes.position.needsUpdate = true;
    this._attributes.previous.copyArray(new Float32Array(this.previous));
    this._attributes.previous.needsUpdate = true;
    this._attributes.next.copyArray(new Float32Array(this.next));
    this._attributes.next.needsUpdate = true;
    this._attributes.side.copyArray(new Float32Array(this.side));
    this._attributes.side.needsUpdate = true;
    this._attributes.width.copyArray(new Float32Array(this.width));
    this._attributes.width.needsUpdate = true;
    this._attributes.uv.copyArray(new Float32Array(this.uvs));
    this._attributes.uv.needsUpdate = true;
    this._attributes.index.copyArray(new Uint16Array(this.indices_array));
    this._attributes.index.needsUpdate = true;
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
  ${ShaderChunk.fog_vertex}
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
  uniform bool useNormalMap;
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
  uniform sampler2D normalMap;
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
    // Single jittered tap per frame — temporal accumulation builds soft shadow.
    // Direction rotates by the golden angle each frame (guaranteed 2D disk coverage).
    // Blue noise drives the magnitude so samples don't all land on the same circle.
    float _st = time * 2.3999632;
    vec2 _sNoiseUV = rot2d( gl_FragCoord.xy / vec2( textureSize( blueNoiseMap, 0 ).xy ), _st );
    float _sMag = texture( blueNoiseMap, _sNoiseUV ).r;
    vec2 shadowJitter = vec2( cos( _st ), sin( _st ) ) * _sMag;

    float shadowFactor = 1.0;
    #pragma unroll_loop_start
    for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
      vec4 sc = vDirectionalShadowCoord[ i ];
      sc.xyz /= sc.w;
      sc.z += directionalLightShadows[ i ].shadowBias;

      bool inFrustum = sc.x >= 0.0 && sc.x <= 1.0 && sc.y >= 0.0 && sc.y <= 1.0;
      if ( inFrustum && sc.z <= 1.0 ) {
        vec2 jitter = shadowJitter * directionalLightShadows[ i ].shadowRadius
                      / directionalLightShadows[ i ].shadowMapSize;
        shadowFactor *= texture2DCompare( directionalShadowMap[ i ], sc.xy + jitter, sc.z );
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
        normalMap: { value: null },
        useNormalMap: { value: false },
        color: { value: new Color(0xffffff) },
        opacity: { value: 1 },
        resolution: { value: new Vector2(1, 1) },
        sizeAttenuation: { value: 1 },
        depthWrite: { value: 1 },
        depthTest: { value: 1 },
        dashArray: { value: 0 },
        dashOffset: { value: 0 },
        offset: { value: 0 },
        dashRatio: { value: 0.5 },
        dashArray: { value: new Vector2(1, 1) },
        useDash: { value: 0 },
        visibility: { value: 1 },
        alphaTest: { value: 0 },
        time: { value: 0 },
        repeat: { value: new Vector2(1, 1) },
        uvOffset: { value: new Vector2(0, 0) },
        lightDirection:    { value: new Vector3(0.408, 0.816, 0.408) },
        shadingIntensity:  { value: 0.5 },
        shadingOnly:       { value: true },
        shadingDarkLum:    { value: 0.55 },
        shadingBrightLum:  { value: 1.2 },
        shadingDarkSat:    { value: 1.5 },
        shadingBrightSat:  { value: 1.4 },
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
      normalMap: {
        enumerable: true,
        get: function () {
          return this.uniforms.normalMap.value;
        },
        set: function (value) {
          this.uniforms.normalMap.value = value;
        },
      },
      useNormalMap: {
        enumerable: true,
        get: function () {
          return this.uniforms.useNormalMap.value;
        },
        set: function (value) {
          this.uniforms.useNormalMap.value = value;
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
          this.uniforms.time.value.copy(value);
        },
      },
    });

    this.setValues(parameters);
  }
}

const _lightDir = new Vector3();
const _lightRight = new Vector3();
const _lightUp = new Vector3();

function fitShadowCamera(scene, camera, light) {
  // Scene is framed to fill the camera view, so use the camera's frustum
  // dimensions at the scene center (origin) as the shadow coverage area.
  // This correctly accounts for shader-driven line widths that Box3 misses.
  const camDist = camera.position.length();
  const halfFov = (camera.fov * Math.PI / 180) / 2;
  const halfH = camDist * Math.tan(halfFov);
  const halfW = halfH * camera.aspect;
  const r = Math.sqrt(halfW * halfW + halfH * halfH);

  if (!light.target.parent) scene.add(light.target);
  light.target.updateMatrixWorld();

  const cam = light.shadow.camera;
  cam.left = -r;
  cam.right = r;
  cam.top = r;
  cam.bottom = -r;
  const lightDist = light.position.length();
  cam.near = Math.max(0.1, lightDist - r);
  cam.far = lightDist + r;
  cam.updateProjectionMatrix();
  scene.userData.__meshlineShadowFrustumR = r;
}

MeshLineMaterial.prototype.onBeforeRender = (...args) => {
  const renderer = args[0];
  const scene = args[1];
  const camera = args[2];
  const canvas = renderer.domElement;
  const mesh = args[4];
  const t = performance.now() / 1000;
  ensureSharedGUI(scene);

  const w = canvas.width;
  const h = canvas.height;
  mesh.material.uniforms.time.value = t;
  mesh.material.uniforms.resolution.value.set(w, h);

  // Apply shared shadow mode and settings to this material.
  const mode = shadowMode();
  mesh.material.uniforms.shadingIntensity.value  = mode === "off" ? 0.0 : shadowIntensity();
  mesh.material.uniforms.shadingOnly.value       = mode === "only";
  mesh.material.uniforms.shadingDarkLum.value    = shadingDarkLum();
  mesh.material.uniforms.shadingBrightLum.value  = shadingBrightLum();
  mesh.material.uniforms.shadingDarkSat.value    = shadingDarkSat();
  mesh.material.uniforms.shadingBrightSat.value  = shadingBrightSat();
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

    const lightDir = new Vector3().subVectors(new Vector3(0, 0, 0), dir.position).normalize();
    const arrow = new ArrowHelper(lightDir, dir.position, dir.position.length(), 0xffff00, 0.15, 0.06);
    scene.add(arrow);
    scene.userData.__meshlineLightArrow = arrow;

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
          shadowLight.shadow.mapSize.width  = wantRes;
          shadowLight.shadow.mapSize.height = wantRes;
          shadowLight.shadow.map?.dispose();
          shadowLight.shadow.map = null;
        }

        shadowLight.shadow.radius = shadowRadius();
        shadowLight.shadow.bias   = shadowBias();

        // Fit frustum from camera FOV + distance (no bounding box needed).
        fitShadowCamera(scene, camera, shadowLight);
        const r = scene.userData.__meshlineShadowFrustumR;

        // Camera-relative "top-left-back" light direction.
        _lightDir.set(-1, 1, 1).transformDirection(camera.matrixWorld);
        scene.userData.__meshlineShadowBasePos.copy(_lightDir).multiplyScalar(r * 2.5);
        scene.userData.__meshlineLightDir.copy(_lightDir);

        // Cast-side jitter — golden-angle disk coverage for soft shadows.
        const jitterRadius = castJitterScale() * r / shadowLight.shadow.mapSize.width;
        const jitterIndex  = scene.userData.__meshlineJitterIndex ?? 0;
        scene.userData.__meshlineJitterIndex = jitterIndex + 1;
        const angle = jitterIndex * 2.3999632;
        _lightRight.setFromMatrixColumn(shadowLight.shadow.camera.matrixWorld, 0);
        _lightUp.setFromMatrixColumn(shadowLight.shadow.camera.matrixWorld, 1);
        shadowLight.position
          .copy(scene.userData.__meshlineShadowBasePos)
          .addScaledVector(_lightRight, Math.cos(angle) * jitterRadius)
          .addScaledVector(_lightUp,    Math.sin(angle) * jitterRadius);

        // Arrow helper.
        const arrow = scene.userData.__meshlineLightArrow;
        if (arrow) {
          arrow.visible = showLightArrow();
          arrow.position.copy(scene.userData.__meshlineShadowBasePos);
          _lightDir.set(0, 0, 0).sub(scene.userData.__meshlineShadowBasePos).normalize();
          arrow.setDirection(_lightDir);
          arrow.setLength(scene.userData.__meshlineShadowBasePos.length(), 0.15, 0.06);
        }
      };
    })(scene.onBeforeRender);
  }

  // Auto-enable shadow casting/receiving on the mesh.
  if (!mesh.castShadow) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  // Auto-create a matching depth material for shadow casting.
  if (!mesh.customDepthMaterial) {
    const mat = mesh.material;
    mesh.customDepthMaterial = new MeshLineDepthMaterial({
      map: mat.uniforms.map?.value,
      useMap: mat.uniforms.useMap?.value ? 1 : 0,
      opacity: mat.uniforms.opacity?.value ?? 1,
      offset: mat.uniforms.offset?.value ?? 0,
    });
    mesh.customDepthMaterial.lineWidth = mat.lineWidth;
  }

  // Keep light direction in sync — written by the scene-level hook each frame.
  const lightDirStore = scene.userData.__meshlineLightDir;
  if (lightDirStore) {
    mesh.material.uniforms.lightDirection.value.copy(lightDirStore);
  }

  if (mesh.customDepthMaterial?.uniforms) {
    mesh.customDepthMaterial.lineWidth = mesh.material.lineWidth;
    mesh.customDepthMaterial.uniforms.time.value = t;
    mesh.customDepthMaterial.uniforms.resolution.value.set(w, h);
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

class MeshLineDepthMaterial extends ShaderMaterial {
  constructor(parameters) {
    super({
      uniforms: {
        blueNoiseMap:    { value: blueNoise },
        lineWidth:       { value: 1 },
        map:             { value: null },
        useMap:          { value: false },
        opacity:         { value: 1 },
        resolution:      { value: new Vector2(1, 1) },
        time:            { value: 0 },
        repeat:          { value: new Vector2(1, 1) },
        uvOffset:        { value: new Vector2(0, 0) },
        offset:          { value: 0 },
      },
      vertexShader:   ShaderChunk.meshline_depth_vert,
      fragmentShader: ShaderChunk.meshline_depth_frag,
      glslVersion:    GLSL3,
    });
    this.depthPacking = RGBADepthPacking;
    this.isMeshLineDepthMaterial = true;
    this.type = "MeshLineDepthMaterial";

    Object.defineProperties(this, {
      lineWidth: {
        enumerable: true,
        get: function() { return this.uniforms.lineWidth.value; },
        set: function(v) { this.uniforms.lineWidth.value = v; },
      },
      map: {
        enumerable: true,
        get: function() { return this.uniforms.map.value; },
        set: function(v) { this.uniforms.map.value = v; },
      },
      useMap: {
        enumerable: true,
        get: function() { return this.uniforms.useMap.value; },
        set: function(v) { this.uniforms.useMap.value = v; },
      },
      opacity: {
        enumerable: true,
        get: function() { return this.uniforms.opacity.value; },
        set: function(v) { this.uniforms.opacity.value = v; },
      },
      resolution: {
        enumerable: true,
        get: function() { return this.uniforms.resolution.value; },
        set: function(v) { this.uniforms.resolution.value.copy(v); },
      },
      repeat: {
        enumerable: true,
        get: function() { return this.uniforms.repeat.value; },
        set: function(v) { this.uniforms.repeat.value.copy(v); },
      },
      uvOffset: {
        enumerable: true,
        get: function() { return this.uniforms.uvOffset.value; },
        set: function(v) { this.uniforms.uvOffset.value.copy(v); },
      },
      offset: {
        enumerable: true,
        get: function() { return this.uniforms.offset.value; },
        set: function(v) { this.uniforms.offset.value = v; },
      },
    });

    this.setValues(parameters);
  }
}

export { MeshLine, MeshLineMaterial, MeshLineDepthMaterial };
