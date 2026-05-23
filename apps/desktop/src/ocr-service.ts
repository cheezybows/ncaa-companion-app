import { createWorker, type Worker } from 'tesseract.js';
import type { CaptureOcrPageResult, CaptureOcrWord, CaptureScreenKind } from '@ncaa/parsers';
import { preprocessScreenshotForOcr } from './ocr-preprocess.js';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      console.log('[ocr] Initializing Tesseract worker (eng)');
      const worker = await createWorker('eng');
      console.log('[ocr] Tesseract worker ready');
      return worker;
    })();
  }
  return workerPromise;
}

function mapWords(words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>): CaptureOcrWord[] {
  return words
    .filter((word) => word.text.trim().length > 0)
    .map((word) => ({
      text: word.text,
      confidence: word.confidence,
      bbox: word.bbox,
    }));
}

export async function recognizeScreenshot(
  imagePath: string,
  options?: { screenKind?: CaptureScreenKind }
): Promise<CaptureOcrPageResult> {
  const startedAt = Date.now();
  const screenKind = options?.screenKind;
  console.log(`[ocr] Recognizing screenshot: ${imagePath}${screenKind ? ` screenKind=${screenKind}` : ''}`);
  const worker = await getWorker();
  const preprocessed = await preprocessScreenshotForOcr(imagePath, screenKind);

  const textParts: string[] = [];
  const words: CaptureOcrWord[] = [];
  let confidenceTotal = 0;

  for (let index = 0; index < preprocessed.images.length; index += 1) {
    const region = preprocessed.regions[index];
    const image = preprocessed.images[index]!;
    const result = await worker.recognize(image);
    const data = result.data;
    const regionText = data.text ?? '';
    if (regionText.trim()) {
      textParts.push(`[[OCR_REGION:${region ?? index}]]\n${regionText}`);
    }
    words.push(
      ...mapWords(
        (data.words ?? []).map((word) => ({
          text: word.text,
          confidence: word.confidence,
          bbox: word.bbox,
        }))
      )
    );
    confidenceTotal += data.confidence ?? 0;
    console.log(
      `[ocr] Region ${region ?? index} for ${imagePath}: confidence=${(data.confidence ?? 0).toFixed(1)} words=${data.words?.length ?? 0} chars=${regionText.length}`
    );
  }

  const text = textParts.join('\n');
  const confidence = preprocessed.images.length > 0 ? confidenceTotal / preprocessed.images.length : 0;
  const elapsedMs = Date.now() - startedAt;

  console.log(
    `[ocr] Recognized ${imagePath}: confidence=${confidence.toFixed(1)} words=${words.length} chars=${text.length} elapsedMs=${elapsedMs} regions=${preprocessed.regions.join(',')}`
  );
  if (text.trim().length > 0) {
    console.log(`[ocr] Text preview (${imagePath}): ${text.replace(/\s+/g, ' ').trim().slice(0, 500)}`);
  } else {
    console.warn(`[ocr] No text detected for ${imagePath}`);
  }

  return {
    imagePath,
    text,
    words,
    confidence,
  };
}

export async function recognizeScreenshots(
  imagePaths: string[],
  options?: { screenKind?: CaptureScreenKind }
): Promise<CaptureOcrPageResult[]> {
  console.log(`[ocr] Starting OCR batch: images=${imagePaths.length}`);
  const pages: CaptureOcrPageResult[] = [];
  for (const imagePath of imagePaths) {
    pages.push(await recognizeScreenshot(imagePath, options));
  }
  console.log(
    `[ocr] Finished OCR batch: images=${pages.length} totalWords=${pages.reduce((sum, page) => sum + page.words.length, 0)} totalChars=${pages.reduce((sum, page) => sum + page.text.length, 0)}`
  );
  return pages;
}

export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  console.log('[ocr] Terminating Tesseract worker');
  const worker = await workerPromise;
  await worker.terminate();
  workerPromise = null;
}
