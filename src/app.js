import {ArcballCamera} from "arcball_camera";
import {Controller} from "ez_canvas_controller";
import {mat4, vec3} from "gl-matrix";

import {colormaps} from "./colormaps";
import {Shader} from "./shader";
import fragmentSrc from "./volume.frag";
import vertexSrc from "./volume.vert";
import {ZipStack} from "./zipstack";

const cubeStrip = [
    1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0,
    1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0
];
const defaultEye = vec3.set(vec3.create(), 0.5, 0.5, 2.5);
const defaultCenter = vec3.set(vec3.create(), 0.5, 0.5, 0.5);
const defaultUp = vec3.set(vec3.create(), 0.0, 1.0, 0.0);

var gl = null;
var timesteps = [];

(async () => {
    var canvas = document.getElementById("webgl-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) {
        document.getElementById("webgl-canvas").setAttribute("style", "display:none;");
        document.getElementById("no-webgl").setAttribute("style", "display:block;");
        return;
    }

    document.getElementById("upload-zip").onchange = loadZipFile;

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

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    var shader = new Shader(gl, vertexSrc, fragmentSrc);

    // Upload one of the colormaps
    var colormapTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, colormapTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    {
        var colormapImage = new Image();
        colormapImage.src = colormaps["Cool Warm"];
        await colormapImage.decode();
        var bitmap = await createImageBitmap(colormapImage);
        gl.texImage2D(gl.TEXTURE_2D,
                      0,
                      gl.RGBA8,
                      colormapImage.width,
                      colormapImage.height,
                      0,
                      gl.RGBA,
                      gl.UNSIGNED_BYTE,
                      bitmap);
    }

    var animationFrame = function() {
        var resolve = null;
        var promise = new Promise(r => resolve = r);
        window.requestAnimationFrame(resolve);
        return promise
    };

    var tstep = 0;
    var frame = 0;
    requestAnimationFrame(animationFrame);
    while (true) {
        await animationFrame();
        if (document.hidden || timesteps.length == 0) {
            continue;
        }

        gl.clearColor(0.1, 0.1, 0.1, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        shader.use(gl);

        projView = mat4.mul(projView, proj, camera.camera);
        gl.uniformMatrix4fv(shader.uniforms["proj_view"], false, projView);

        var eye = [camera.invCamera[12], camera.invCamera[13], camera.invCamera[14]];
        gl.uniform3fv(shader.uniforms["eye_pos"], eye);

        var currentTimestep = timesteps[tstep];
        if (frame % 24 == 0) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_3D, currentTimestep.texture);
            tstep = (tstep + 1) % timesteps.length;
        }
        gl.uniform1i(shader.uniforms["volume"], 0);
        gl.uniform1i(shader.uniforms["colormap"], 1);

        var longestAxis =
            Math.max(currentTimestep.volumeDims[0],
                     Math.max(currentTimestep.volumeDims[1], currentTimestep.volumeDims[2]));
        var volumeScale = [
            currentTimestep.volumeDims[0] / longestAxis,
            currentTimestep.volumeDims[1] / longestAxis,
            currentTimestep.volumeDims[2] / longestAxis
        ];

        gl.uniform3iv(shader.uniforms["volume_dims"], currentTimestep.volumeDims);
        gl.uniform3fv(shader.uniforms["volume_scale"], volumeScale);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, cubeStrip.length / 3);
        gl.finish();

        frame += 1;
    }
})();

async function loadZipFile(evt)
{
    // Delete the old time series
    if (timesteps.length > 0) {
        var old = timesteps;
        timesteps = [];
        for (var i = 0; i < old.length; ++i) {
            old[i].deleteTexture(gl);
        }
    }

    var files = evt.target.files;
    console.log(files);
    if (files.length == 0) {
        return;
    }

    // Here we'd want something more intelligent to load on demand and play though
    // the textures, but this is fine for a test
    for (var i = 0; i < files.length; ++i) {
        console.log(files[i]);
        var timestep = new ZipStack(files[i]);
        await timestep.uploadToGPU(gl, 2);
        timesteps.push(timestep);
    }
}
