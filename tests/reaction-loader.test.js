import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReactionImage } from '../src/reaction-loader.js';
test('waits for a fresh image to load without relying on decode', async () => {
  const image = { naturalWidth: 1200, complete: false };
  const pending = loadReactionImage('/reaction.png', () => image);
  assert.equal(image.src, '/reaction.png');
  image.onload();
  assert.equal(await pending, image);
});
test('accepts an already cached image', async () => {
  const image = { naturalWidth: 1200, complete: true };
  assert.equal(await loadReactionImage('/cached.png', () => image), image);
});
test('reports a missing asset without leaving a pending promise', async () => {
  const image = { naturalWidth: 0, complete: false };
  const pending = loadReactionImage('/missing.png', () => image);
  image.onerror();
  await assert.rejects(pending, /failed/);
  assert.equal(image.onload, null);
});
