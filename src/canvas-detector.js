// Lightweight instant fallback using direct canvas thresholding & horizontal grouping
export function runCanvasFallback(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
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

  for (let y = 0; y <= h; y++) {
    const isInkRow = y < h && rowDensity[y] > 0.003;
    if (isInkRow && !inLine) {
      inLine = true;
      lineStartY = y;
    } else if (!isInkRow && inLine) {
      inLine = false;
      const lineH = y - lineStartY;
      if (lineH >= 2) {
        // Split each row band at wide horizontal gaps, preserving a separate
        // question marker instead of merging it into the answer line.
        const columns = new Uint8Array(w);
        for (let ly = lineStartY; ly < y; ly++) {
          for (let x = 0; x < w; x++) {
            if (bin[ly * w + x]) columns[x] = 1;
          }
        }
        const gapLimit = Math.max(12, Math.round(w * 0.025));
        let start = -1, last = -1;
        const addBox = () => {
          if (last - start < 4) return;
          const left = Math.max(0, start - 2);
          const top = Math.max(0, lineStartY - 2);
          boxes.push({
            x: left, y: top,
            width: Math.min(w - left, last - left + 3),
            height: Math.min(h - top, lineH + 4),
            engine: 'CanvasHeuristic'
          });
        };
        for (let x = 0; x <= w; x++) {
          if (x < w && columns[x]) {
            if (start < 0) start = x;
            last = x;
          } else if (start >= 0 && (x - last > gapLimit || x === w)) {
            addBox();
            start = -1;
          }
        }
      }
    }
  }

  return boxes;
}
