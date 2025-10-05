const shader = `
vec4 median(sampler2D tex, vec2 xy)
{
   // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = xy;
    
    vec3 p1 = textureOffset(tex, uv, ivec2(-1, -1)).xyz;
    vec3 p2 = textureOffset(tex, uv, ivec2(-1, 0)).xyz;
    vec3 p3 = textureOffset(tex, uv, ivec2(-1, 1)).xyz;
    vec3 p4 = textureOffset(tex, uv, ivec2(0, -1)).xyz;
    vec3 p5 = textureOffset(tex, uv, ivec2(0, 0)).xyz;
    vec3 p6 = textureOffset(tex, uv, ivec2(0, 1)).xyz;
    vec3 p7 = textureOffset(tex, uv, ivec2(1, -1)).xyz;
    vec3 p8 = textureOffset(tex, uv, ivec2(1, 0)).xyz;
    vec3 p9 = textureOffset(tex, uv, ivec2(1, 1)).xyz;

    vec3 op1 = min(p2, p3);
    vec3 op2 = max(p2, p3);
    vec3 op3 = min(p5, p6);
    vec3 op4 = max(p5, p6);
    vec3 op5 = min(p8, p9);
    vec3 op6 = max(p8, p9);
    vec3 op7 = min(p1, op1);
    vec3 op8 = max(p1, op1);
    vec3 op9 = min(p4, op3);
    vec3 op10 = max(p4, op3);
    vec3 op11 = min(p7, op5);
    vec3 op12 = max(p7, op5);
    vec3 op13 = min(op8, op2);
    vec3 op14 = max(op8, op2);
    vec3 op15 = min(op10, op4);
    vec3 op16 = max(op10, op4);
    vec3 op17 = min(op12, op6);
    vec3 op18 = max(op12, op6);
    vec3 op19 = max(op7, op9);
    vec3 op20 = min(op15, op17);
    vec3 op21 = max(op15, op17);
    vec3 op22 = min(op16, op18);
    vec3 op23 = max(op13, op20);
    vec3 op24 = min(op23, op21);
    vec3 op25 = min(op14, op22);
    vec3 op26 = max(op19, op11);
    vec3 op27 = min(op24, op25);
    vec3 op28 = max(op24, op25);
    vec3 op29 = max(op26, op27);
    vec3 op30 = min(op29, op28);

    return vec4(op30, 1.0);
    
}`;

export { shader };
