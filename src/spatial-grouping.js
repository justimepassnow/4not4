// Geometric region estimates. The detector does not recognise written numbers.
export function groupAnswersByQuestion(boxes, imgWidth, imgHeight) {
  const empty = { questions: [], pageMetrics: { totalInkArea: 0, pageFillRatio: 0, diagramCount: 0, boxCount: 0 }, ignoredBoxes: [] };
  if (!(imgWidth > 0 && imgHeight > 0)) return empty;
  const sorted = (boxes || []).filter(b =>
    [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width > 0 && b.height > 0
  ).sort((a, b) => a.y - b.y || a.x - b.x);
  if (!sorted.length) return empty;

  // A marker must be compact, wholly in the margin, and near answer content.
  // This rejects long left-aligned prose, borders, and isolated page numbers.
  const candidates = sorted.filter(b =>
    b.x + b.width < imgWidth * 0.22 && b.width < imgWidth * 0.10 &&
    b.height < imgHeight * 0.055 &&
    sorted.some(other => other !== b && other.x >= imgWidth * 0.16 &&
      other.width > imgWidth * 0.15 &&
      Math.abs(other.y - b.y) < imgHeight * 0.045)
  );
  const anchors = [];
  for (const b of candidates) {
    if (!anchors.length || b.y - anchors.at(-1).y > imgHeight * 0.04) {
      anchors.push({ ...b, source: b, inferred: false });
    }
  }
  // Separate a detached document header from the first marked answer.
  const firstY = anchors[0]?.y;
  const ignoredBoxes = firstY === undefined ? [] : sorted.filter(b => b.y + b.height < firstY - imgHeight * 0.04);
  const ignored = new Set(ignoredBoxes);
  const markerBoxes = new Set(anchors.map(a => a.source));
  const bodyBoxes = sorted.filter(b => !ignored.has(b) && !markerBoxes.has(b));

  if (!anchors.length) {
    // Measure whitespace from the end of preceding content, not from the
    // previous anchor: a long continuous answer must stay in one region.
    const heights = sorted.map(b => b.height).sort((a, b) => a - b);
    const gapThreshold = Math.max(imgHeight * 0.065, heights[Math.floor(heights.length / 2)] * 3);
    let bottom = -Infinity;
    for (const b of sorted) {
      if (b.y - bottom > gapThreshold) {
        anchors.push({ x: Math.max(0, b.x - 35), y: b.y, width: 28, height: Math.min(25, b.height), inferred: true });
      }
      bottom = Math.max(bottom, b.y + b.height);
    }
  }

  const assignments = anchors.map(() => []);
  for (const b of bodyBoxes) {
    // Small vertical tolerances keep a line with its marker when the detector
    // places the handwritten number slightly below the line's top edge.
    let index = 0;
    for (let i = 1; i < anchors.length; i++) {
      if (b.y + Math.min(b.height / 2, imgHeight * 0.01) >= anchors[i].y) index = i;
      else break;
    }
    assignments[index].push(b);
  }
  const questions = anchors.map((anchor, index) => {
    const assigned = assignments[index];
    const diagramBoxes = assigned.filter(b => b.width > 90 && b.height > 60);
    const minY = assigned.length ? Math.min(...assigned.map(b => b.y)) : anchor.y;
    const maxY = assigned.length ? Math.max(...assigned.map(b => b.y + b.height)) : anchor.y + anchor.height;
    return {
      qNumber: `R${index + 1}`, anchor, boxes: assigned,
      verticalSpan: Math.max(20, maxY - minY),
      inkArea: assigned.reduce((sum, b) => sum + b.width * b.height, 0),
      diagramCount: diagramBoxes.length, diagramBoxes,
      hasMarginBreach: assigned.some(b => b.x + b.width > imgWidth * 0.95)
    };
  });
  const totalInkArea = sorted.filter(b => !ignored.has(b)).reduce((sum, b) => sum + b.width * b.height, 0);
  return { questions, ignoredBoxes, pageMetrics: {
    totalInkArea, pageFillRatio: Math.min(1, totalInkArea / (imgWidth * imgHeight * 0.5)),
    diagramCount: questions.reduce((sum, q) => sum + q.diagramCount, 0),
    boxCount: sorted.length - ignoredBoxes.length
  } };
}
