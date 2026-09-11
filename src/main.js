// Main Application Entry Point

import { getExaminerMood } from './examiner-schedule.js';
import { detectText, initOcrModel } from './ocr-detector.js';
import { groupAnswersByQuestion } from './spatial-grouping.js';
import { evaluateBooklet } from './troll-grader.js';
import { renderEvaluationCanvas } from './canvas-renderer.js';
import { loadPdf, renderPdfPage } from './pdf-handler.js';

// State
let isLiveClock = true;
let simulatedMinutes = 750; // 12:30 PM (Default Hangry Hour)
let currentImage = null;
let currentBoxes = [];
let currentGrouped = null;
let currentResult = null;
let currentMood = null;
let busy = false;
let isCheckingComplete = false;
let currentDiceRoll = null;
let documentName = 'Flowchart sample';
const appStatus = document.getElementById('appStatus');
function setStatus(message, error = false) {
  appStatus.textContent = message;
  appStatus.classList.toggle('error', error);
}
async function withBusy(task) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('button, input')];
  controls.forEach(control => { control.disabled = true; });
  try { await task(); }
  catch (error) {
    console.error(error);
    isCheckingComplete = false;
    currentDiceRoll = null;
    currentResult = null;
    currentGrouped = null;
    currentImage = null;
    currentPdfDoc = null;
    bookletPagesCache = {};
    isPdfMode = false;
    pdfPaginationBar.style.display = 'none';
    gradeBadge.textContent = '—';
    gradeBadge.className = 'grade-circle';
    scoreDisplay.textContent = '— / 100';
    passFailStatus.textContent = 'Evaluation unavailable';
    breakdownTbody.replaceChildren();
    remarksList.replaceChildren();
    [inkMetric, diagramMetric, marginMetric, weightMetric].forEach(el => el.textContent = '—');
    document.getElementById('scoreExplanation').textContent = '';
    setStatus('Unable to process this file. Try a valid image or an unencrypted PDF, or select a sample.', true);
  } finally {
    busy = false;
    imageUploadInput.value = '';
    controls.forEach(control => { control.disabled = false; });
    evaluateBtn.disabled = !currentImage && !currentPdfDoc;
    pdfPrevBtn.disabled = currentPdfPage <= 1;
    pdfNextBtn.disabled = currentPdfPage >= totalPdfPages;
    loadingOverlay.style.display = 'none';
    if (uploadProgressBarContainer) uploadProgressBarContainer.style.display = 'none';
    if (gatewayTimeoutScreen) gatewayTimeoutScreen.style.display = 'none';
    if (loadingContent) loadingContent.style.display = 'flex';
  }
}

// PDF & Booklet State
let isPdfMode = false;
let currentPdfDoc = null;
let currentPdfPage = 1;
let totalPdfPages = 1;
let bookletPagesCache = {};

// DOM Elements
const clockDisplay = document.getElementById('clockDisplay');
const liveTimeToggleBtn = document.getElementById('liveTimeToggleBtn');
const simTimeToggleBtn = document.getElementById('simTimeToggleBtn');
const scrubberContainer = document.getElementById('scrubberContainer');
const timeSlider = document.getElementById('timeSlider');
const sliderTimeLabel = document.getElementById('sliderTimeLabel');
const moodTitle = document.getElementById('moodTitle');
const moodQuote = document.getElementById('moodQuote');
const hungerVal = document.getElementById('hungerVal');
const hungerFill = document.getElementById('hungerFill');
const energyVal = document.getElementById('energyVal');
const energyFill = document.getElementById('energyFill');
const multiplierVal = document.getElementById('multiplierVal');
const multiplierStatus = document.getElementById('multiplierStatus');

const mainCanvas = document.getElementById('mainCanvas');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingContent = document.getElementById('loadingContent');
const loadingText = document.querySelector('.loading-text');
const uploadProgressBarContainer = document.getElementById('uploadProgressBarContainer');
const uploadProgressFill = document.getElementById('uploadProgressFill');
const uploadProgressPct = document.getElementById('uploadProgressPct');
const gatewayTimeoutScreen = document.getElementById('gatewayTimeoutScreen');
const evaluateBtn = document.getElementById('evaluateBtn');
const evalBtnText = document.getElementById('evalBtnText');
const toggleBoxes = document.getElementById('toggleBoxes');
const toggleRedPen = document.getElementById('toggleRedPen');
const imageUploadInput = document.getElementById('imageUploadInput');
const chipBtns = document.querySelectorAll('.chip-btn');

