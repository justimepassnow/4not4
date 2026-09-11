// Robust Question vs Answer spatial partitioning and grouping engine

export function groupAnswersByQuestion(boxes, imgWidth, imgHeight) {
  const empty = {
    questions: [],
    pageMetrics: { totalInkArea: 0, pageFillRatio: 0, diagramCount: 0, boxCount: 0 },
    ignoredBoxes: []
  };

  if (!(imgWidth > 0 && imgHeight > 0) || !boxes || boxes.length === 0) return empty;

  // Filter valid finite boxes and sort top-to-bottom, left-to-right
  const sorted = boxes.filter(b =>
    [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width > 3 && b.height > 3
  ).sort((a, b) => a.y - b.y || a.x - b.x);

  if (!sorted.length) return empty;

  // Dynamic Left Margin Threshold (typically ~18% to 22% of image width)
  const marginThreshold = Math.min(imgWidth * 0.22, 170);

  // 1. Separate margin boxes from main body boxes
  const marginBoxes = [];
  const bodyBoxes = [];

  for (const b of sorted) {
    const isMargin = b.x < marginThreshold && b.x + b.width < marginThreshold + 30 && b.width < imgWidth * 0.25;
    if (isMargin) {
      marginBoxes.push(b);
    } else {
      bodyBoxes.push(b);
    }
  }

  // 2. Classify margin boxes into Question Numbers vs "Ans)" Markers
  // An "Ans)" or "Ans" marker typically has a wider aspect ratio (w/h >= 1.45)
  // A question number like "1.", "2.", "Q1" is more compact (w/h < 1.45)
  const classifiedMargin = marginBoxes.map(b => {
    const aspectRatio = b.width / Math.max(1, b.height);
    const isAnswerMarker = aspectRatio >= 1.45 || (b.width > 42 && b.height < 35);
    return { ...b, isAnswerMarker };
  });

  // 3. Form Question Units from Margin Markers & Body Content
  // A question unit consists of:
  // - questionNumberAnchor (e.g. "1.", "2.")
  // - answerStartAnchor (e.g. "Ans)")
  // - questionBoundaryY (where question text starts)
  // - answerBoundaryY (where answer content starts)
  const questionUnits = [];

  let mIdx = 0;
  while (mIdx < classifiedMargin.length) {
    const current = classifiedMargin[mIdx];
    const next = classifiedMargin[mIdx + 1];

    if (!current.isAnswerMarker) {
      // Current is Question Number (e.g. "1.")
      if (next && next.isAnswerMarker && (next.y - current.y < 260)) {
        // Paired: "1." followed by "Ans)"
        questionUnits.push({
          qAnchor: current,
          ansAnchor: next,
          qStartY: current.y - 15,
          ansStartY: next.y - 10
        });
        mIdx += 2;
      } else {
        // "1." with no explicit "Ans)" in margin; answer starts ~60-80px below question
        questionUnits.push({
          qAnchor: current,
          ansAnchor: null,
          qStartY: current.y - 15,
          ansStartY: current.y + Math.max(current.height + 15, 65)
        });
        mIdx++;
      }
    } else {
      // Current is "Ans)" without preceding question number in margin (like in Image 2)
      // Check if there is question text in body above this "Ans)"
      const bodyAbove = bodyBoxes.filter(b => b.y < current.y - 10 && (questionUnits.length === 0 || b.y > questionUnits.at(-1).ansStartY));
      const qStartY = bodyAbove.length > 0 ? Math.min(...bodyAbove.map(b => b.y)) - 10 : Math.max(0, current.y - 80);

      questionUnits.push({
        qAnchor: bodyAbove.length > 0 ? bodyAbove[0] : current,
        ansAnchor: current,
        qStartY,
        ansStartY: current.y - 10
      });
      mIdx++;
    }
  }

  // Fallback: If no margin marks were detected at all, infer from top of page or large vertical gaps
  if (questionUnits.length === 0 && bodyBoxes.length > 0) {
    questionUnits.push({
      qAnchor: bodyBoxes[0],
      ansAnchor: null,
      qStartY: Math.max(0, bodyBoxes[0].y - 15),
      ansStartY: bodyBoxes[0].y + 70
    });
  }

  // 4. Partition boxes into Question Text vs Answer Body for each question unit
  const questions = questionUnits.map((unit, idx) => {
    const nextUnit = questionUnits[idx + 1];
    const unitEndBottomY = nextUnit ? nextUnit.qStartY : imgHeight;

    // Question boxes: between unit.qStartY and unit.ansStartY
    const qBoxes = sorted.filter(b =>
      b.y >= unit.qStartY - 5 && b.y < unit.ansStartY
    );

    // Answer boxes: between unit.ansStartY and next question's start
    const aBoxes = sorted.filter(b =>
      b.y >= unit.ansStartY && b.y < unitEndBottomY
    );

    // Detect Diagrams & Tables inside the answer
    // 1) Large rectangular diagram boxes
    // 2) Horizontally aligned table row clusters
    const diagramBoxes = [];
    const tableBoxes = [];

    for (const b of aBoxes) {
      const isDiagram = b.width > 90 && b.height > 55;
      if (isDiagram) {
        diagramBoxes.push(b);
      }
    }

    // Table detection: 3 or more boxes sharing similar Y with distinct X (grid columns)
    const yBuckets = {};
    for (const b of aBoxes) {
      const bucket = Math.round(b.y / 25) * 25;
      yBuckets[bucket] = (yBuckets[bucket] || 0) + 1;
    }
    const tableRows = Object.values(yBuckets).filter(count => count >= 3).length;
    const isTablePresent = tableRows >= 2;

    const totalDiagrams = diagramBoxes.length + (isTablePresent ? 2 : 0);

    const minY = aBoxes.length ? Math.min(...aBoxes.map(b => b.y)) : unit.ansStartY;
    const maxY = aBoxes.length ? Math.max(...aBoxes.map(b => b.y + b.height)) : unit.ansStartY + 50;
    const verticalSpan = Math.max(30, maxY - minY);
    const inkArea = aBoxes.reduce((sum, b) => sum + (b.width * b.height), 0);
    const hasMarginBreach = aBoxes.some(b => b.x + b.width > imgWidth * 0.95);

    return {
      qNumber: `Q${idx + 1}`,
      anchor: unit.qAnchor || unit.ansAnchor,
      qAnchor: unit.qAnchor,
      ansAnchor: unit.ansAnchor,
      questionBoxes: qBoxes,
      boxes: aBoxes, // The student's actual answer boxes!
      answerBoxes: aBoxes,
      verticalSpan,
      inkArea,
      diagramCount: totalDiagrams,
      diagramBoxes,
      isTablePresent,
      hasMarginBreach
    };
  });

  const totalInkArea = sorted.reduce((sum, b) => sum + (b.width * b.height), 0);
  const diagramCount = questions.reduce((sum, q) => sum + q.diagramCount, 0);

  return {
    questions,
    ignoredBoxes: [],
    pageMetrics: {
      totalInkArea,
      pageFillRatio: Math.min(1, totalInkArea / (imgWidth * imgHeight * 0.45)),
      diagramCount,
      boxCount: sorted.length
    }
  };
}
