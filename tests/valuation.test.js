import test from 'node:test';
import assert from 'node:assert/strict';
import { groupAnswersByQuestion } from '../src/spatial-grouping.js';
import { evaluateBooklet } from '../src/troll-grader.js';
const box = (x, y, width = 400, height = 18) => ({ x, y, width, height });
test('continuous writing stays together over a long page', () => {
  const boxes = Array.from({ length: 25 }, (_, i) => box(190, 100 + i * 28));
  const result = groupAnswersByQuestion(boxes, 800, 1100);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].boxes.length, 25);
});
test('a genuine whitespace gap separates unnumbered answers', () => {
  const result = groupAnswersByQuestion([box(190, 100), box(190, 128), box(190, 350)], 800, 1100);
  assert.equal(result.questions.length, 2);
});
test('compact markers separate answers and exclude detached headers', () => {
  const header = box(30, 20, 500);
  const first = box(180, 150);
  const second = box(180, 398);
  const result = groupAnswersByQuestion([header, box(45, 150, 28, 12), first, box(180, 180), box(45, 400, 28, 12), second], 800, 1100);
  assert.equal(result.questions.length, 2);
  assert.deepEqual(result.ignoredBoxes, [header]);
  assert.ok(result.questions[1].boxes.includes(second));
  const assigned = result.questions.flatMap(q => q.boxes);
  assert.equal(new Set(assigned).size, assigned.length);
  assert.equal(assigned.length, 3);
});
test('wide left-aligned prose is not mistaken for question numbers', () => {
  const result = groupAnswersByQuestion([box(45, 120, 150), box(45, 180, 150), box(45, 240, 150)], 800, 1100);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].anchor.inferred, true);
});
test('empty and invalid detection input produces finite empty metrics', () => {
  for (const boxes of [[], [box(NaN, 20)], null]) {
    const result = groupAnswersByQuestion(boxes, 800, 1100);
    assert.equal(result.questions.length, 0);
    assert.equal(result.pageMetrics.pageFillRatio, 0);
  }
});
test('booklet region marks stay attached to their page', () => {
  const groupedData = groupAnswersByQuestion([box(190, 100)], 800, 1100);
  const result = evaluateBooklet([{ pageNumber: 1, groupedData }, { pageNumber: 2, groupedData }], { multiplier: 1, hunger: 0, time: '10:00 AM' });
  assert.equal(result.pageBreakdowns[2][0].qNumber, 'P2-R1');
  assert.equal(result.breakdown.length, 2);
  assert.ok(result.totalMarks >= 0 && result.totalMarks <= 100);
});

test('fallback retains thin strokes, separates margin markers, and flushes the last row', async () => {
  const { runCanvasFallback } = await import('../src/canvas-detector.js');
  const width = 800, height = 200;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const ink = (x, y, w, h) => {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) {
      const index = (row * width + col) * 4;
      data[index] = data[index + 1] = data[index + 2] = 0;
    }
  };
  ink(40, 30, 20, 10);
  ink(160, 30, 400, 3);
  ink(160, 197, 400, 3);
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {}, getImageData: () => ({ data }) }) }) };
  try {
    const boxes = runCanvasFallback({ width, height });
    assert.ok(boxes.some(b => b.x < 60 && b.width < 40));
    assert.ok(boxes.some(b => b.x > 100 && b.y < 40));
    assert.ok(boxes.some(b => b.y > 190 && b.y + b.height === height));
    assert.ok(boxes.every(b => b.x + b.width <= width && b.y + b.height <= height));
  } finally { delete globalThis.document; }
});

test('supplied image samples produce 2, 3, and 1 answer regions', async () => {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const { runCanvasFallback } = await import('../src/canvas-detector.js');
  globalThis.document = { createElement: () => createCanvas(1, 1) };
  try {
    for (const [name, count] of [['sample1_flowchart.png', 2], ['sample2_dense_filler.png', 3], ['sample3_half_page.png', 1]]) {
      const img = await loadImage(new URL(`../public/samples/${name}`, import.meta.url).pathname);
      const result = groupAnswersByQuestion(runCanvasFallback(img), img.width, img.height);
      assert.equal(result.questions.length, count, name);
      assert.ok(result.questions.every(q => !q.anchor.inferred), name);
      assert.equal(result.ignoredBoxes.length, 4, 'Booklet header excluded');
    }
  } finally { delete globalThis.document; }
});

test('three-page PDF keeps the expected regions on each canvas page', async () => {
  const { createCanvas, DOMMatrix, ImageData, Path2D } = await import('@napi-rs/canvas');
  const { readFile } = await import('node:fs/promises');
  const { runCanvasFallback } = await import('../src/canvas-detector.js');
  Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await readFile(new URL('../public/samples/sample4_ktu_booklet.pdf', import.meta.url))) });
  try {
    const pdf = await loadingTask.promise;
    globalThis.document = { createElement: () => createCanvas(1, 1) };
    assert.equal(pdf.numPages, 3);
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const result = groupAnswersByQuestion(runCanvasFallback(canvas), canvas.width, canvas.height);
      assert.equal(result.questions.length, [2, 3, 1][pageNumber - 1]);
    }
  } finally {
    delete globalThis.document;
    await loadingTask.destroy();
  }
});
