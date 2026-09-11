// In-browser PDF document loader and renderer using pdfjs-dist

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function loadPdf(fileOrUrl) {
  let loadingTask;
  if (typeof fileOrUrl === 'string') {
    loadingTask = pdfjsLib.getDocument({ url: fileOrUrl });
  } else {
    const arrayBuffer = await fileOrUrl.arrayBuffer();
    loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  }
  return await loadingTask.promise;
}

export async function renderPdfPage(pdfDoc, pageNum = 1, scale = 1.5) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  await page.render({
    canvasContext: ctx,
    viewport: viewport
  }).promise;

  return canvas;
}
