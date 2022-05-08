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
var frame = 1;
var playing = true;
var timestepSlider = document.getElementById("timestep-slider");

(async () => {
    var canvas = document.getElementById("webgl-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) {
        document.getElementById("webgl-canvas").setAttribute("style", "display:none;");
        document.getElementById("no-webgl").setAttribute("style", "display:block;");
        return;
    }

    document.getElementById("upload-zip").onchange = loadZipFile;

    setupPlaybackControls();

    // Decode any URL parameters
    if (window.location.hash) {
        // var regexResolution = /(\d+)x(\d+)/;
        // var regexVoxelSpacing = /(\d+\.?\d?)x(\d+\.?\d?)x(\d+\.?\d?)/;
        var urlParams = window.location.hash.substring(1).split("&");
        for (var i = 0; i < urlParams.length; ++i) {
            var str = decodeURI(urlParams[i]);
            console.log(str);
            // URL load param
            if (str.startsWith("url=")) {
                await fetch(str.substring(4))
                    .then(function(response) {
                        if (response.status === 200 || response.status === 0) {
                            return Promise.resolve(response.text());
                        } else {
                            return Promise.reject(new Error(response.statusText));
                        }
                    })
                    .then(text => loadURLList(text.split("\n")));
                continue;
            }
        }
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

    var timestepDisplay = document.getElementById("current-timestep");
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

        var currentStack = timesteps[parseInt(timestepSlider.value)];
        if (playing && frame % 12 == 0) {
            timestepSlider.value = (parseInt(timestepSlider.value) + 1) % timesteps.length;

            currentStack = timesteps[parseInt(timestepSlider.value)];
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_3D, currentStack.texture);
        }
        gl.uniform1i(shader.uniforms["volume"], 0);
        gl.uniform1i(shader.uniforms["colormap"], 1);

        var longestAxis =
            Math.max(currentStack.volumeDims[0],
                     Math.max(currentStack.volumeDims[1], currentStack.volumeDims[2]));
        var volumeScale = [
            currentStack.volumeDims[0] / longestAxis,
            currentStack.volumeDims[1] / longestAxis,
            currentStack.volumeDims[2] / longestAxis
        ];

        gl.uniform3iv(shader.uniforms["volume_dims"], currentStack.volumeDims);
        gl.uniform3fv(shader.uniforms["volume_scale"], volumeScale);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, cubeStrip.length / 3);
        gl.finish();

        timestepDisplay.innerText = `Current Timestep: ${timestepSlider.value}`;

        if (playing) {
            frame += 1;
        }
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
        timestepSlider.value = 0;
        frame = 1;
        timestepSlider.max = 0;
    }

    var files = evt.target.files;
    console.log(files);
    if (files.length == 0) {
        return;
    }

    if (files[0].type === "application/zip") {
        // Here we'd want something more intelligent to load on demand and play though
        // the textures, but this is fine for a test
        for (var i = 0; i < files.length; ++i) {
            console.log(files[i]);
            var timestep = new ZipStack(files[i]);
            await timestep.uploadToGPU(gl, 2);
            timesteps.push(timestep);
        }
    } else if (files[0].type === "text/plain") {
        var content = await files[0].text();
        await loadURLList(content.split("\n"));
    } else {
        alert(`Unsupported file type ${files[0].type}`);
    }

    timestepSlider.max = timesteps.length - 1;
}

async function loadURLList(lines)
{
    for (var i = 0; i < lines.length; ++i) {
        console.log(lines[i]);
        if (lines[i].length == 0) {
            continue;
        }
        var timestep = new ZipStack(lines[i]);
        await timestep.uploadToGPU(gl, 2);
        timesteps.push(timestep);
    }
    timestepSlider.max = timesteps.length - 1;
}

// Setup the animation playback controls
function setupPlaybackControls()
{
    document.getElementById("restart-button").onclick = function() {
        timestepSlider.value = 0;
        frame = 1;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_3D, timesteps[parseInt(timestepSlider.value)].texture);
    };

    document.getElementById("step-backward").onclick = function() {
        if (timesteps.length == 0) {
            return;
        }
        var val = parseInt(timestepSlider.value);
        if (val == 0) {
            timestepSlider.value = timesteps.length - 1;
        } else {
            timestepSlider.value = val - 1;
        }
        frame = 1;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_3D, timesteps[parseInt(timestepSlider.value)].texture);
    };

    var playButton = document.getElementById("play-button");
    var pauseButton = document.getElementById("pause-button");
    playButton.hidden = true;

    playButton.onclick = function() {
        playing = true;
        frame = 1;

        playButton.hidden = true;
        pauseButton.hidden = false;
    };

    pauseButton.onclick = function() {
        playing = false;
        frame = 1;

        playButton.hidden = false;
        pauseButton.hidden = true;
    };

    document.getElementById("step-forward").onclick = function() {
        if (timesteps.length == 0) {
            return;
        }
        timestepSlider.value = (parseInt(timestepSlider.value) + 1) % timesteps.length;
        frame = 1;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_3D, timesteps[parseInt(timestepSlider.value)].texture);
    };

    timestepSlider.oninput = function(e) {
        frame = 1;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_3D, timesteps[parseInt(timestepSlider.value)].texture);
    };
}
