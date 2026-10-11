import { createWorker } from 'tesseract.js';
export async function recognize(canvas, progress) {
  const worker=await createWorker('eng',1,{workerPath:'/assets/pdf-ocr/worker.min.js',corePath:'/assets/pdf-ocr/',langPath:'https://tessdata.projectnaptha.com/4.0.0',logger:m=>progress?.(m)});
  try {const result=await worker.recognize(canvas,{}, {text:true,blocks:true});return result.data;} finally {await worker.terminate();}
}
