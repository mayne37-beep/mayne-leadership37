import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { blurOption, coverageOption, validBackdropColor } from './camera-settings.js';
import { writeBackdropMask } from './backdrop-mask.js';
import { writePortraitMask } from './portrait-mask.js';
import { createPortraitEdgeRefiner } from './portrait-edges.js';

const base = self.location.origin + '/assets/live-classroom-vision';
const portrait = new OffscreenCanvas(1, 1);
const portraitContext = portrait.getContext('2d');
const inference = new OffscreenCanvas(1, 1);
const inferenceContext = inference.getContext('2d', { alpha: false, willReadFrequently: true });
const maskCanvas = new OffscreenCanvas(1, 1);
const maskContext = maskCanvas.getContext('2d');
const guideCanvas = new OffscreenCanvas(1, 1);
const guideContext = guideCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
const motionCanvas = new OffscreenCanvas(1, 1);
const motionContext = motionCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
const composite = new OffscreenCanvas(1, 1);
const compositeContext = composite.getContext('2d');
let segmenter;
let maskImage;
let maskHistory;
let previousGuide;
let refinedMask;
let refineEdges;
let previousTimestamp = -Infinity;
let background;
let backdropCanvas;
let backdropContext;

async function loadSegmenter() {
  const wasm = await FilesetResolver.forVisionTasks(base);
  return ImageSegmenter.createFromOptions(wasm, {
    baseOptions: { modelAssetPath: base + '/person.tflite?v=2' },
    canvas: new OffscreenCanvas(1, 1),
    runningMode: 'VIDEO',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
}

async function start() {
  if (new URL(self.location.href).searchParams.get('mode') !== 'solid') segmenter = await loadSegmenter();
  self.postMessage({ ready: true });
}

function drawPortrait(bitmap, alpha, settings) {
  if (portrait.width !== bitmap.width || portrait.height !== bitmap.height) {
    portrait.width = bitmap.width;
    portrait.height = bitmap.height;
  }
  portraitContext.globalCompositeOperation = 'source-over';
  portraitContext.clearRect(0, 0, portrait.width, portrait.height);
  portraitContext.drawImage(bitmap, 0, 0);
  portraitContext.globalCompositeOperation = 'destination-in';
  portraitContext.drawImage(alpha, 0, 0, portrait.width, portrait.height);
  const result = settings.effect ? drawBackground(bitmap, settings) : portrait.transferToImageBitmap();
  self.postMessage({ bitmap: result }, [result]);
}

function drawAutomaticPortrait(bitmap, mask, settings) {
  if (!maskImage || maskImage.width !== mask.width || maskImage.height !== mask.height) {
    maskImage = maskContext.createImageData(mask.width, mask.height);
    maskHistory = new Float32Array(mask.width * mask.height);
    motionCanvas.width = mask.width;
    motionCanvas.height = mask.height;
    previousGuide = null;
    previousTimestamp = -Infinity;
    refineEdges = null;
  }
  motionContext.drawImage(inference, 0, 0, mask.width, mask.height);
  const guide = motionContext.getImageData(0, 0, mask.width, mask.height).data;
  const timestamp = settings.timestamp ?? performance.now();
  writePortraitMask(mask.getAsFloat32Array(), maskHistory, maskImage, timestamp - previousTimestamp,
    coverageOption(settings.coverage).threshold, guide, previousGuide);
  previousTimestamp = timestamp;
  previousGuide = guide;
  const scale = Math.min(1, Math.max(mask.width / bitmap.width, mask.height / bitmap.height, 540 / Math.max(bitmap.width, bitmap.height)));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  if (!refineEdges || guideCanvas.width !== width || guideCanvas.height !== height) {
    guideCanvas.width = width;
    guideCanvas.height = height;
    maskCanvas.width = width;
    maskCanvas.height = height;
    refinedMask = maskContext.createImageData(width, height);
    refineEdges = createPortraitEdgeRefiner(maskImage, refinedMask);
  }
  guideContext.drawImage(bitmap, 0, 0, width, height);
  refineEdges(guideContext.getImageData(0, 0, width, height).data);
  maskContext.putImageData(refinedMask, 0, 0);
  drawPortrait(bitmap, maskCanvas, settings);
}

function drawSolidBackdropPortrait(bitmap, settings) {
  if (!backdropCanvas) {
    backdropCanvas = new OffscreenCanvas(1, 1);
    backdropContext = backdropCanvas.getContext('2d', { willReadFrequently: true });
  }
  const { width, height } = bitmap;
  if (backdropCanvas.width !== width || backdropCanvas.height !== height) {
    backdropCanvas.width = width;
    backdropCanvas.height = height;
  }
  backdropContext.globalCompositeOperation = 'copy';
  backdropContext.drawImage(bitmap, 0, 0);
  const pixels = backdropContext.getImageData(0, 0, width, height);
  writeBackdropMask(pixels.data, settings.backdropColor, coverageOption(settings.coverage).threshold);
  backdropContext.putImageData(pixels, 0, 0);
  previousTimestamp = -Infinity;
  previousGuide = null;
  drawPortrait(bitmap, backdropCanvas, settings);
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

self.onmessage = async ({ data: { bitmap, settings = {}, background: image } }) => {
  try {
    if (image) {
      background?.close();
      background = image;
    }
    if (validBackdropColor(settings.backdropColor)) {
      drawSolidBackdropPortrait(bitmap, settings);
      return;
    }
    segmenter ??= await loadSegmenter();
    // The model uses a small input. Keep that work separate from the full-resolution camera image.
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (inference.width !== width || inference.height !== height) {
      inference.width = width;
      inference.height = height;
    }
    inferenceContext.drawImage(bitmap, 0, 0, width, height);
    segmenter.segmentForVideo(inference, performance.now(), ({ confidenceMasks }) => {
      drawAutomaticPortrait(bitmap, confidenceMasks.at(-1), settings);
    });
  } catch (error) {
    console.warn('Camera effects frame processing failed.', error);
    self.postMessage({ error: true });
  } finally {
    bitmap.close();
  }
};

start().catch(error => {
  console.warn('Camera effects could not start.', error);
  self.postMessage({ error: true });
});
