// Spatial anchor detection and answer grouping logic

export function groupAnswersByQuestion(boxes, imgWidth, imgHeight) {
  if (!boxes || boxes.length === 0) return { questions: [], pageMetrics: { fillRatio: 0, diagramCount: 0 } };

  // Sort boxes top-to-bottom
  const sorted = [...boxes].sort((a, b) => a.y - b.y);

  // Identify question anchors: Left margin (x < 22% width) with vertical spacing
  const marginThreshold = imgWidth * 0.22;
  const anchors = [];
  const bodyBoxes = [];

  for (const box of sorted) {
    const isLeftMargin = box.x < marginThreshold && box.width < imgWidth * 0.25;
    const isSpaced = anchors.length === 0 || (box.y - anchors[anchors.length - 1].y > 50);

    if (isLeftMargin && isSpaced && anchors.length < 10) {
      anchors.push({ ...box, qIndex: anchors.length + 1 });
    } else {
      bodyBoxes.push(box);
    }
  }

  // Fallback: If student wrote no distinct margin anchors, create synthetic anchors based on large vertical gaps
  if (anchors.length === 0) {
    anchors.push({ x: 20, y: sorted[0].y, width: 30, height: 25, qIndex: 1 });
    let lastY = sorted[0].y;
    for (const b of sorted) {
      if (b.y - lastY > 120 && anchors.length < 6) {
        anchors.push({ x: 20, y: b.y, width: 30, height: 25, qIndex: anchors.length + 1 });
        lastY = b.y;
      }
    }
  }

  // Group answer ink boxes between consecutive question anchors
  const questions = anchors.map((anchor, idx) => {
    const nextAnchor = anchors[idx + 1];
    const maxY = nextAnchor ? nextAnchor.y : imgHeight;

    const assigned = bodyBoxes.filter(b => b.y >= anchor.y - 15 && b.y < maxY);
    const diagramBoxes = assigned.filter(b => b.width > 90 && b.height > 60);

    const minY = assigned.length ? Math.min(...assigned.map(b => b.y)) : anchor.y;
    const maxBoxY = assigned.length ? Math.max(...assigned.map(b => b.y + b.height)) : anchor.y + anchor.height;
    const verticalSpan = Math.max(20, maxBoxY - minY);
    const inkArea = assigned.reduce((sum, b) => sum + (b.width * b.height), 0);
    const hasMarginBreach = assigned.some(b => b.x + b.width > imgWidth * 0.95);

    return {
      qNumber: `Q${anchor.qIndex}`,
      anchor,
      boxes: assigned,
      verticalSpan,
      inkArea,
      diagramCount: diagramBoxes.length,
      diagramBoxes,
      hasMarginBreach
    };
  });

  const totalInkArea = boxes.reduce((sum, b) => sum + (b.width * b.height), 0);
  const pageFillRatio = Math.min(1, totalInkArea / (imgWidth * imgHeight * 0.5));
  const diagramTotal = questions.reduce((sum, q) => sum + q.diagramCount, 0);

  return {
    questions,
    pageMetrics: {
      totalInkArea,
      pageFillRatio,
      diagramCount: diagramTotal,
      boxCount: boxes.length
    }
  };
}
