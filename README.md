# Bad Apple!! - Pretext Rendering Experiment

So, I just saw the amazing `@chenglou/pretext` library and immediately felt the urge to build something with it. I'd seen an example of Chika Fujiwara from *Kaguya-sama: Love is War* dancing in the middle of a block of text, and it hit me: recreating the classic "Bad Apple!!" animation (yet again) would be the perfect way to test this engine's limits.

## A bit of the process
Instead of decoding video on the fly, I extract the frames via FFmpeg, map them to a logical grid, and binarize the pixel data. The output is compressed using Run-Length Encoding (RLE) to define horizontal "segments" of continuous color, which is then exported as a flat binary file (`frames.bin`).

I utilize the `Pretext` library (specifically `prepareWithSegments`) to parse the lyrics and calculate glyph metrics purely in RAM upon initialization. This bypasses DOM layout reflows entirely and guarantees constant-time measurement lookups during playback.

During runtime, the engine syncs the binary frame offsets to the master `audio.currentTime`. For each frame:
* It reads the binary segments to determine the spatial boundaries.
* It uses Pretext's `layoutNextLine` API to request the next line of text that perfectly fits within the segment's width.
* Rendering is offloaded to the GPU via the Canvas `ctx.fillText` API.

## Results
To be honest, I thought the memory footprint was going to be massive given the thousands of calculations per frame, but it ended up staying at a rock-solid ~40 MB thanks to the browser's garbage collector. I know it isn't perfect, but I hope you have as much fun watching it as I had building it!