// PDF DOM Elements
const pdfPaginationBar = document.getElementById('pdfPaginationBar');
const pdfFileName = document.getElementById('pdfFileName');
const pdfPrevBtn = document.getElementById('pdfPrevBtn');
const pdfNextBtn = document.getElementById('pdfNextBtn');
const pdfPageIndicator = document.getElementById('pdfPageIndicator');

// Marksheet Elements
const gradeBadge = document.getElementById('gradeBadge');
const scoreDisplay = document.getElementById('scoreDisplay');
const passFailStatus = document.getElementById('passFailStatus');
const diceFace = document.getElementById('diceFace');
const diceTitle = document.getElementById('diceTitle');
const diceSub = document.getElementById('diceSub');
const inkMetric = document.getElementById('inkMetric');
const diagramMetric = document.getElementById('diagramMetric');
const marginMetric = document.getElementById('marginMetric');
const weightMetric = document.getElementById('weightMetric');
const breakdownTbody = document.getElementById('breakdownTbody');
const remarksList = document.getElementById('remarksList');

// Clock & Mood Updates
function updateTimeAndMood() {
  let date;
  if (isLiveClock) {
    date = new Date();
  } else {
    date = new Date();
    date.setHours(Math.floor(simulatedMinutes / 60), simulatedMinutes % 60, 0, 0);
  }

  currentMood = getExaminerMood(date);

  // Update Clock HUD
  clockDisplay.textContent = currentMood.time;
  sliderTimeLabel.textContent = currentMood.time;

  // Update Examiner HUD
  moodTitle.textContent = currentMood.title;
  moodQuote.textContent = `"${currentMood.quote}"`;

  hungerVal.textContent = `${currentMood.hunger}%`;
  hungerFill.style.width = `${currentMood.hunger}%`;
  energyVal.textContent = `${currentMood.energy}%`;
  energyFill.style.width = `${currentMood.energy}%`;

  multiplierVal.textContent = `${currentMood.multiplier}x`;
  multiplierStatus.textContent = currentMood.multiplier < 0.8 ? 'Brutal Penalty Mode' : (currentMood.multiplier > 1.1 ? 'Generous Mode' : 'Standard Routine');
}

// Load Image
async function loadImage(url) {
  loadingOverlay.style.display = 'flex';
  if (loadingText) loadingText.textContent = 'Ingesting Single Answer Sheet...';
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      currentImage = img;
      isPdfMode = false;
      currentPdfDoc = null;
      currentPdfPage = 1;
      totalPdfPages = 1;
      bookletPagesCache = {};
      pdfPaginationBar.style.display = 'none';
      loadingOverlay.style.display = 'none';
      redrawCanvas();
      resolve(img);
    };
    img.onerror = (err) => {
      loadingOverlay.style.display = 'none';
      reject(err);
    };
    img.src = url;
  });
}

// PDF Loading & Navigation Functions
async function loadPdfBooklet(fileOrUrl, filename = 'booklet.pdf') {
  loadingOverlay.style.display = 'flex';
  if (loadingText) loadingText.textContent = 'Loading PDF Answer Booklet...';
  try {
    currentPdfDoc = await loadPdf(fileOrUrl);
    totalPdfPages = currentPdfDoc.numPages;
    currentPdfPage = 1;
    isPdfMode = true;
    bookletPagesCache = {};

    pdfPaginationBar.style.display = 'flex';
    pdfFileName.textContent = `${filename} (${totalPdfPages} Pages)`;
    pdfPageIndicator.textContent = `Page 1 / ${totalPdfPages}`;
    pdfPrevBtn.disabled = true;
    pdfNextBtn.disabled = totalPdfPages <= 1;

    // Immediately display page 1 canvas
    const firstCanvas = await renderPdfPage(currentPdfDoc, 1, 1.5);
    currentImage = firstCanvas;
    redrawCanvas();

    // Run full booklet evaluation across all pages
    await runEvaluation();
  } catch (err) {
    throw err;
  } finally {
    loadingOverlay.style.display = 'none';
  }
}

