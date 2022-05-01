# WebGL Volume Animation

Play back 3D volumetric time series data

## Data Format

Timesteps should be stored as an image stack in a zip files. Supported image types
are webp (in the future maybe png, jpg, etc). The zip structure should be:

```
data.zip:
- <prefix>0000.webp
- ...
- <prefix>####.webp
```

Where `<prefix>` is any string prefix.

Multiple timesteps can be loaded by uploading a set of zip files or providing a text file
which has the URL of each timestep. The text file should have one URL per line:

```
https://.../timestep000.zip
...
https://.../timestep###.zip
```

## Running

After cloning the repo run

```
npm install
```

To install webpack, then you can run the serve task and point your browser to `localhost:8080`:

```
npm run serve
```

Where you should see the page shown below.

To deploy your application, run:

```
npm run deploy
```

Then you can copy the content of the `dist/` directory to your webserver. You can build a development
distribution by running `npm run build`.

