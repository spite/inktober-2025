const highPass = `
vec4 highPass(sampler2D map, vec2 uv) {

  float step_w = 1.0/resolution.x;
  float step_h = 1.0/resolution.y;

  vec2 offset[9];
  float kernel[9];

  offset[ 0 ] = vec2(-step_w, -step_h);
  offset[ 1 ] = vec2(0.0, -step_h);
  offset[ 2 ] = vec2(step_w, -step_h);

  offset[ 3 ] = vec2(-step_w, 0.0);
  offset[ 4 ] = vec2(0.0, 0.0);
  offset[ 5 ] = vec2(step_w, 0.0);

  offset[ 6 ] = vec2(-step_w, step_h);
  offset[ 7 ] = vec2(0.0, step_h);
  offset[ 8 ] = vec2(step_w, step_h);

  kernel[ 0 ] = -1.;
  kernel[ 1 ] = -1.;
  kernel[ 2 ] = -1.;

  kernel[ 3 ] = -1.;
  kernel[ 4 ] = 8.;
  kernel[ 5 ] = -1.;

  kernel[ 6 ] = -1.;
  kernel[ 7 ] = -1.;
  kernel[ 8 ] = -1.;

  int i = 0;
  vec4 sum = vec4(0.0);

  for( int i=0; i<9; i++ ) {
    for( int j=1; j<10; j++ ) {
      vec4 tmp = texture(map, uv + float(j) * offset[i]);
      sum += tmp * kernel[i];
      sum.a = 1.0;
    }
  }

  return .5 +  sum / 90.;
}
`;

export default highPass;
