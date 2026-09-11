// PaddleOCR DBNet ONNX detector with canvas fallback

import * as ort from 'onnxruntime-web';

// Configure WASM paths
try {
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
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
  const targetW = 640;
  const targetH = 640;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Letterbox draw
  const scale = Math.min(targetW / img.naturalWidth, targetH / img.naturalHeight);
  const renderW = Math.round(img.naturalWidth * scale);
  const renderH = Math.round(img.naturalHeight * scale);
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
    const unclipW = Math.min(img.naturalWidth - unclipX, (b.width + 4) / scale);
    const unclipH = Math.min(img.naturalHeight - unclipY, (b.height + 4) / scale);

    if (unclipW > 10 && unclipH > 8) {
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

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
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
        if (pixelCount > 15 && bWidth > 6 && bHeight > 4) {
          boxes.push({ x: minX, y: minY, width: bWidth, height: bHeight });
        }
      }
    }
  }

  return boxes;
}

// Lightweight instant fallback using direct canvas thresholding & horizontal grouping
export function runCanvasFallback(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h).data;
  const bin = new Uint8Array(w * h);

  // Dark pixel detection (ink vs paper)
  for (let i = 0; i < w * h; i++) {
    const r = imgData[i * 4];
    const g = imgData[i * 4 + 1];
    const b = imgData[i * 4 + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    bin[i] = gray < 185 ? 1 : 0;
  }

  // Horizontal projection profile to detect text lines and diagrams
  const rowDensity = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const offset = y * w;
    for (let x = 0; x < w; x++) {
      if (bin[offset + x] === 1) sum++;
    }
    rowDensity[y] = sum / w;
  }

  const boxes = [];
  let inLine = false;
  let lineStartY = 0;

  for (let y = 0; y < h; y++) {
    const isInkRow = rowDensity[y] > 0.015;
    if (isInkRow && !inLine) {
      inLine = true;
      lineStartY = y;
    } else if (!isInkRow && inLine) {
      inLine = false;
      const lineH = y - lineStartY;
      if (lineH > 8) {
        // Find horizontal bounds for this line
        let minX = w, maxX = 0;
        for (let ly = lineStartY; ly < y; ly++) {
          const off = ly * w;
          for (let x = 0; x < w; x++) {
            if (bin[off + x] === 1) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
            }
          }
        }
        if (maxX > minX && (maxX - minX) > 20) {
          boxes.push({
            x: Math.max(0, minX - 4),
            y: Math.max(0, lineStartY - 2),
            width: Math.min(w - minX, (maxX - minX) + 8),
            height: lineH + 4,
            engine: 'CanvasHeuristic'
          });
        }
      }
    }
  }

  return boxes;
}
