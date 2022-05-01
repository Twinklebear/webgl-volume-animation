import {ArcballCamera} from "arcball_camera";
import {Controller} from "ez_canvas_controller";
import {mat4, vec3} from "gl-matrix";
import {JSZip} from "jszip";
import {colormaps} from "./colormaps";
import {Shader} from "./shader";
import fragmentSrc from "./volume.frag";
import vertexSrc from "./volume.vert";

const cubeStrip = [
    1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0,
    1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0
];

const defaultEye = vec3.set(vec3.create(), 0.5, 0.5, 2.5);
const defaultCenter = vec3.set(vec3.create(), 0.5, 0.5, 0.5);
const defaultUp = vec3.set(vec3.create(), 0.0, 1.0, 0.0);

var gl = null;

(async () => {
    var canvas = document.getElementById("webgl-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) {
        document.getElementById("webgl-canvas").setAttribute("style", "display:none;");
        document.getElementById("no-webgl").setAttribute("style", "display:block;");
        return;
    }

    // Setup camera and camera controls
    var camera = new ArcballCamera(
        defaultEye, defaultCenter, defaultUp, 2, [canvas.width, canvas.height]);
    var proj = mat4.perspective(
        mat4.create(), 50 * Math.PI / 180.0, canvas.width / canvas.height, 0.1, 100);
    var projView = mat4.create();

    // Register mouse and touch listeners
    var controller = new Controller();
    controller.mousemove = function(prev, cur, evt) {
        if (evt.buttons == 1) {
            camera.rotate(prev, cur);

        } else if (evt.buttons == 2) {
            camera.pan([cur[0] - prev[0], prev[1] - cur[1]]);
        }
    };
    controller.wheel = function(amt) {
        camera.zoom(amt);
    };
    controller.pinch = controller.wheel;
    controller.twoFingerDrag = function(drag) {
        camera.pan(drag);
    };
    controller.registerForCanvas(canvas);

    // Setup VAO and VBO to render the cube to run the raymarching shader
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeStrip), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    var shader = new Shader(gl, vertexSrc, fragmentSrc);

    var animationFrame = function() {
        var resolve = null;
        var promise = new Promise(r => resolve = r);
        window.requestAnimationFrame(resolve);
        return promise
    };
    requestAnimationFrame(animationFrame);
    while (true) {
        await animationFrame();
        if (document.hidden) {
            continue;
        }

        gl.clearColor(0.1, 0.1, 0.1, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        shader.use(gl);

        projView = mat4.mul(projView, proj, camera.camera);
        gl.uniformMatrix4fv(shader.uniforms["proj_view"], false, projView);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, cubeStrip.length / 3);
        gl.finish();
    }
})();
