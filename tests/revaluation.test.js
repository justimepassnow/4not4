import test from 'node:test';
import assert from 'node:assert/strict';
import { revalueResult } from '../src/troll-grader.js';
const result = (score = 38) => ({ totalMarks: score, maxMarks: 100, grade: 'F', isPassed: false, breakdown: [{ marks: 4 }], pageBreakdowns: {}, remarks: [] });
test('lower 65% of the draw leaves the score and grade unchanged', () => {
  const original = result();
  for (const draw of [0, 0.5, 0.649999]) {
    const review = revalueResult(original, () => draw);
    assert.equal(review.totalMarks, 38);
    assert.equal(review.grade, 'F');
    assert.equal(review.revaluation.changed, false);
  }
});
test('upper 35% always increases the score, even at the smallest reroll', () => {
  const values = [0.65, 0];
  const review = revalueResult(result(), () => values.shift());
  assert.equal(review.totalMarks, 39);
  assert.equal(review.revaluation.changed, true);
});
test('higher reroll updates grade and pass status without changing region marks', () => {
  const original = result();
  const review = revalueResult(original, () => 0.999999);
  assert.equal(review.totalMarks, 100);
  assert.equal(review.grade, 'O');
  assert.equal(review.isPassed, true);
  assert.equal(review.breakdown, original.breakdown);
  assert.equal(original.totalMarks, 38);
});
test('a second review is blocked after either outcome', () => {
  for (const draw of [0.1, 0.8]) {
    const first = revalueResult(result(), () => draw);
    const second = revalueResult(first, () => { throw new Error('Must not reroll'); });
    assert.equal(second, first);
    assert.equal(second.revaluation.attempt, 1);
  }
});
test('ceiling and missing answers cannot be rerolled', () => {
  const full = result(100);
  assert.equal(revalueResult(full), full);
  const blank = { ...result(0), breakdown: [] };
  assert.equal(revalueResult(blank), blank);
  assert.equal(revalueResult(null), null);
  assert.equal(revalueResult(result(99.9), () => 0.9).totalMarks, 100);
});

test('borderline outcome has a 20% boundary and produces 35 through 39', async () => {
  const { applyBorderlineOutcome } = await import('../src/troll-grader.js');
  for (let score = 35; score <= 39; score++) {
    const draws = [0.199999, (score - 35) / 5];
    const verdict = applyBorderlineOutcome(result(80), () => draws.shift());
    assert.equal(verdict.totalMarks, score);
    assert.equal(verdict.grade, 'F');
    assert.equal(verdict.isPassed, false);
    assert.equal(verdict.borderlineMode, true);
    assert.equal(verdict.moderationMarks, 80);
    const review = revalueResult(verdict, () => { throw new Error('Special revaluation must not reroll'); });
    assert.equal(review.totalMarks, 39);
    assert.equal(review.revaluation.changed, score < 39);
  }
  const normal = applyBorderlineOutcome(result(80), () => 0.2);
  assert.equal(normal.totalMarks, 80);
  assert.equal(normal.borderlineMode, false);
  assert.equal(applyBorderlineOutcome(normal, () => { throw new Error('Cannot redraw'); }), normal);
});

test('empty documents cannot receive a borderline score', async () => {
  const { applyBorderlineOutcome } = await import('../src/troll-grader.js');
  const empty = { ...result(0), breakdown: [] };
  assert.equal(applyBorderlineOutcome(empty, () => 0), empty);
});
