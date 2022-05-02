#version 300 es

precision highp int;
precision highp float;

uniform highp sampler2D image;

out vec4 color;

// Pseudo-random number gen from
// http://www.reedbeta.com/blog/quick-and-easy-gpu-random-numbers-in-d3d11/
// with some tweaks for the range of values
float wang_hash(int seed) {
	seed = (seed ^ 61) ^ (seed >> 16);
	seed *= 9;
	seed = seed ^ (seed >> 4);
	seed *= 0x27d4eb2d;
	seed = seed ^ (seed >> 15);
	return float(seed % 2147483647) / float(2147483647);
}


void main(void) {
    //color = vec4(1.0);
    color = 5.0 * texture(image, gl_FragCoord.xy / vec2(1280, 720));
}