function renderCheckingState(evaluatedPages = 0, totalPages = 1) {
  gradeBadge.textContent = '…';
  gradeBadge.className = 'grade-circle pending';
  scoreDisplay.textContent = 'Checking…';
  passFailStatus.className = 'grade-status';
  passFailStatus.textContent = totalPages > 1
    ? `Scrutinizing booklet (${evaluatedPages} / ${totalPages} pages)...`
    : 'Scrutinizing answer sheet...';

  if (diceFace) {
    diceFace.textContent = '🎲';
    diceFace.className = 'dice-face rolling';
    diceTitle.textContent = 'Awaiting full scrutiny…';
    diceSub.textContent = 'Moderation dice rolls only after all pages are evaluated.';
  }

  document.getElementById('scoreExplanation').textContent =
    'Valuation in progress. Grade and final marks are strictly withheld until the examiner finishes scrutinizing all pages.';

  inkMetric.textContent = '…';
  diagramMetric.textContent = '…';
  marginMetric.textContent = totalPages > 1 ? `${evaluatedPages} / ${totalPages}` : '…';
  weightMetric.textContent = '…';

  remarksList.innerHTML = '<li>⏳ Examiner is flipping through booklet. Final remarks withheld until scrutiny is complete.</li>';

  breakdownTbody.innerHTML = `
    <tr>
      <td colspan="4" style="text-align:center; padding: 22px; color:#647d92; font-style:italic;">
        🔍 Scrutinizing pages... Region marks sealed until valuation completes.
      </td>
    </tr>
  `;
}

let hasDroppedUploadOnce = false;

async function simulateUploadWithGatewayTimeout(filename) {
  loadingOverlay.style.display = 'flex';
  loadingContent.style.display = 'flex';
  if (gatewayTimeoutScreen) gatewayTimeoutScreen.style.display = 'none';
  uploadProgressBarContainer.style.display = 'block';
  uploadProgressFill.style.width = '0%';
  uploadProgressPct.textContent = '0%';
  loadingText.textContent = `Uploading "${filename}" to KTU valuation portal...`;

  const triggerTimeout = !hasDroppedUploadOnce && (Math.random() < 0.5);
  const timeoutTarget = 97;
  const targetPct = triggerTimeout ? timeoutTarget : 100;
  const stages = [18, 38, 59, 78, 89, 94, targetPct];

  for (const pct of stages) {
    await new Promise(r => setTimeout(r, 80));
    uploadProgressFill.style.width = `${pct}%`;
    uploadProgressPct.textContent = `${pct}%`;
  }

  if (triggerTimeout) {
    hasDroppedUploadOnce = true;
    await new Promise(r => setTimeout(r, 250));
    loadingOverlay.style.display = 'none';
    uploadProgressBarContainer.style.display = 'none';
    gatewayTimeoutScreen.style.display = 'flex';

    await new Promise((resolve) => {
      const onDismiss = () => {
        gatewayTimeoutScreen.removeEventListener('click', onDismiss);
        resolve();
      };
      gatewayTimeoutScreen.addEventListener('click', onDismiss);
    });

    gatewayTimeoutScreen.style.display = 'none';
    setStatus('Upload dropped: 504 Gateway Timeout. Please re-upload your answer sheet bundle.', true);

    setTimeout(() => {
      imageUploadInput.click();
    }, 120);

    return false;
  }

  hasDroppedUploadOnce = false;
  uploadProgressBarContainer.style.display = 'none';
  return true;
}

async function switchPdfViewPage(pageNum) {
  if (!isPdfMode || !currentPdfDoc) return;
  currentPdfPage = Math.max(1, Math.min(pageNum, totalPdfPages));
  pdfPageIndicator.textContent = `Page ${currentPdfPage} / ${totalPdfPages}`;
  pdfPrevBtn.disabled = currentPdfPage <= 1;
  pdfNextBtn.disabled = currentPdfPage >= totalPdfPages;

  if (!bookletPagesCache[currentPdfPage]) {
    loadingOverlay.style.display = 'flex';
    if (loadingText) loadingText.textContent = `Scrutinizing Page ${currentPdfPage} of ${totalPdfPages}...`;
    try {
      const pageCanvas = await renderPdfPage(currentPdfDoc, currentPdfPage, 1.5);
      const boxes = await detectText(pageCanvas);
      const grouped = groupAnswersByQuestion(boxes, pageCanvas.width, pageCanvas.height);
      bookletPagesCache[currentPdfPage] = {
        pageNumber: currentPdfPage,
        canvas: pageCanvas,
        groupedData: grouped,
        boxes
      };
      const allEvaluated = Object.values(bookletPagesCache).sort((a, b) => a.pageNumber - b.pageNumber);
      currentResult = evaluateBooklet(allEvaluated, currentMood, currentDiceRoll || 6);
    } finally {
      loadingOverlay.style.display = 'none';
    }
  }

  const pageData = bookletPagesCache[currentPdfPage];
  if (pageData) {
    currentImage = pageData.canvas;
    currentGrouped = pageData.groupedData;
    currentBoxes = pageData.boxes;

    redrawCanvas();
    if (isCheckingComplete) {
      renderMarksheet(currentResult);
    } else {
      renderCheckingState(Object.keys(bookletPagesCache).length, totalPdfPages);
    }
  }
}

