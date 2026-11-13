import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { blurOption, coverageOption } from './camera-settings.js';

const base = self.location.origin + '/assets/live-classroom-vision';
const portrait = new OffscreenCanvas(1, 1);
const portraitContext = portrait.getContext('2d');
const maskCanvas = new OffscreenCanvas(1, 1);
const maskContext = maskCanvas.getContext('2d');
const composite = new OffscreenCanvas(1, 1);
const compositeContext = composite.getContext('2d');
let segmenter;
let maskImage;
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
  }
  const confidence = mask.getAsFloat32Array();
  const threshold = coverageOption(settings.coverage).threshold;
  for (let i = 0; i < confidence.length; i++) {
    maskImage.data[i * 4 + 3] = (confidence[i] - threshold) * 1275;
  }
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
    segmenter.segmentForVideo(bitmap, performance.now(), ({ confidenceMasks }) => draw(bitmap, confidenceMasks.at(-1), settings));
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
