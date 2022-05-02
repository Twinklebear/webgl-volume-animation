#version 300 es

layout(location = 0) in vec3 pos;

uniform mat4 proj_view;
uniform vec3 eye_pos;
uniform vec3 volume_scale;

out vec3 vray_dir;
flat out vec3 transformed_eye;

void main(void) {
    vec3 volume_translation = vec3(0.5) - volume_scale * 0.5;
    gl_Position = proj_view * vec4(pos * volume_scale + volume_translation, 1);
    transformed_eye = (eye_pos - volume_translation) / volume_scale;
    vray_dir = pos - transformed_eye;
}
