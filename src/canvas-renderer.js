// Canvas renderer for answer sheet visualization, bounding boxes, and red-pen teacher annotations

export function renderEvaluationCanvas({
  canvas,
  image,
  groupedData,
  evaluationResult,
  showBoxes = true,
  showRedPen = true,
  currentPageNumber = 1
}) {
  if (!canvas || !image) return;

  const ctx = canvas.getContext('2d');
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;

  canvas.width = w;
  canvas.height = h;

  // 1. Draw base student answer sheet
  ctx.drawImage(image, 0, 0, w, h);

  const { questions } = groupedData;

  // 2. Render OCR Bounding Boxes Layer
  if (showBoxes && questions) {
    for (const q of questions) {
      // Draw Question Anchor & Question Text in Blue
      if (q.qAnchor) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(q.qAnchor.x, q.qAnchor.y, q.qAnchor.width, q.qAnchor.height);

        ctx.fillStyle = 'rgba(37, 99, 235, 0.9)';
        ctx.fillRect(q.qAnchor.x, Math.max(0, q.qAnchor.y - 20), 88, 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`${q.qNumber}: QUESTION`, q.qAnchor.x + 4, Math.max(14, q.qAnchor.y - 5));
      }

      // Draw Question Text lines (subtle dashed blue outline)
      if (q.questionBoxes && q.questionBoxes.length > 0) {
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.5;
        for (const qb of q.questionBoxes) {
          if (qb !== q.qAnchor) {
            ctx.strokeRect(qb.x, qb.y, qb.width, qb.height);
          }
        }
        ctx.setLineDash([]);
      }

      // Draw Answer Start Anchor (Ans marker) in Green
      if (q.ansAnchor && q.ansAnchor !== q.qAnchor) {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(q.ansAnchor.x, q.ansAnchor.y, q.ansAnchor.width, q.ansAnchor.height);

        ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
        ctx.fillRect(q.ansAnchor.x, Math.max(0, q.ansAnchor.y - 20), 75, 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`${q.qNumber}: ANS`, q.ansAnchor.x + 4, Math.max(14, q.ansAnchor.y - 5));
      }

      // Draw Answer Content Boxes (Green, or Amber for Diagrams/Tables)
      for (const box of q.boxes) {
        if (box === q.ansAnchor) continue;
        const isDiagram = box.width > 90 && box.height > 55;
        if (isDiagram) {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(box.x, box.y, box.width, box.height);

          ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
          ctx.fillRect(box.x, Math.max(0, box.y - 18), 125, 18);
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText('DIAGRAM / TABLE (+3.5)', box.x + 4, Math.max(12, box.y - 4));
        } else {
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(box.x, box.y, box.width, box.height);
        }
      }
    }
  }

  // 3. Render Red Pen Evaluator Annotations Layer
  if (showRedPen && evaluationResult) {
    const items = (currentPageNumber && evaluationResult.pageBreakdowns && evaluationResult.pageBreakdowns[currentPageNumber])
      ? evaluationResult.pageBreakdowns[currentPageNumber]
      : (evaluationResult.breakdown || []);

    ctx.save();

    for (const item of items) {
      const yPos = item.anchorY + 30;
      const rightX = Math.min(w - 70, w * 0.85);

      // Red Checkmark (✔)
      drawRedCheckmark(ctx, Math.max(10, w * 0.18), yPos + 10);

      // Red Squiggly Underline
      drawSquigglyUnderline(ctx, Math.max(50, w * 0.25), yPos + 35, Math.min(w * 0.5, 300));

      // Circled Question Mark
      drawCircledMark(ctx, rightX, yPos, `${item.marks}`);
    }

    // Official KTU Evaluation Stamp (Shows cumulative total booklet marks & grade!)
    drawKtuStamp(ctx, w - 220, h - 220, evaluationResult.grade, evaluationResult.totalMarks);

    ctx.restore();
  }
}

function drawRedCheckmark(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(x, y + 10);
  ctx.lineTo(x + 12, y + 25);
  ctx.lineTo(x + 38, y - 10);
  ctx.stroke();
  ctx.restore();
}

function drawSquigglyUnderline(ctx, startX, y, length) {
  ctx.save();
  ctx.strokeStyle = 'rgba(220, 38, 38, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(startX, y);

  const step = 14;
  const count = Math.floor(length / step);
  for (let i = 0; i < count; i++) {
    const curX = startX + i * step;
    const wave = (i % 2 === 0) ? 3 : -3;
    ctx.quadraticCurveTo(curX + step / 2, y + wave, curX + step, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCircledMark(ctx, x, y, text) {
  ctx.save();
  ctx.strokeStyle = '#dc2626';
  ctx.fillStyle = '#dc2626';
  ctx.lineWidth = 2.5;

  // Red circle
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.stroke();

  // Mark text
  ctx.font = 'bold 18px "Caveat", "Comic Sans MS", cursive, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawKtuStamp(ctx, x, y, grade, marks) {
  ctx.save();
  ctx.translate(x + 90, y + 90);
  ctx.rotate(-0.15); // Authentic tilted stamp

  ctx.strokeStyle = '#b91c1c';
  ctx.fillStyle = '#b91c1c';
  ctx.lineWidth = 3.5;

  // Outer stamp circle
  ctx.beginPath();
  ctx.arc(0, 0, 85, 0, Math.PI * 2);
  ctx.stroke();

  // Inner dashed circle
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 75, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Stamp header & footer
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('VALUATION SIMULATOR', 0, -50);
  ctx.fillText('BOOKLET TOTAL', 0, -36);

  // Grade & marks
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(grade, 0, 4);

  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(`${marks}/100`, 0, 24);

  ctx.font = 'bold 10px monospace';
  ctx.fillText(marks >= 40 ? 'SIMULATED PASS' : 'SIMULATED FAIL', 0, 50);

  ctx.restore();
}
