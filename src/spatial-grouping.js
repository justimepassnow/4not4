// Deterministic Question vs Answer Spatial Partitioning Engine

export function groupAnswersByQuestion(boxes, imgWidth, imgHeight) {
  const empty = {
    questions: [],
    pageMetrics: { totalInkArea: 0, pageFillRatio: 0, diagramCount: 0, boxCount: 0 },
    ignoredBoxes: []
  };

  if (!(imgWidth > 0 && imgHeight > 0) || !boxes || boxes.length === 0) return empty;

  // 1. Filter valid boxes and sort top-to-bottom
  const sorted = boxes.filter(b =>
    [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width > 4 && b.height > 4
  ).sort((a, b) => a.y - b.y || a.x - b.x);

  if (!sorted.length) return empty;

  // Margin column: Left ~18% of page (or max 160px)
  const marginX = Math.min(imgWidth * 0.18, 155);

  const marginBoxes = [];
  const bodyBoxes = [];

  for (const b of sorted) {
    // If box starts inside the left margin and is compact horizontally
    if (b.x < marginX && b.x + b.width < marginX + 35 && b.width < imgWidth * 0.22) {
      marginBoxes.push(b);
    } else {
      bodyBoxes.push(b);
    }
  }

  // 2. Identify Question Units:
  // In university exam answer sheets, students structure their writing as:
  //   [Question Number] (e.g. "1.", "2.")
  //   [Question Statement] (1-2 lines of text)
  //   [Ans) Marker]
  //   [Answer Content] (formulas, paragraphs, tables, diagrams)
  //
  // Pairing rule:
  // If margin marker M1 is followed by margin marker M2 within 260px:
  //   M1 = Question Number Anchor
  //   M2 = Answer Start Anchor ("Ans)")
  //   They are the SAME question!
  //
  // Single marker rule:
  // If a margin marker M has body text above it (e.g. "Explain significance of... ?"):
  //   M = Answer Start Anchor ("Ans)")
  //   The text above M is the Question Statement!
  // If a margin marker M has NO body text above it:
  //   M = Question Number Anchor
  //   The answer starts after the first 1-2 lines next to M.

  const units = [];
  let m = 0;

  while (m < marginBoxes.length) {
    const cur = marginBoxes[m];
    const next = marginBoxes[m + 1];

    // Check if cur and next form a [Question Number] + [Ans)] pair
    if (next && (next.y - cur.y < 260)) {
      units.push({
        qAnchor: cur,
        ansAnchor: next,
        qStartY: cur.y - 15,
        ansStartY: next.y - 10
      });
      m += 2;
    } else {
      // Single margin box. Does it have body text above it?
      const prevAnsBottom = units.length > 0 ? units.at(-1).ansStartY + 50 : 0;
      const bodyAbove = bodyBoxes.filter(b => b.y < cur.y - 8 && b.y >= prevAnsBottom);

      if (bodyAbove.length > 0) {
        // Body text above cur -> cur is "Ans)"! The text above is the Question!
        const qStartY = Math.min(...bodyAbove.map(b => b.y)) - 12;
        units.push({
          qAnchor: bodyAbove[0], // First line of question text
          ansAnchor: cur,        // "Ans)" in margin
          qStartY,
          ansStartY: cur.y - 10
        });
      } else {
        // No body text above cur -> cur is Question Number!
        // Estimate answer start: 1-2 lines below cur (~65px)
        units.push({
          qAnchor: cur,
          ansAnchor: null,
          qStartY: cur.y - 15,
          ansStartY: cur.y + Math.max(cur.height + 25, 75)
        });
      }
      m += 1;
    }
  }

  // Fallback: If no margin marks were found at all, treat whole page as 1 unit
  if (units.length === 0 && bodyBoxes.length > 0) {
    units.push({
      qAnchor: bodyBoxes[0],
      ansAnchor: null,
      qStartY: Math.max(0, bodyBoxes[0].y - 15),
      ansStartY: bodyBoxes[0].y + 75
    });
  }

  // 3. Partition content into Question Text vs Answer Content
  const questions = units.map((unit, idx) => {
    const nextUnit = units[idx + 1];
    const unitMaxY = nextUnit ? nextUnit.qStartY : imgHeight;

    // Question boxes: strictly between qStartY and ansStartY
    const questionBoxes = sorted.filter(b =>
      b.y >= unit.qStartY - 5 && b.y < unit.ansStartY &&
      b !== unit.ansAnchor
    );

    // Answer boxes: strictly between ansStartY and next question's start
    const answerBoxes = sorted.filter(b =>
      b.y >= unit.ansStartY && b.y < unitMaxY &&
      b !== unit.qAnchor
    );

    // Detect Diagrams & Tables inside the answer
    const diagramBoxes = [];
    for (const b of answerBoxes) {
      if (b.width > 95 && b.height > 55) {
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
      qNumber: `Q${idx + 1}`,
      anchor: unit.ansAnchor || unit.qAnchor,
      qAnchor: unit.qAnchor,
      ansAnchor: unit.ansAnchor,
      questionBoxes,
      boxes: answerBoxes,        // The student's answer boxes!
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
