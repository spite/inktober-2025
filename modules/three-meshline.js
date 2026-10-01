import {
  BufferGeometry,
  GLSL3,
  Color,
  ShaderChunk,
  Vector2,
  RepeatWrapping,
  Vector3,
  ShaderMaterial,
  UniformsLib,
  NearestFilter,
  TextureLoader,
  BufferAttribute,
  RGBADepthPacking,
  DoubleSide,
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
// Gamma on stroke colour: 1 = as written, higher = deeper.
export const inkDepth = signal(1);
const shadowMapRes = signal("2048"); // string for select

export const paperColor = signal("#ebe2d0");
export const embossAngle = signal(1.8);
export const embossEdge = signal(0.13);
export const embossStrength = signal(0.67);
export const paperStrength = signal(0.2);
export const bumpSize = signal(4); // offset in pixels
export const bumpShadow = signal(0.1); // dark end of bump shadow (0=black, 1=white)
export const shadowStrength = signal(0.2); // blend factor for the 2D ink shadow

const ADVANCED_KEY = "inktober-advanced-rendering";
const showAdvanced = signal(localStorage.getItem(ADVANCED_KEY) === "1");
effect(() => localStorage.setItem(ADVANCED_KEY, showAdvanced() ? "1" : "0"));

bindKey("KeyA", () => showAdvanced.set(!showAdvanced.peek()));

function buildRenderingPanel() {
  const gui = new GUI("Rendering", document.querySelector("#gui-container"), {
    className: "gui-rendering",
  });
  gui.rowsExpanded.set(false);
  gui.addSelect("Shadow mode", shadowMode, shadowModeOptions);
  gui.addSlider("Intensity", shadowIntensity, 0, 1, 0.01);
  gui.addSeparator();
  gui.addSlider("Dark lum", shadingDarkLum, 0, 1, 0.01);
  gui.addSlider("Bright lum", shadingBrightLum, 1, 2, 0.01);
  gui.addSlider("Dark sat", shadingDarkSat, 0, 2, 0.01);
  gui.addSlider("Bright sat", shadingBrightSat, 0, 2, 0.01);
  gui.addSeparator();
  gui.addSlider("Ink depth", inkDepth, 0.45, 1.5, 0.05);
  gui.addSeparator();
  gui.addSlider("Softness", shadowRadius, 0, 16, 0.1);
  gui.addSlider("Bias", shadowBias, -0.02, 0, 0.001);
  gui.addSelect("Shadow map res", shadowMapRes, [
    ["512", "512"],
    ["1024", "1024"],
    ["2048", "2048"],
    ["4096", "4096"],
  ]);
  gui.addSeparator();
  gui.addCheckbox("Light arrow", showLightArrow);
  gui.addCheckbox("Shadow frustum", showShadowFrustum);
  gui.addCheckbox("Shadow buffer", showShadowBuffer);
  gui.addSeparator();
  gui.addColor("Paper color", paperColor);
  gui.addSlider("Emboss angle", embossAngle, -Math.PI, Math.PI, 0.01);
  gui.addSlider("Emboss edge", embossEdge, 0, 0.5, 0.01);
  gui.addSlider("Emboss strength", embossStrength, 0, 2, 0.01);
  gui.addSlider("Paper bump", paperStrength, 0, 1, 0.01);
  gui.addSlider("Bump size", bumpSize, 0, 30, 0.5);
  gui.addSlider("Bump shadow", bumpShadow, 0, 1, 0.01);
  gui.addSlider("Shadow blend", shadowStrength, 0, 1, 0.01);

  effect(() => (showAdvanced() ? gui.show() : gui.hide()));
}
buildRenderingPanel();

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
  shadingDarkLum();
  shadingBrightLum();
  shadingDarkSat();
  shadingBrightSat();
  inkDepth();
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
    this.widthCallback = null;
  }

  get geometry() {
    return this;
  }
}

MeshLine.prototype.setPoints = function (points, wcb) {
  if (!(points instanceof Float32Array) && !(points instanceof Array)) {
    console.error(
      "ERROR: The BufferArray of points is not instancied correctly.",
    );
    return;
  }
  this.widthCallback = wcb;
  this.positions = [];
  if (points.length && points[0] instanceof Vector3) {
    // could transform Vector3 array into the array used below
    // but this approach will only loop through the array once
    // and is more performant
    for (var j = 0; j < points.length; j++) {
      var p = points[j];
      this.positions.push(p.x, p.y, p.z);
      this.positions.push(p.x, p.y, p.z);
    }
  } else {
    for (var j = 0; j < points.length; j += 3) {
      this.positions.push(points[j], points[j + 1], points[j + 2]);
      this.positions.push(points[j], points[j + 1], points[j + 2]);
    }
  }
  this.process();
};

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
      // 16-bit indices wrap past 65536 vertices.
      index: new BufferAttribute(
        vertexCount > 65536
          ? new Uint32Array(this.indices_array)
          : new Uint16Array(this.indices_array),
        1,
      ),
    };
  } else {
    // copyArray takes a plain array — it is `this.array.set(array)` — so the
    // `new Float32Array(...)` these calls used to be wrapped in allocated a full
    // throwaway copy of every buffer on the path whose whole point is not to allocate.
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
    update(this._attributes.index, this.indices_array);
  }

  this.setAttribute("position", this._attributes.position);
  this.setAttribute("previous", this._attributes.previous);
  this.setAttribute("next", this._attributes.next);
  this.setAttribute("side", this._attributes.side);
  this.setAttribute("width", this._attributes.width);
  this.setAttribute("uv", this._attributes.uv);

  this.setIndex(this._attributes.index);

  this.computeBoundingSphere();
  this.computeBoundingBox();
};

