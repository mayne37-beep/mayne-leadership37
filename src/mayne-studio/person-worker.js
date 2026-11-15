import { env, InferenceSession, Tensor } from '/assets/mayne-studio/segmentation/ort.wasm.min.mjs';
import { coverageOption } from '../live-classroom/camera-settings.js';
import { minimumPortraitCoverage, portraitCoverage, writePortraitMask } from '../live-classroom/portrait-mask.js';

const root = '/assets/mayne-studio/segmentation/';
const portrait = new OffscreenCanvas(1, 1);
const output = portrait.getContext('2d');
let previousTime = -Infinity;
let lastDetected = -Infinity;
let lastArea = 0;
let priorPixels;

async function initialize() {
  env.wasm.wasmPaths = new URL(root, self.location.origin).href;
  env.wasm.numThreads = 1;
  const model = await InferenceSession.create(root + 'person.onnx', { executionProviders: ['wasm'] });
  const width = 256, height = 256;
  const size = width * height;
  const values = new Float32Array(3 * size);
  const input = new Tensor('float32', values, [1, 3, height, width]);
  const inputMap = { [model.inputNames[0]]: input };
  const maskOutput = model.outputNames[0];
  const source = new OffscreenCanvas(width, height);
  const sourceContext = source.getContext('2d', { alpha: false, willReadFrequently: true });
  const matte = new OffscreenCanvas(width, height);
  const matteContext = matte.getContext('2d');
  const alpha = matteContext.createImageData(width, height);
  const history = new Float32Array(width * height);

  self.onmessage = async ({ data: { bitmap, settings } }) => {
    let result;
    try {
      sourceContext.drawImage(bitmap, 0, 0, width, height);
      const pixels = sourceContext.getImageData(0, 0, width, height).data;
      for (let n = 0; n < size; n++) {
        const i = n * 4;
        values[n] = pixels[i] / 255;
        values[n + size] = pixels[i + 1] / 255;
        values[n + 2 * size] = pixels[i + 2] / 255;
      }
      result = (await model.run(inputMap))[maskOutput];
      const confidence = result.data;
      const area = portraitCoverage(confidence);
      const now = settings.timestamp;
      if (area < minimumPortraitCoverage(lastArea, now - lastDetected)) {
        previousTime = -Infinity;
        priorPixels = null;
        self.postMessage({ bitmap: null });
        return;
      }
      lastArea = area;
      lastDetected = now;
      writePortraitMask(confidence, history, alpha, now - previousTime,
        coverageOption(settings.coverage).threshold, pixels, priorPixels);
      previousTime = now;
      priorPixels = pixels;
      matteContext.putImageData(alpha, 0, 0);
      if (portrait.width !== bitmap.width || portrait.height !== bitmap.height) {
        portrait.width = bitmap.width;
        portrait.height = bitmap.height;
      }
      output.globalCompositeOperation = 'copy';
      output.drawImage(bitmap, 0, 0);
      output.globalCompositeOperation = 'destination-in';
      output.drawImage(matte, 0, 0, portrait.width, portrait.height);
      const frame = portrait.transferToImageBitmap();
      self.postMessage({ bitmap: frame }, [frame]);
    } catch (error) {
      console.warn('Mayne Studio could not segment a camera frame.', error);
      self.postMessage({ error: true });
    } finally {
      result?.dispose();
      bitmap.close();
    }
  };
  self.postMessage({ ready: true });
}

initialize().catch(error => {
  console.warn('Mayne Studio could not start camera segmentation.', error);
  self.postMessage({ error: true });
});
