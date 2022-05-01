#version 300 es

layout(location = 0) in vec3 pos;

uniform mat4 proj_view;

void main(void) {
    gl_Position = proj_view * vec4(pos, 1.0);
}

