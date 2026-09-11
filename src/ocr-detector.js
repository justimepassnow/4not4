import { runCanvasFallback } from './canvas-detector.js';
export { runCanvasFallback } from './canvas-detector.js';
// PaddleOCR DBNet ONNX detector with canvas fallback

import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';

// Configure WASM paths
try {
  ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: wasmModuleUrl };
  ort.env.wasm.numThreads = 1;
} catch (e) {
  console.warn('WASM config warning:', e);
}

let session = null;
let modelLoadingPromise = null;

export async function initOcrModel() {
  if (session) return session;
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    try {
      session = await ort.InferenceSession.create('/model.onnx', {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      });
      console.log('PaddleOCR DBNet model loaded successfully');
      return session;
    } catch (err) {
      console.warn('Failed to load DBNet ONNX model, fallback engine active:', err);
      session = null;
      return null;
    }
  })();

  return modelLoadingPromise;
}

export async function detectText(imageElement) {
  const model = await initOcrModel();
  if (model) {
    try {
      return await runDbnetInference(model, imageElement);
    } catch (err) {
      console.warn('Inference error, switching to fallback canvas extractor:', err);
      return runCanvasFallback(imageElement);
    }
  }
  return runCanvasFallback(imageElement);
}

async function runDbnetInference(session, img) {
  const imageWidth = img.naturalWidth || img.width;
  const imageHeight = img.naturalHeight || img.height;
  const targetW = 640;
  const targetH = 640;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Letterbox draw
  const scale = Math.min(targetW / imageWidth, targetH / imageHeight);
  const renderW = Math.round(imageWidth * scale);
  const renderH = Math.round(imageHeight * scale);
  const offsetX = Math.floor((targetW - renderW) / 2);
  const offsetY = Math.floor((targetH - renderH) / 2);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, offsetX, offsetY, renderW, renderH);

  const imgData = ctx.getImageData(0, 0, targetW, targetH).data;

  // Prepare CHW Float32Array normalized with ImageNet/PaddleOCR stats
  const float32Data = new Float32Array(3 * targetW * targetH);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const channelStride = targetW * targetH;

  for (let i = 0; i < targetW * targetH; i++) {
    const r = imgData[i * 4] / 255.0;
    const g = imgData[i * 4 + 1] / 255.0;
    const b = imgData[i * 4 + 2] / 255.0;

    float32Data[i] = (r - mean[0]) / std[0];
    float32Data[channelStride + i] = (g - mean[1]) / std[1];
    float32Data[channelStride * 2 + i] = (b - mean[2]) / std[2];
  }

  const tensor = new ort.Tensor('float32', float32Data, [1, 3, targetH, targetW]);
  const inputName = session.inputNames[0];
  const output = await session.run({ [inputName]: tensor });
  const outputName = session.outputNames[0];
  const predData = output[outputName].data; // Float32Array [1, 1, 640, 640]

  // Binarize probability map (> 0.25)
  const binaryMap = new Uint8Array(targetW * targetH);
  for (let i = 0; i < targetW * targetH; i++) {
    binaryMap[i] = predData[i] > 0.25 ? 1 : 0;
  }

  // Connected Component Bounding Box Extraction
  const boxes = extractBoundingBoxes(binaryMap, targetW, targetH);

  // Filter out letterbox padding and rescale back to natural image dimensions
  const finalBoxes = [];
  for (const b of boxes) {
    // Check if inside image rect
    const bx = b.x - offsetX;
    const by = b.y - offsetY;
    if (bx + b.width <= 0 || by + b.height <= 0 || bx >= renderW || by >= renderH) continue;

    // Rescale & unclip expand
    const unclipX = Math.max(0, (bx - 2) / scale);
    const unclipY = Math.max(0, (by - 2) / scale);
    const unclipW = Math.min(imageWidth - unclipX, (b.width + 4) / scale);
    const unclipH = Math.min(imageHeight - unclipY, (b.height + 4) / scale);

    // Discard bottom watermark (e.g. CamScanner / KTUAssist in bottom 6%)
    if (unclipY > imageHeight * 0.94) continue;

    if (unclipW >= 6 && unclipH >= 6) {
      finalBoxes.push({
        x: Math.round(unclipX),
        y: Math.round(unclipY),
        width: Math.round(unclipW),
        height: Math.round(unclipH),
        engine: 'PaddleOCR-DBNet'
      });
    }
  }

  return finalBoxes.length > 0 ? finalBoxes : runCanvasFallback(img);
}

// Connected Component Bounding Boxes
function extractBoundingBoxes(binaryMap, width, height) {
  const visited = new Uint8Array(width * height);
  const boxes = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binaryMap[idx] === 1 && visited[idx] === 0) {
        // Flood fill / BFS
        let minX = x, maxX = x, minY = y, maxY = y;
        let pixelCount = 0;
        const queue = [x, y];
        visited[idx] = 1;

        while (queue.length > 0) {
          const cy = queue.pop();
          const cx = queue.pop();
          pixelCount++;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // 4-neighborhood
          const neighbors = [
            [cx + 1, cy], [cx - 1, cy],
            [cx, cy + 1], [cx, cy - 1]
          ];

          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              if (binaryMap[nIdx] === 1 && visited[nIdx] === 0) {
                visited[nIdx] = 1;
                queue.push(nx, ny);
              }
            }
          }
        }

        const bWidth = maxX - minX + 1;
        const bHeight = maxY - minY + 1;
        if (pixelCount >= 6 && bWidth >= 2 && bHeight >= 3) {
          boxes.push({ x: minX, y: minY, width: bWidth, height: bHeight });
        }
      }
    }
  }

  return boxes;
}