// Evaluate Paper / Booklet Workflow
async function runEvaluation() {
  isCheckingComplete = false;
  currentDiceRoll = null;
  loadingOverlay.style.display = 'flex';
  evalBtnText.textContent = 'Evaluating…';
  evaluateBtn.disabled = true;

  const evaluationMood = { ...currentMood };
  try {
    if (isPdfMode && currentPdfDoc) {
      renderCheckingState(Object.keys(bookletPagesCache).length, totalPdfPages);

      // 1. Evaluate the active page first for instantaneous responsiveness
      if (loadingText) loadingText.textContent = `Scrutinizing Page ${currentPdfPage} of ${totalPdfPages}...`;
      if (!bookletPagesCache[currentPdfPage]) {
        const pageCanvas = await renderPdfPage(currentPdfDoc, currentPdfPage, 1.5);
        const boxes = await detectText(pageCanvas);
        const grouped = groupAnswersByQuestion(boxes, pageCanvas.width, pageCanvas.height);
        bookletPagesCache[currentPdfPage] = {
          pageNumber: currentPdfPage,
          canvas: pageCanvas,
          groupedData: grouped,
          boxes
        };
      }

      // Display active page immediately
      const activePage = bookletPagesCache[currentPdfPage];
      currentImage = activePage.canvas;
      currentGrouped = activePage.groupedData;
      currentBoxes = activePage.boxes;
      currentResult = evaluateBooklet(Object.values(bookletPagesCache), evaluationMood, 6);

      redrawCanvas();
      renderCheckingState(Object.keys(bookletPagesCache).length, totalPdfPages);
      loadingOverlay.style.display = 'none';

      // 2. Background queue for remaining pages of large booklets
      (async () => {
        for (let i = 1; i <= totalPdfPages; i++) {
          if (!isPdfMode || !currentPdfDoc) break;
          if (!bookletPagesCache[i]) {
            try {
              const pCanvas = await renderPdfPage(currentPdfDoc, i, 1.5);
              const pBoxes = await detectText(pCanvas);
              const pGrouped = groupAnswersByQuestion(pBoxes, pCanvas.width, pCanvas.height);
              bookletPagesCache[i] = {
                pageNumber: i,
                canvas: pCanvas,
                groupedData: pGrouped,
                boxes: pBoxes
              };
              const evaluatedSoFar = Object.values(bookletPagesCache).sort((a, b) => a.pageNumber - b.pageNumber);
              currentResult = evaluateBooklet(evaluatedSoFar, evaluationMood, 6);
              if (!isCheckingComplete) {
                renderCheckingState(evaluatedSoFar.length, totalPdfPages);
              }
              setStatus(`${documentName} · ${evaluatedSoFar.length}/${totalPdfPages} pages evaluated`);
            } catch (e) {
              console.warn(`Error processing page ${i}:`, e);
            }
          }
        }
        if (isPdfMode) {
          const finalAll = Object.values(bookletPagesCache).sort((a, b) => a.pageNumber - b.pageNumber);
          if (!currentDiceRoll) {
            currentDiceRoll = Math.floor(Math.random() * 6) + 1;
          }
          currentResult = evaluateBooklet(finalAll, evaluationMood, currentDiceRoll);
          isCheckingComplete = true;
          renderMarksheet(currentResult);
          redrawCanvas();
          setStatus(`${documentName} · ${finalAll.length} page(s) evaluated · Full Booklet Scrutinized`);
        }
      })();
    } else if (currentImage) {
      // Single Image Evaluation
      renderCheckingState(0, 1);
      if (loadingText) loadingText.textContent = 'Detecting handwriting & diagrams...';
      currentBoxes = await detectText(currentImage);
      const w = currentImage.naturalWidth || currentImage.width;
      const h = currentImage.naturalHeight || currentImage.height;
      currentGrouped = groupAnswersByQuestion(currentBoxes, w, h);

      bookletPagesCache = {
        1: {
          pageNumber: 1,
          canvas: currentImage,
          groupedData: currentGrouped,
          boxes: currentBoxes
        }
      };

      if (!currentDiceRoll) {
        currentDiceRoll = Math.floor(Math.random() * 6) + 1;
      }
      currentResult = evaluateBooklet([bookletPagesCache[1]], evaluationMood, currentDiceRoll);
      isCheckingComplete = true;
      redrawCanvas();
      renderMarksheet(currentResult);
      const engines = [...new Set(currentBoxes.map(box => box.engine))];
      setStatus(`${documentName} · 1 page evaluated · ${engines.includes('CanvasHeuristic') ? 'Basic layout detection' : engines.length ? 'Text-region detection' : 'No regions detected'}`);
    }
  } catch (err) {
    throw err;
  } finally {
    loadingOverlay.style.display = 'none';
    evalBtnText.textContent = 'Evaluate sheet';
    evaluateBtn.disabled = false;
  }
}

