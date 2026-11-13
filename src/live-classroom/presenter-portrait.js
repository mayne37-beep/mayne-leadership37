import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { blurOption, coverageOption, validBackdropColor } from './camera-settings.js';
import { writeBackdropMask } from './backdrop-mask.js';
import { minimumPortraitCoverage, portraitCoverage, writePortraitMask } from './portrait-mask.js';
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
const landscape = 'person-landscape.tflite';
const square = 'person.tflite?v=2';
const retryIntervalMs = 240;
let wasm;
const segmenters = new Map();
let model = landscape;
let lastRetry = -Infinity;
let lastDetectedAt = -Infinity;
let detectedArea = 0;
let automaticAspect = 0;
let maskImage;
let maskHistory;
let previousGuide;
let refinedMask;
let refineEdges;
let previousTimestamp = -Infinity;
let background;
let backdropCanvas;
let backdropContext;

function segmenterFor(asset) {
  if (segmenters.has(asset)) return segmenters.get(asset);
  wasm ??= FilesetResolver.forVisionTasks(base);
  const loading = wasm.then(files => ImageSegmenter.createFromOptions(files, {
    baseOptions: { modelAssetPath: base + '/' + asset },
    canvas: new OffscreenCanvas(1, 1),
    runningMode: 'VIDEO',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  }));
  segmenters.set(asset, loading);
  return loading;
}

async function start() {
  if (new URL(self.location.href).searchParams.get('mode') !== 'solid') {
    await segmenterFor(landscape).catch(() => {});
  }
  self.postMessage({ ready: true });
}

function resetAutomaticHistory() {
  previousTimestamp = -Infinity;
  previousGuide = null;
  lastDetectedAt = -Infinity;
  lastRetry = -Infinity;
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

function drawAutomaticPortrait(bitmap, mask, confidence, settings, timestamp) {
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
  writePortraitMask(confidence, maskHistory, maskImage, timestamp - previousTimestamp,
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
  if (automaticAspect) {
    automaticAspect = 0;
    resetAutomaticHistory();
  }
  drawPortrait(bitmap, backdropCanvas, settings);
}

function sizeComposite(width, height) {
  if (composite.width !== width || composite.height !== height) {
    composite.width = width;
    composite.height = height;
  }
}

function drawBlur(bitmap, blur) {
  const { width, height } = bitmap;
  const radius = blurOption(blur).radius * width / 960;
  compositeContext.filter = 'blur(' + radius + 'px)';
  compositeContext.drawImage(bitmap, -radius * 2, -radius * 2, width + radius * 4, height + radius * 4);
  compositeContext.filter = 'none';
}

function drawBackground(bitmap, settings) {
  const { width, height } = bitmap;
  sizeComposite(width, height);
  if (settings.effect === 'blur') {
    drawBlur(bitmap, settings.blur);
  } else {
    const scale = Math.max(width / background.width, height / background.height);
    const imageWidth = background.width * scale;
    const imageHeight = background.height * scale;
    compositeContext.drawImage(background, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
  }
  compositeContext.drawImage(portrait, 0, 0);
  return composite.transferToImageBitmap();
}

function tryAutomaticPortrait(segmenter, bitmap, settings, timestamp, minimum) {
  let found = false;
  segmenter.segmentForVideo(inference, performance.now(), ({ confidenceMasks }) => {
    const mask = confidenceMasks?.at(-1);
    const confidence = mask?.getAsFloat32Array();
    if (!confidence) return;
    const area = portraitCoverage(confidence);
    if (area < minimum) return;
    const elapsed = timestamp - lastDetectedAt;
    detectedArea = elapsed >= 0 && elapsed < 750 ? detectedArea * 0.8 + area * 0.2 : area;
    lastDetectedAt = timestamp;
    drawAutomaticPortrait(bitmap, mask, confidence, settings, timestamp);
    found = true;
  });
  return found;
}

async function drawAutomatic(bitmap, settings) {
  const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const aspect = width / height;
  if (Math.abs(automaticAspect - aspect) > 0.02) {
    automaticAspect = aspect;
    model = width >= height ? landscape : square;
    resetAutomaticHistory();
  }
  if (inference.width !== width || inference.height !== height) {
    inference.width = width;
    inference.height = height;
  }
  inferenceContext.drawImage(bitmap, 0, 0, width, height);
  const timestamp = settings.timestamp ?? performance.now();
  const minimum = minimumPortraitCoverage(detectedArea, timestamp - lastDetectedAt);
  const currentSegmenter = await segmenterFor(model).catch(() => null);
  if (currentSegmenter && tryAutomaticPortrait(currentSegmenter, bitmap, settings, timestamp, minimum)) return;

  // Try the other portrait model only when the current one loses the outline.
  if (timestamp - lastRetry >= retryIntervalMs || timestamp < lastRetry) {
    lastRetry = timestamp;
    const alternative = model === landscape ? square : landscape;
    const otherSegmenter = await segmenterFor(alternative).catch(() => null);
    if (!currentSegmenter && !otherSegmenter) throw new Error('Camera models are unavailable.');
    if (otherSegmenter && tryAutomaticPortrait(otherSegmenter, bitmap, settings, timestamp, minimum)) {
      model = alternative;
      return;
    }
  }
  previousTimestamp = -Infinity;
  previousGuide = null;
  if (!settings.effect) {
    self.postMessage({ bitmap: null });
    return;
  }
  // Keep a live camera image with blur if a virtual background loses the subject.
  sizeComposite(bitmap.width, bitmap.height);
  compositeContext.drawImage(bitmap, 0, 0);
  drawBlur(bitmap, settings.effect === 'image' ? 'strong' : settings.blur);
  const result = composite.transferToImageBitmap();
  self.postMessage({ bitmap: result }, [result]);
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
    await drawAutomatic(bitmap, settings);
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
