// Satirical KTU evaluation grading algorithm (Single page and multi-page booklet)

export function evaluateAnswers(groupedData, examinerMood, diceRoll = 6) {
  return evaluateBooklet([{ pageNumber: 1, groupedData }], examinerMood, diceRoll);
}

export function evaluateBooklet(pagesList, examinerMood, diceRoll = 6) {
  if (!pagesList || pagesList.length === 0) {
    return {
      totalMarks: 0,
      maxMarks: 100,
      grade: "F",
      isPassed: false,
      breakdown: [],
      remarks: ["Empty booklet submitted."],
      pageMetrics: { totalInkArea: 0, pageFillRatio: 0, diagramCount: 0, totalPages: 0 },
      pageBreakdowns: {}
    };
  }

  const maxPerQuestion = 10;
  const allQuestionsBreakdown = [];
  const pageBreakdowns = {};
  let totalRawMarks = 0;
  let totalDiagrams = 0;
  let totalInkArea = 0;
  let totalFillRatioSum = 0;

  let questionSeq = 0;
  for (const p of pagesList) {
    const pageNum = p.pageNumber;
    const { questions, pageMetrics } = p.groupedData || { questions: [], pageMetrics: {} };

    pageBreakdowns[pageNum] = [];
    totalDiagrams += pageMetrics?.diagramCount || 0;
    totalInkArea += pageMetrics?.totalInkArea || 0;
    totalFillRatioSum += pageMetrics?.pageFillRatio || 0;

    for (const q of (questions || [])) {
      if (!q.isContinuation) {
        questionSeq++;
        q.qNumber = `Q${questionSeq}`;
      } else {
        q.qNumber = `Q${questionSeq || 1} (Cont.)`;
      }

      // 1. Length & Ink factor (Max 6 marks)
      const heightFactor = Math.min(1, q.verticalSpan / 350);
      const inkFactor = Math.min(1, q.inkArea / 25000);
      let qMark = (heightFactor * 3.5) + (inkFactor * 2.5);

      // 2. Diagram Bonus (+3.5 marks per box/flowchart)
      const diagramBonus = Math.min(4, q.diagramCount * 3.5);
      qMark += diagramBonus;

      // 3. Margin breach quirk
      if (q.hasMarginBreach) qMark += 0.5;

      qMark = Math.min(maxPerQuestion, Math.max(1, Math.round(qMark * 2) / 2));
      totalRawMarks += qMark;

      const item = {
        pageNumber: pageNum,
        qNumber: pagesList.length > 1 ? `P${pageNum} - ${q.qNumber}` : q.qNumber,
        originalQNumber: q.qNumber,
        isContinuation: !!q.isContinuation,
        marks: qMark,
        maxMarks: maxPerQuestion,
        verticalSpan: Math.round(q.verticalSpan),
        diagrams: q.diagramCount,
        hasDiagram: q.diagramCount > 0,
        anchorY: q.ansAnchor ? q.ansAnchor.y : (q.boxes.length ? q.boxes[0].y : (q.anchor ? q.anchor.y : 100))
      };

      allQuestionsBreakdown.push(item);
      pageBreakdowns[pageNum].push(item);
    }
  }

  const totalQuestions = allQuestionsBreakdown.length || 1;
  const maxPossible = totalQuestions * maxPerQuestion;
  let finalScore = (totalRawMarks / maxPossible) * 100;

  // Multi-page Booklet Heft Bonus: Asking for additional sheets intimidates the evaluator!
  if (pagesList.length > 1) {
    const pageBonus = Math.min(12, (pagesList.length - 1) * 3);
    finalScore += pageBonus;
  }

  // Apply Examiner Mood modifier
  finalScore = finalScore * examinerMood.multiplier;
  if (examinerMood.bonus) finalScore += examinerMood.bonus;

  // Food Coma: Flat 52 marks
  if (examinerMood.forceClustered) {
    finalScore = 52 + (Math.random() * 4 - 2);
  }

  // Pre-lunch hangry hour penalty / supply quota
  if (examinerMood.hunger > 90 && finalScore >= 40 && finalScore < 55) {
    finalScore = 38.5; // Classic KTU borderline fail
  }

  const baseScore = Math.min(100, Math.max(0, Math.round(finalScore * 10) / 10));

  // Moderation Dice Fate: High number = marks preserved; Low number = marks chopped
  const diceEffects = {
    6: { factor: 1.00, chopPct: '0%', text: 'Roll 6 (Pure Mercy) — 0% marks chopped. Full marks preserved.' },
    5: { factor: 0.95, chopPct: '5%', text: 'Roll 5 (Gentle Touch) — Only 5% marks chopped. Safe pass intact.' },
    4: { factor: 0.88, chopPct: '12%', text: 'Roll 4 (Standard Trim) — 12% chopped. Passing grade maintained.' },
    3: { factor: 0.55, chopPct: '45%', text: 'Roll 3 (Mark Chopper) — 45% chopped! Drops below 40 (Borderline Fail).' },
    2: { factor: 0.40, chopPct: '60%', text: 'Roll 2 (Camp Guillotine) — 60% chopped! Supplementary exam confirmed.' },
    1: { factor: 0.25, chopPct: '75%', text: 'Roll 1 (Catastrophic 1) — 75% chopped! Evaluator tore booklet.' }
  };

  const roll = Math.max(1, Math.min(6, parseInt(diceRoll, 10) || 6));
  const effect = diceEffects[roll];

  let postDiceScore;
  if (roll <= 3) {
    postDiceScore = Math.min(38.5, Math.round(baseScore * effect.factor * 10) / 10);
  } else {
    postDiceScore = baseScore >= 40
      ? Math.max(40.0, Math.round(baseScore * effect.factor * 10) / 10)
      : Math.round(baseScore * effect.factor * 10) / 10;
  }
  finalScore = Math.min(100, Math.max(0, Math.round(postDiceScore * 10) / 10));

  // Determine KTU Grade
  let grade = "F";
  if (finalScore >= 90) grade = "O";
  else if (finalScore >= 80) grade = "A+";
  else if (finalScore >= 70) grade = "A";
  else if (finalScore >= 60) grade = "B+";
  else if (finalScore >= 50) grade = "B";
  else if (finalScore >= 45) grade = "C";
  else if (finalScore >= 40) grade = "P";
  else grade = "F";

  const avgFillRatio = totalFillRatioSum / pagesList.length;

  // Context-aware troll remarks for the entire booklet
  const remarks = [];
  remarks.push(`🎲 Moderation Dice [Roll ${roll}/6]: ${effect.text} (Calculated ${baseScore} → Final ${finalScore}/100)`);
  remarks.push(`Valuation Shift (${examinerMood.time}): ${examinerMood.status} - "${examinerMood.quote}"`);

  if (pagesList.length > 1) {
    remarks.push(`Full Booklet Scrutiny (${pagesList.length} Pages Evaluated): +${Math.min(12, (pagesList.length - 1) * 3)}m booklet heft bonus applied for asking invigilator for additional sheets.`);
  }

  if (totalDiagrams > 0) {
    remarks.push(`Diagram Volume (${totalDiagrams} Flowchart/Boxes Across Booklet): Diagram bonus is capped at 4 marks per region, within its 10-mark maximum.`);
  } else {
    remarks.push("Zero Diagrams in Booklet: Student dared to submit pure text without arbitrary block diagrams.");
  }

  if (avgFillRatio > 0.55) {
    remarks.push("Heavy Paper Weight: Dense ink usage detected. Evaluator physically respected the booklet heft.");
  } else if (avgFillRatio < 0.25) {
    remarks.push("Excessive Whitespace: Low detected coverage; no additional whitespace penalty applied.");
  }

  if (grade === "F") {
    remarks.push("Final Verdict: 38/100 syndrome. Please deposit ₹600 for Revaluation and ₹500 for Photocopy.");
  } else if (grade === "O" || grade === "A+") {
    remarks.push("Final Verdict: Legendary Booklet! Page thickness and diagram count stunned the entire valuation camp.");
  } else {
    remarks.push("Final Verdict: B.Tech survival achieved across all booklet pages. Proceed to placement drive.");
  }

  return {
    totalMarks: finalScore,
    baseMarks: baseScore,
    diceRoll: roll,
    diceEffect: effect,
    maxMarks: 100,
    grade,
    isPassed: finalScore >= 40,
    breakdown: allQuestionsBreakdown,
    pageBreakdowns,
    remarks,
    pageMetrics: {
      totalInkArea,
      pageFillRatio: avgFillRatio,
      diagramCount: totalDiagrams,
      totalPages: pagesList.length
    },
    examinerMood
  };
}