function redrawCanvas() {
  if (!currentImage) return;
  const ctx = mainCanvas.getContext('2d');
  const w = currentImage.naturalWidth || currentImage.width;
  const h = currentImage.naturalHeight || currentImage.height;
  mainCanvas.width = w;
  mainCanvas.height = h;
  ctx.drawImage(currentImage, 0, 0, w, h);

  if (currentGrouped && currentResult) {
    renderEvaluationCanvas({
      canvas: mainCanvas,
      image: currentImage,
      groupedData: currentGrouped,
      evaluationResult: currentResult,
      showBoxes: toggleBoxes.checked,
      showRedPen: toggleRedPen.checked,
      currentPageNumber: currentPdfPage
    });
  }
}

function renderMarksheet(result) {
  if (!result) return;

  // Grade & Total (Calculated for the entire booklet!)
  gradeBadge.textContent = result.grade;
  scoreDisplay.textContent = `${result.totalMarks} / ${result.maxMarks}`;

  const totalPages = result.pageMetrics.totalPages || 1;
  const isBooklet = totalPages > 1;

  if (result.isPassed) {
    gradeBadge.className = 'grade-circle pass';
    passFailStatus.className = 'grade-status pass';
    passFailStatus.textContent = isBooklet
      ? `Simulated pass · ${totalPages} pages`
      : 'Simulated pass';
  } else {
    gradeBadge.className = 'grade-circle';
    passFailStatus.className = 'grade-status';
    passFailStatus.textContent = 'Simulated fail · Below 40 / 100';
  }

  // Metrics
  const fillPct = Math.round(result.pageMetrics.pageFillRatio * 100);
  inkMetric.textContent = `${fillPct}%`;
  diagramMetric.textContent = `${result.pageMetrics.diagramCount}`;
  marginMetric.textContent = `${totalPages}`;
  weightMetric.textContent = `${result.breakdown.length}`;

  const rawMarks = result.breakdown.reduce((sum, item) => sum + item.marks, 0);
  document.getElementById('scoreExplanation').textContent = result.breakdown.length
    ? `Region subtotal: ${rawMarks} / ${result.breakdown.length * 10}. Final score includes booklet and shift adjustments (${result.examinerMood.time}, ${result.examinerMood.multiplier}×).`
    : 'No answer regions detected. Upload a clearer scan.';

  // Question Breakdown Table (Across all booklet pages!)
  breakdownTbody.innerHTML = '';
  for (const item of result.breakdown) {
    const tr = document.createElement('tr');
    const isCurrentPageItem = item.pageNumber === currentPdfPage;

    if (isCurrentPageItem && isBooklet) {
      tr.style.background = 'rgba(59, 130, 246, 0.12)';
    }

    tr.innerHTML = `
      <td><strong>${item.qNumber}</strong> ${isCurrentPageItem && isBooklet ? '<span style="font-size:10px; color:#286da9;">(viewing)</span>' : ''}</td>
      <td>${item.verticalSpan} px</td>
      <td>${item.hasDiagram ? 'Possible' : '—'}</td>
      <td><strong style="color: ${item.marks >= 5 ? '#32784a' : '#ad4148'}">${item.marks} / ${item.maxMarks}</strong></td>
    `;
    breakdownTbody.appendChild(tr);
  }

  if (!result.breakdown.length) {
    const row = breakdownTbody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 4;
    cell.textContent = 'No answer regions detected. Try a clearer scan.';
  }
  // Moderation Dice Presentation
  if (diceFace && result.diceRoll) {
    const diceIcons = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    diceFace.className = 'dice-face';
    diceFace.textContent = diceIcons[result.diceRoll - 1] || '🎲';
    if (result.diceRoll >= 4) {
      diceTitle.textContent = `Roll ${result.diceRoll} — High Roll! (${result.diceEffect?.chopPct || '0%'} chopped)`;
      diceSub.textContent = result.isPassed
        ? `High roll! Calculated marks (${result.baseMarks}) not reduced too much. Passed!`
        : `High roll (${result.diceEffect?.chopPct} chopped), but base marks (${result.baseMarks}) were already below 40.`;
    } else {
      diceTitle.textContent = `Roll ${result.diceRoll} — Low Roll! (${result.diceEffect?.chopPct || '50%'} chopped)`;
      diceSub.textContent = `Low roll! Marks chopped down from ${result.baseMarks} to ${result.totalMarks} (Failed).`;
    }
  }

  // Remarks List
  remarksList.innerHTML = '';
  for (const r of result.remarks) {
    const li = document.createElement('li');
    li.textContent = r;
    remarksList.appendChild(li);
  }
}

