// Deterministic Question vs Answer Spatial Partitioning Engine

export function groupAnswersByQuestion(boxes, imgWidth, imgHeight) {
  const empty = {
    questions: [],
    pageMetrics: { totalInkArea: 0, pageFillRatio: 0, diagramCount: 0, boxCount: 0 },
    ignoredBoxes: []
  };

  if (!(imgWidth > 0 && imgHeight > 0) || !boxes || boxes.length === 0) return empty;

  // 1. Filter valid boxes, exclude bottom watermark (CamScanner / KTUAssist in bottom 6%), and sort top-to-bottom
  const sorted = boxes.filter(b =>
    [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
    b.width >= 4 && b.height >= 4 &&
    b.y < imgHeight * 0.94
  ).sort((a, b) => a.y - b.y || a.x - b.x);

  if (!sorted.length) return empty;

  // 2. Adaptively detect page layout and left text margin
  // Sample line starts across the page height to find the baseline left edge of body text
  const lineLefts = [];
  for (let y = Math.round(imgHeight * 0.08); y < imgHeight * 0.88; y += 45) {
    const nearby = sorted.filter(b => Math.abs(b.y - y) < 25);
    if (nearby.length > 0) {
      lineLefts.push(Math.min(...nearby.map(b => b.x)));
    }
  }
  lineLefts.sort((a, b) => a - b);
  const bodyLeft = lineLefts.length > 0
    ? lineLefts[Math.floor(lineLefts.length * 0.15)]
    : imgWidth * 0.20;

  // Outdented margin markers (e.g. "1.", "2.", "7.", "Ans)", "*", "•")
  // These sit to the left of the body text and are compact horizontally
  const markers = sorted.filter(b =>
    (b.x < bodyLeft - 18 || (b.x < bodyLeft && b.x + b.width <= bodyLeft + 15)) &&
    b.width <= 85
  );

  const topMarkers = markers.filter(m => m.y < 150);
  const ansMarkers = markers.filter(m => m.y >= 120 && m.y <= 340);

  // 3. Classify Page Layout Structure:
  // Case A: Paired [Question Number] + [Ans)] markers
  // Case B: Top Question only (e.g. "7.", "*", or line 1 question statement)
  // Case C: Body Question above an "Ans)" marker
  // Case D: Continuation page (no question header; entire page is student answer)
  const units = [];

  if (topMarkers.length > 0 && ansMarkers.length > 0) {
    // Paired Q# + Ans (e.g. Page 1, Page 2)
    const qAnchor = topMarkers[0];
    const ansAnchor = ansMarkers[0];
    const ansStartY = ansAnchor.y - 35;
    units.push({
      qAnchor,
      ansAnchor,
      qStartY: qAnchor.y - 15,
      ansStartY,
      isContinuation: false
    });
  } else if (topMarkers.length > 0) {
    // Top Question only (e.g. Page 3, Page 6, Page 7, Page 8)
    const qAnchor = topMarkers[0];
    // Question statement is the first 1-2 lines
    const nearby = sorted.filter(b => b.y < qAnchor.y + 160 && b !== qAnchor && b.y < qAnchor.y + 90);
    const splitY = nearby.length > 0
      ? Math.max(...nearby.map(b => b.y + b.height)) + 12
      : qAnchor.y + 75;

    units.push({
      qAnchor,
      ansAnchor: null,
      qStartY: qAnchor.y - 15,
      ansStartY: splitY,
      isContinuation: false
    });
  } else if (ansMarkers.length > 0) {
    // Body Question above Ans
    const ansAnchor = ansMarkers[0];
    const ansStartY = ansAnchor.y - 35;
    const bodyAbove = sorted.filter(b => b.y < ansStartY);
    units.push({
      qAnchor: bodyAbove.length > 0 ? bodyAbove[0] : null,
      ansAnchor,
      qStartY: bodyAbove.length > 0 ? Math.min(...bodyAbove.map(b => b.y)) - 12 : 0,
      ansStartY,
      isContinuation: false
    });
  } else {
    // Continuation Page (e.g. Page 4, Page 5)
    units.push({
      qAnchor: null,
      ansAnchor: null,
      qStartY: 0,
      ansStartY: 0,
      isContinuation: true
    });
  }

  // 4. Partition content into Question Text vs Answer Content
  const questions = units.map((unit, idx) => {
    let questionBoxes = [];
    let answerBoxes = [];

    if (unit.isContinuation) {
      questionBoxes = [];
      answerBoxes = sorted;
    } else {
      questionBoxes = sorted.filter(b =>
        b.y >= unit.qStartY - 5 && b.y < unit.ansStartY &&
        b !== unit.ansAnchor && b !== unit.qAnchor
      );
      answerBoxes = sorted.filter(b =>
        b.y >= unit.ansStartY &&
        b !== unit.qAnchor
      );
    }

    // Detect Diagrams & Tables inside the answer
    const diagramBoxes = [];
    for (const b of answerBoxes) {
      if (b.width > 90 && b.height > 55) {
        diagramBoxes.push(b);
      }
    }

    // Table detection: Multiple rows containing 3 or more aligned column cells
    const rowBuckets = {};
    for (const b of answerBoxes) {
      const r = Math.round(b.y / 28) * 28;
      rowBuckets[r] = (rowBuckets[r] || 0) + 1;
    }
    const tableRows = Object.values(rowBuckets).filter(cnt => cnt >= 3).length;
    const isTablePresent = tableRows >= 2;

    const totalDiagrams = diagramBoxes.length + (isTablePresent ? 2 : 0);

    const minY = answerBoxes.length ? Math.min(...answerBoxes.map(b => b.y)) : unit.ansStartY;
    const maxY = answerBoxes.length ? Math.max(...answerBoxes.map(b => b.y + b.height)) : unit.ansStartY + 60;
    const verticalSpan = Math.max(40, maxY - minY);
    const inkArea = answerBoxes.reduce((sum, b) => sum + (b.width * b.height), 0);
    const hasMarginBreach = answerBoxes.some(b => b.x + b.width > imgWidth * 0.95);

    return {
      qNumber: unit.isContinuation ? 'ANS (Cont.)' : `Q${idx + 1}`,
      isContinuation: unit.isContinuation,
      anchor: unit.ansAnchor || unit.qAnchor || (answerBoxes[0] || null),
      qAnchor: unit.qAnchor,
      ansAnchor: unit.ansAnchor,
      questionBoxes,
      boxes: answerBoxes,
      answerBoxes,
      verticalSpan,
      inkArea,
      diagramCount: totalDiagrams,
      diagramBoxes,
      isTablePresent,
      hasMarginBreach
    };
  });

  const totalInkArea = sorted.reduce((sum, b) => sum + (b.width * b.height), 0);
  const totalDiagrams = questions.reduce((sum, q) => sum + q.diagramCount, 0);

  return {
    questions,
    ignoredBoxes: [],
    pageMetrics: {
      totalInkArea,
      pageFillRatio: Math.min(1, totalInkArea / (imgWidth * imgHeight * 0.45)),
      diagramCount: totalDiagrams,
      boxCount: sorted.length
    }
  };
}
