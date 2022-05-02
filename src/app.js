import {ArcballCamera} from "arcball_camera";
import {Controller} from "ez_canvas_controller";
import {mat4, vec3} from "gl-matrix";
import JSZip from "jszip";
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
var volumeTexture = null;
var volumeDims = [0, 0, 0];
var volumeReady = false;

(async () => {
    var canvas = document.getElementById("webgl-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) {
        document.getElementById("webgl-canvas").setAttribute("style", "display:none;");
        document.getElementById("no-webgl").setAttribute("style", "display:block;");
        return;
    }

    document.getElementById("upload-zip").onchange = uploadZip;

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
        if (document.hidden || !volumeReady) {
            continue;
        }

        gl.clearColor(0.1, 0.1, 0.1, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        shader.use(gl);

        projView = mat4.mul(projView, proj, camera.camera);
        gl.uniformMatrix4fv(shader.uniforms["proj_view"], false, projView);
        gl.uniform1i(shader.uniforms["image"], 0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, cubeStrip.length / 3);
        gl.finish();
    }
})();

export function uploadZip(evt)
{
    var files = evt.target.files;
    console.log(files);

    var file = files[0];
    JSZip.loadAsync(file).then(async function(zip) {
        var slices = zip.file(/\.webp/);
        for (var i = 0; i < slices.length; ++i) {
            console.log(slices[i].name);
        }

        // Load the first slice to determine the volume dimensions
        var buf = await slices[0].async("arraybuffer");
        var blob = new Blob([buf], ["image/webp"]);
        var img = await createImageBitmap(blob);
        console.log(img);

        volumeDims = [img.width, img.height, slices.length];
        console.log(volumeDims);

        volumeTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, volumeTexture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        // gl.texStorage3D(gl.TEXTURE_2D, 1, gl.R8, volumeDims[0], volumeDims[1],
        // volumeDims[2]);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, volumeDims[0], volumeDims[1]);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // Write the first slice, since we've already loaded it
        gl.texSubImage2D(gl.TEXTURE_2D,
                         0,
                         0,
                         0,
                         volumeDims[0],
                         volumeDims[1],
                         gl.RED,
                         gl.UNSIGNED_BYTE,
                         img);
        volumeReady = true;

        /*
        gl.bindTexture(gl.TEXTURE_3D, volumeTexture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, volumeDims[0], volumeDims[1], volumeDims[2]);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // Write the first slice, since we've already loaded it
        gl.texSubImage3D(gl.TEXTURE_3D,
                         0,
                         0,
                         0,
                         0,
                         volumeDims[0],
                         volumeDims[1],
                         1,
                         gl.RGBA,
                         gl.UNSIGNED_BYTE,
                         img);
                         */

        // Now decode and write the other slices
    });

    /*
    var reader = new FileReader();
    reader.onerror = function() {
        alert("Error reading ZIP file " + file.name);
    };
    */
    /*
     reader.onprogress = function(evt) {
        var percent = numLoaded / files.length * 100;
        loadingProgressBar.setAttribute("style", "width: " + percent.toFixed(2) + "%");
    };
    */
    /*
    reader.onload = function(evt) {
        var buf = reader.result;
        if (buf) {

        } else {
            alert("Unable to load file " + file.name);
        }
    };
    reader.readAsArrayBuffer(file);
*/
}