// Event Listeners
liveTimeToggleBtn.addEventListener('click', () => {
  isLiveClock = true;
  liveTimeToggleBtn.classList.add('active');
  simTimeToggleBtn.classList.remove('active');
  scrubberContainer.style.display = 'none';
  updateTimeAndMood();
  if (isCheckingComplete && Object.keys(bookletPagesCache).length > 0) {
    currentResult = evaluateBooklet(Object.values(bookletPagesCache), currentMood, currentDiceRoll || 6);
    redrawCanvas();
    renderMarksheet(currentResult);
  }
});

simTimeToggleBtn.addEventListener('click', () => {
  isLiveClock = false;
  simTimeToggleBtn.classList.add('active');
  liveTimeToggleBtn.classList.remove('active');
  scrubberContainer.style.display = 'flex';
  updateTimeAndMood();
  if (isCheckingComplete && Object.keys(bookletPagesCache).length > 0) {
    currentResult = evaluateBooklet(Object.values(bookletPagesCache), currentMood, currentDiceRoll || 6);
    redrawCanvas();
    renderMarksheet(currentResult);
  }
});

timeSlider.addEventListener('input', (e) => {
  simulatedMinutes = parseInt(e.target.value, 10);
  updateTimeAndMood();
  if (isCheckingComplete && Object.keys(bookletPagesCache).length > 0) {
    currentResult = evaluateBooklet(Object.values(bookletPagesCache), currentMood, currentDiceRoll || 6);
    redrawCanvas();
    renderMarksheet(currentResult);
  }
});

chipBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (isLiveClock) {
      isLiveClock = false;
      simTimeToggleBtn.classList.add('active');
      liveTimeToggleBtn.classList.remove('active');
      scrubberContainer.style.display = 'flex';
    }
    const t = parseInt(btn.dataset.time, 10);
    timeSlider.value = t;
    simulatedMinutes = t;
    updateTimeAndMood();
    if (isCheckingComplete && Object.keys(bookletPagesCache).length > 0) {
      currentResult = evaluateBooklet(Object.values(bookletPagesCache), currentMood, currentDiceRoll || 6);
      redrawCanvas();
      renderMarksheet(currentResult);
    }
  });
});

pdfPrevBtn.addEventListener('click', async () => {
  if (currentPdfPage > 1) {
    await switchPdfViewPage(currentPdfPage - 1);
  }
});

pdfNextBtn.addEventListener('click', async () => {
  if (currentPdfPage < totalPdfPages) {
    await switchPdfViewPage(currentPdfPage + 1);
  }
});

imageUploadInput.addEventListener('change', (e) => withBusy(async () => {
  const file = e.target.files[0];
  if (!file) return;
  documentName = file.name;

  const uploadSuccess = await simulateUploadWithGatewayTimeout(file.name);
  if (!uploadSuccess) return;

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    await loadPdfBooklet(file, file.name);
  } else {
    const url = URL.createObjectURL(file);
    try {
      await loadImage(url);
      await runEvaluation();
    } finally { URL.revokeObjectURL(url); }
  }
  imageUploadInput.value = '';
}));

evaluateBtn.addEventListener('click', () => withBusy(runEvaluation));
toggleBoxes.addEventListener('change', redrawCanvas);
toggleRedPen.addEventListener('change', redrawCanvas);

// Init
(async function init() {
  updateTimeAndMood();
  setInterval(() => {
    if (isLiveClock) {
      updateTimeAndMood();
    }
  }, 1000);

  // Preload OCR model in background
  initOcrModel();

  // Load first sample
  await withBusy(async () => {
    await loadImage('/samples/sample1_flowchart.png');
    await runEvaluation();
  });
})();
