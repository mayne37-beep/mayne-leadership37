import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

const base = self.location.origin + '/assets/live-classroom-vision';
const portrait = new OffscreenCanvas(1, 1);
const portraitContext = portrait.getContext('2d');
const maskCanvas = new OffscreenCanvas(1, 1);
const maskContext = maskCanvas.getContext('2d');
let segmenter;
let maskImage;

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

function draw(bitmap, mask) {
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
  for (let i = 0; i < confidence.length; i++) {
    maskImage.data[i * 4 + 3] = Math.max(0, Math.min(255, (confidence[i] - 0.42) * 640));
  }
  maskContext.putImageData(maskImage, 0, 0);
  portraitContext.globalCompositeOperation = 'source-over';
  portraitContext.clearRect(0, 0, portrait.width, portrait.height);
  portraitContext.drawImage(bitmap, 0, 0);
  portraitContext.globalCompositeOperation = 'destination-in';
  portraitContext.drawImage(maskCanvas, 0, 0, portrait.width, portrait.height);
  const cutout = portrait.transferToImageBitmap();
  self.postMessage({ bitmap: cutout }, [cutout]);
}

self.onmessage = ({ data: { bitmap } }) => {
  try {
    segmenter.segmentForVideo(bitmap, performance.now(), ({ confidenceMasks }) => draw(bitmap, confidenceMasks.at(-1)));
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
