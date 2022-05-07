import JSZip from "jszip";

export class ZipStack {
    // File can be a file object or a URL
    constructor(file)
    {
        this.file = file;
        this.volumeDims = [];
        this.texture = null;
    }

    isRemote()
    {
        return typeof (this.file) === "string";
    }

    // Fetch the Zip file, either by loading it asynchronously via JSZip or
    // fetching the remote URL and then loading it
    async loadAsync()
    {
        if (this.isRemote()) {
            return fetch(this.file)
                .then(function(response) {
                    if (response.status === 200 || response.status === 0) {
                        return Promise.resolve(response.blob());
                    } else {
                        return Promise.reject(new Error(response.statusText));
                    }
                })
                .then(JSZip.loadAsync);
        } else {
            return JSZip.loadAsync(this.file);
        }
    }

    async uploadToGPU(gl, uploadTextureUnit)
    {
        // No need to re-load the texture if it's already loaded
        if (this.texture !== null) {
            return;
        }
        var start = performance.now();
        var zip = await this.loadAsync();
        var slices = zip.file(/\.webp/);

        // Load the first slice to determine the volume dimensions
        var buf = await slices[0].async("arraybuffer");
        var blob = new Blob([buf], ["image/webp"]);
        var img = await createImageBitmap(blob);

        this.volumeDims = [img.width, img.height, slices.length];

        this.texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + uploadTextureUnit);
        gl.bindTexture(gl.TEXTURE_3D, this.texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texStorage3D(gl.TEXTURE_3D,
                        1,
                        gl.R8,
                        this.volumeDims[0],
                        this.volumeDims[1],
                        this.volumeDims[2]);
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
                         this.volumeDims[0],
                         this.volumeDims[1],
                         1,
                         gl.RED,
                         gl.UNSIGNED_BYTE,
                         img);

        var self = this;
        var uploadSlice = async function(i) {
            var buf = await slices[i].async("arraybuffer");
            var blob = new Blob([buf], ["image/webp"]);
            var img = await createImageBitmap(blob);
            gl.activeTexture(gl.TEXTURE0 + uploadTextureUnit);
            gl.texSubImage3D(gl.TEXTURE_3D,
                             0,
                             0,
                             0,
                             i,
                             self.volumeDims[0],
                             self.volumeDims[1],
                             1,
                             gl.RED,
                             gl.UNSIGNED_BYTE,
                             img);
            img.close();
        };

        // Now upload the other slices asynchronously
        var promises = [];
        for (var i = 1; i < slices.length; ++i) {
            promises.push(uploadSlice(i));
        }
        // Wait for all slices to finish
        await Promise.all(promises);

        var end = performance.now();
        console.log(`Volume loaded in ${end - start}ms`);
    }

    deleteTexture(gl)
    {
        gl.deleteTexture(this.texture);
        this.texture = null;
    }
}