// dashArray.x tiles drawn, then dashArray.y skipped. Shared by the line and its shadow.
const DASH_GAP = `
  bool inDashGap( vec2 uv ) {
    float tile = floor( mod( uv.x + uvOffset.x, 1. ) * repeat.x + dashOffset );
    return mod( tile, dashArray.x + dashArray.y ) >= dashArray.x;
  }
`;

ShaderChunk["meshline_vert"] = `
  ${ShaderChunk.logdepthbuf_pars_vertex}
  ${ShaderChunk.fog_pars_vertex}
  ${ShaderChunk.shadowmap_pars_vertex}
  
  attribute vec3 previous;
  attribute vec3 next;
  attribute float side;
  attribute float width;
  
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
  varying float vDiffuse;
  
  vec2 fix( vec4 i, float aspect ) {  
    vec2 res = i.xy / i.w;
    res.x *= aspect;
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
  uniform vec3 lightDirection;

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

    // Expand along the light direction, as meshline_vert does for the receiver.
    vec3 expandDir = cross(lightDirection, lineDir);
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
  uniform bool useDash;
  uniform vec2 dashArray;
  uniform float dashOffset;

  varying vec2 vUV;

  out vec4 color;

  ${DASH_GAP}

  vec2 rot2d( vec2 p, float theta ) {
    return vec2( p.x * cos(theta) - p.y * sin(theta),
                 p.x * sin(theta) + p.y * cos(theta) );
  }

  void main() {
    vec2 tuv = mod( (vUV + uvOffset) * repeat, vec2(1.) );

    if( useDash && inDashGap( vUV ) ) discard;

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
  uniform bool useMap;
  uniform bool useDash;
  uniform vec2 dashArray;
  uniform float dashOffset;
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
  uniform float inkDepth;

  varying vec2 vUV;
  varying vec4 vColor;
  varying float vDiffuse;

  out vec4 color;
  
  ${DASH_GAP}

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
    c.rgb = pow( c.rgb, vec3( inkDepth ) );
    
    vec2 tuv = mod((vUV + uvOffset) * repeat, vec2(1.));
    
    if(useDash && inDashGap(vUV)) discard;
      
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

// Shared by every MeshLineMaterial; set once per pass by the scene hook.
const passUniforms = {
  time: { value: 0 },
  frameIndex: { value: 0 },
  resolution: { value: new Vector2(1, 1) },
  lightDirection: { value: new Vector3(0.408, 0.816, 0.408) },
  shadingIntensity: { value: 1 },
  shadingOnly: { value: false },
  shadingDarkLum: { value: 0.55 },
  shadingBrightLum: { value: 1.2 },
  shadingDarkSat: { value: 1.5 },
  shadingBrightSat: { value: 1.4 },
  inkDepth: { value: 1 },
};

function defineUniformAccessors(material, names) {
  for (const name of names) {
    Object.defineProperty(material, name, {
      enumerable: true,
      get() {
        return this.uniforms[name].value;
      },
      set(value) {
        this.uniforms[name].value = value;
      },
    });
  }
}

class MeshLineMaterial extends ShaderMaterial {
  constructor(parameters) {
    super({
      uniforms: Object.assign({}, UniformsLib.fog, UniformsLib.lights, passUniforms, {
        blueNoiseMap: { value: blueNoise },
        lineWidth: { value: 1 },
        map: { value: null },
        useMap: { value: false },
        color: { value: new Color(0xffffff) },
        opacity: { value: 1 },
        sizeAttenuation: { value: 1 },
        dashArray: { value: new Vector2(1, 1) },
        dashOffset: { value: 0 },
        offset: { value: 0 },
        useDash: { value: 0 },
        repeat: { value: new Vector2(1, 1) },
        uvOffset: { value: new Vector2(0, 0) },
      }),
      vertexShader: ShaderChunk.meshline_vert,
      fragmentShader: ShaderChunk.meshline_frag,
      glslVersion: GLSL3,
      lights: true,
    });
    this.isMeshLineMaterial = true;
    this.type = "MeshLineMaterial";
    this.shadowSide = DoubleSide;

    defineUniformAccessors(this, [
      "lineWidth",
      "map",
      "useMap",
      "color",
      "opacity",
      "sizeAttenuation",
      "offset",
      "dashOffset",
      "useDash",
      "repeat",
      "uvOffset",
    ]);
    Object.defineProperty(this, "dashArray", {
      enumerable: true,
      get() {
        return this.uniforms.dashArray.value;
      },
      set(value) {
        this.uniforms.dashArray.value = value;
        this.useDash = 1;
      },
    });

    this.setValues(parameters);
  }
}

MeshLineMaterial.prototype.onBeforeRender = function (renderer, scene, camera, geometry, mesh) {
  if (mesh.customDepthMaterial) return;
  const material = mesh.material;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // One per material, so dispose() can free it.
  material.__depthMaterial ??= new MeshLineDepthMaterial(material);
  mesh.customDepthMaterial = material.__depthMaterial;
};

// Disposing a line material also disposes its depth material.
const _disposeMeshLineMaterial = MeshLineMaterial.prototype.dispose;
MeshLineMaterial.prototype.dispose = function () {
  if (this.__depthMaterial) {
    this.__depthMaterial.dispose();
    this.__depthMaterial = null;
  }
  return _disposeMeshLineMaterial.call(this);
};

// Shared by reference with the line material so the shadow matches the stroke.
const LINE_UNIFORMS = [
  "map",
  "useMap",
  "opacity",
  "offset",
  "lineWidth",
  "time",
  "repeat",
  "uvOffset",
  "useDash",
  "dashArray",
  "dashOffset",
  "lightDirection",
];

class MeshLineDepthMaterial extends ShaderMaterial {
  constructor(line) {
    const uniforms = { blueNoiseMap: { value: blueNoise } };
    for (const key of LINE_UNIFORMS) uniforms[key] = line.uniforms[key];
    super({
      uniforms,
      vertexShader: ShaderChunk.meshline_depth_vert,
      fragmentShader: ShaderChunk.meshline_depth_frag,
      glslVersion: GLSL3,
    });
    this.depthPacking = RGBADepthPacking;
    this.isMeshLineDepthMaterial = true;
    this.type = "MeshLineDepthMaterial";
  }
}

let frustumR = null;
let jitterIndex = 0;
let shadowLight = null;

export function shadowMapTexture() {
  return shadowLight?.shadow.map?.texture ?? null;
}
const _lightDir = new Vector3();

export function refitShadowCamera() {
  frustumR = null;
}

function fitShadowCamera(camera, light) {
  const halfFov = (camera.fov * Math.PI) / 180 / 2;
  frustumR = camera.position.length() * Math.tan(halfFov) * 1.1;

  const cam = light.shadow.camera;
  cam.left = -frustumR;
  cam.right = frustumR;
  cam.top = frustumR;
  cam.bottom = -frustumR;
  const lightDist = frustumR * 2.5;
  cam.near = Math.max(0.1, lightDist - frustumR);
  cam.far = lightDist + frustumR;
  cam.updateProjectionMatrix();
}

export function installLineLighting(scene) {
  const light = (shadowLight = new DirectionalLight(0xffffff, 1.0));
  light.shadow.mapSize.set(2048, 2048);
  scene.add(light, light.target);

  const arrow = new ArrowHelper(new Vector3(0, -1, 0), new Vector3(), 1, 0xffff00, 0.15, 0.06);
  const frustumHelper = new CameraHelper(light.shadow.camera);
  scene.add(arrow, frustumHelper);

  const onBeforeRender = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, scene, camera, renderTarget) {
    onBeforeRender.call(this, renderer, scene, camera, renderTarget);

    const mode = shadowMode();
    light.castShadow = mode !== "off";

    const wantRes = parseInt(shadowMapRes());
    if (light.shadow.mapSize.width !== wantRes) {
      light.shadow.mapSize.set(wantRes, wantRes);
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
    light.shadow.radius = shadowRadius();
    light.shadow.bias = shadowBias();

    if (frustumR === null) fitShadowCamera(camera, light);

    const a = embossAngle();
    _lightDir
      .set(Math.cos(a), Math.sin(a), 1.0)
      .normalize()
      .transformDirection(camera.matrixWorld);
    light.position.copy(_lightDir).multiplyScalar(frustumR * 2.5);
    // World matrices are already updated when this hook runs.
    light.updateMatrixWorld();

    passUniforms.lightDirection.value.copy(_lightDir);
    passUniforms.time.value = performance.now() / 1000;
    passUniforms.frameIndex.value = ++jitterIndex;
    passUniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
    passUniforms.shadingIntensity.value = mode === "off" ? 0 : shadowIntensity();
    passUniforms.shadingOnly.value = mode === "only";
    passUniforms.shadingDarkLum.value = shadingDarkLum();
    passUniforms.shadingBrightLum.value = shadingBrightLum();
    passUniforms.shadingDarkSat.value = shadingDarkSat();
    passUniforms.shadingBrightSat.value = shadingBrightSat();
    passUniforms.inkDepth.value = inkDepth();

    frustumHelper.visible = showShadowFrustum();
    if (frustumHelper.visible) frustumHelper.update();

    arrow.visible = showLightArrow();
    if (arrow.visible) {
      arrow.position.copy(light.position);
      arrow.setDirection(_lightDir.copy(light.position).negate().normalize());
      arrow.setLength(light.position.length(), 0.15, 0.06);
    }
  };

}

export { MeshLine, MeshLineMaterial };
