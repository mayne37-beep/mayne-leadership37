import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { blurOption, coverageOption } from './camera-settings.js';
import { writePortraitMask } from './portrait-mask.js';

const base = self.location.origin + '/assets/live-classroom-vision';
const portrait = new OffscreenCanvas(1, 1);
const portraitContext = portrait.getContext('2d');
const inference = new OffscreenCanvas(1, 1);
const inferenceContext = inference.getContext('2d', { alpha: false });
const maskCanvas = new OffscreenCanvas(1, 1);
const maskContext = maskCanvas.getContext('2d');
const composite = new OffscreenCanvas(1, 1);
const compositeContext = composite.getContext('2d');
let segmenter;
let maskImage;
let maskHistory;
let previousTimestamp = -Infinity;
let background;

async function start() {
  const wasm = await FilesetResolver.forVisionTasks(base);
  segmenter = await ImageSegmenter.createFromOptions(wasm, {
    baseOptions: { modelAssetPath: base + '/person.tflite' },
    canvas: new OffscreenCanvas(1, 1),
    runningMode: 'VIDEO',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  self.postMessage({ ready: true });
}

function draw(bitmap, mask, settings) {
  if (portrait.width !== bitmap.width || portrait.height !== bitmap.height) {
    portrait.width = bitmap.width;
    portrait.height = bitmap.height;
  }
  if (!maskImage || maskImage.width !== mask.width || maskImage.height !== mask.height) {
    maskCanvas.width = mask.width;
    maskCanvas.height = mask.height;
    maskImage = maskContext.createImageData(mask.width, mask.height);
    maskHistory = new Float32Array(mask.width * mask.height);
    previousTimestamp = -Infinity;
  }
  const timestamp = settings.timestamp ?? performance.now();
  writePortraitMask(mask.getAsFloat32Array(), maskHistory, maskImage, timestamp - previousTimestamp,
    coverageOption(settings.coverage).threshold);
  previousTimestamp = timestamp;
  maskContext.putImageData(maskImage, 0, 0);
  portraitContext.globalCompositeOperation = 'source-over';
  portraitContext.clearRect(0, 0, portrait.width, portrait.height);
  portraitContext.drawImage(bitmap, 0, 0);
  portraitContext.globalCompositeOperation = 'destination-in';
  portraitContext.drawImage(maskCanvas, 0, 0, portrait.width, portrait.height);
  const result = settings.effect ? drawBackground(bitmap, settings) : portrait.transferToImageBitmap();
  self.postMessage({ bitmap: result }, [result]);
}

function drawBackground(bitmap, settings) {
  const { width, height } = bitmap;
  if (composite.width !== width || composite.height !== height) {
    composite.width = width;
    composite.height = height;
  }
  if (settings.effect === 'blur') {
    const radius = blurOption(settings.blur).radius * width / 960;
    compositeContext.filter = 'blur(' + radius + 'px)';
    compositeContext.drawImage(bitmap, -radius * 2, -radius * 2, width + radius * 4, height + radius * 4);
    compositeContext.filter = 'none';
  } else {
    const scale = Math.max(width / background.width, height / background.height);
    const imageWidth = background.width * scale;
    const imageHeight = background.height * scale;
    compositeContext.drawImage(background, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
  }
  compositeContext.drawImage(portrait, 0, 0);
  return composite.transferToImageBitmap();
}

self.onmessage = ({ data: { bitmap, settings = {}, background: image } }) => {
  try {
    if (image) {
      background?.close();
      background = image;
    }
    // The model uses a small input. Keep that work separate from the full-resolution camera image.
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (inference.width !== width || inference.height !== height) {
      inference.width = width;
      inference.height = height;
    }
    inferenceContext.drawImage(bitmap, 0, 0, width, height);
    segmenter.segmentForVideo(inference, performance.now(), ({ confidenceMasks }) => draw(bitmap, confidenceMasks.at(-1), settings));
  } catch (error) {
    console.warn('Weather view frame processing failed.', error);
    self.postMessage({ error: true });
  } finally {
    bitmap.close();
  }
};

start().catch(error => {
  console.warn('Weather view could not start.', error);
  self.postMessage({ error: true });
});
