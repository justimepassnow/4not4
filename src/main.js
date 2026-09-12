import absoluteKtuUrl from './assets/absolute-ktu.png';
import failedUrl from './assets/you-failed.png';
import stillFailedUrl from './assets/still-failed.png';
import { loadReactionImage } from './reaction-loader.js';
// Main Application Entry Point

import { getExaminerMood } from './examiner-schedule.js';
import { detectText, initOcrModel } from './ocr-detector.js';
import { groupAnswersByQuestion } from './spatial-grouping.js';
import { evaluateBooklet, revalueResult, applyBorderlineOutcome } from './troll-grader.js';
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
let revaluationUsed = false;
let evaluationUsed = false;
let documentName = '';
const appStatus = document.getElementById('appStatus');
const revaluateBtn = document.getElementById('revaluateBtn');
const revaluationStatus = document.getElementById('revaluationStatus');
let activeReaction = null;
let reactionRequest = 0;
async function updateReactionImage(result) {
  const unchanged = result?.revaluation && !result.revaluation.changed;
  const showFailure = result?.breakdown.length > 0 && !result.isPassed;
  const reaction = unchanged || showFailure ? result : null;
  if (reaction === activeReaction) return;
  activeReaction = reaction;
  const request = ++reactionRequest;
  const panel = document.getElementById('reactionPanel');
  const picture = document.getElementById('unchangedMeme');
  const loader = document.getElementById('reactionLoading');
  panel.hidden = !reaction;
  picture.hidden = true;
  loader.hidden = !reaction;
  loader.textContent = 'Loading the examiner’s reaction…';
  loader.classList.remove('load-error');
  if (!reaction) return;
  const improvedButFailed = result.revaluation?.changed && showFailure;
  const url = unchanged ? absoluteKtuUrl : improvedButFailed ? stillFailedUrl : failedUrl;
  picture.alt = unchanged ? 'Absolute KTU — hands raised in acceptance'
    : improvedButFailed ? 'You still failed. Better luck next time.' : 'You failed. Better luck next time.';
  const [, loaded] = await Promise.all([
    new Promise(resolve => setTimeout(resolve, 2500)),
    loadReactionImage(url).then(() => true, () => false)
  ]);
  if (request !== reactionRequest) return;
  loader.hidden = loaded;
  picture.hidden = !loaded;
  if (loaded) {
    picture.src = url;
  } else {
    loader.classList.add('load-error');
    loader.textContent = 'Could not load the reaction image.';
    const retry = document.createElement('button');
    retry.className = 'pill-btn';
    retry.textContent = 'Retry image';
    retry.addEventListener('click', () => {
      if (request !== reactionRequest) return;
      activeReaction = null;
      updateReactionImage(result);
    });
    loader.appendChild(retry);
  }
}
function updateRevaluation() {
  revaluateBtn.disabled = revaluationUsed || busy || !isCheckingComplete || !currentResult?.breakdown.length || currentResult.totalMarks >= currentResult.maxMarks;
  revaluateBtn.textContent = revaluationUsed ? 'Revaluation used' : 'Request revaluation';
  const review = currentResult?.revaluation;
  updateReactionImage(isCheckingComplete ? currentResult : null);
  revaluationStatus.hidden = !isCheckingComplete || (!review && currentResult?.totalMarks < 100);
  revaluationStatus.dataset.outcome = review?.changed ? 'increased' : review ? 'unchanged' : 'maximum';
  document.getElementById('revaluationOutcomeTitle').textContent = review
    ? review.changed ? 'Your marks went up!' : 'No change in marks'
    : 'Full marks already';
  document.getElementById('revaluationOutcomeScore').textContent = review
    ? review.changed ? `${review.previousMarks} → ${currentResult.totalMarks} / 100` : `${currentResult.totalMarks} / 100`
    : '100 / 100';
  document.getElementById('revaluationOutcomeNote').textContent = review
    ? review.changed ? 'A little examiner mercy. Your final score has been updated.' : 'The examiner stands by the original score.'
    : 'No higher score is available.';
  if (review) document.getElementById('revaluationOutcomeNote').textContent += ' Your one revaluation has been used.';
}
revaluateBtn.addEventListener('click', () => {
  if (revaluateBtn.disabled) return;
  currentResult = revalueResult(currentResult);
  revaluationUsed = true;
  renderMarksheet(currentResult);
  redrawCanvas();
});
function setStatus(message, error = false) {
  appStatus.textContent = message;
  appStatus.classList.toggle('error', error);
}
async function withBusy(task) {
  if (busy) return;
  busy = true;
  setStatus('Processing your document…');
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
    document.getElementById('app').dataset.document = 'empty';
    mainCanvas.getContext('2d').clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    pdfPaginationBar.style.display = 'none';
    gradeBadge.textContent = '—';
    gradeBadge.className = 'grade-circle';
    scoreDisplay.textContent = '— / 100';
    passFailStatus.textContent = 'Evaluation unavailable';
    document.getElementById('diceCard').dataset.outcome = 'pending';
    diceFace.textContent = '—';
    diceFace.className = 'dice-face';
    diceTitle.textContent = 'No dice result';
    diceSub.textContent = 'Upload a document to evaluate it.';
    breakdownTbody.replaceChildren();
    remarksList.replaceChildren();
    [inkMetric, diagramMetric, marginMetric, weightMetric].forEach(el => el.textContent = '—');
    document.getElementById('scoreExplanation').textContent = '';
    setStatus('Unable to process this file. Try a valid image or an unencrypted PDF,.', true);
  } finally {
    busy = false;
    imageUploadInput.value = '';
    controls.forEach(control => { control.disabled = false; });
    evaluateBtn.disabled = evaluationUsed || (!currentImage && !currentPdfDoc);
    evalBtnText.textContent = evaluationUsed ? 'Evaluated · upload again' : 'Evaluate sheet';
    updateRevaluation();
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
      document.getElementById('app').dataset.document = 'ready';
      currentResult = null;
      currentGrouped = null;
      revaluationUsed = false;
      evaluationUsed = false;
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
    document.getElementById('app').dataset.document = 'ready';
    currentResult = null;
    currentGrouped = null;
    revaluationUsed = false;
    evaluationUsed = false;
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

function setDiceFace(value) {
  diceFace.replaceChildren();
  diceFace.setAttribute('aria-label', value ? `Dice roll: ${value} of 6` : 'Waiting for dice roll');
  if (!value) {
    diceFace.textContent = '—';
    return;
  }
  const positions = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  for (let cell = 1; cell <= 9; cell++) {
    const pip = document.createElement('span');
    pip.className = positions[value].includes(cell) ? 'dice-pip visible' : 'dice-pip';
    pip.setAttribute('aria-hidden', 'true');
    diceFace.appendChild(pip);
  }
}

async function rollDice() {
  const roll = Math.floor(Math.random() * 6) + 1;
  diceTitle.textContent = 'Rolling moderation dice…';
  diceSub.textContent = 'One roll for this upload.';
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    diceFace.classList.add('rolling');
    // Slow the face changes as the die settles; animation does not reroll marks.
    for (const [face, delay] of [[2, 80], [5, 110], [3, 140], [6, 180], [1, 240]]) {
      setDiceFace(face);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  diceFace.classList.remove('rolling');
  setDiceFace(roll);
  return roll;
}

function renderCheckingState(evaluatedPages = 0, totalPages = 1) {
  updateRevaluation();
  gradeBadge.textContent = '…';
  gradeBadge.className = 'grade-circle pending';
  scoreDisplay.textContent = 'Checking…';
  passFailStatus.className = 'grade-status';
  passFailStatus.textContent = totalPages > 1
    ? `Scrutinizing booklet (${evaluatedPages} / ${totalPages} pages)...`
    : 'Scrutinizing answer sheet...';

  if (diceFace) {
    document.getElementById('diceCard').dataset.outcome = 'pending';
    setDiceFace(null);
    diceFace.className = 'dice-face';
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
  if (evaluationUsed || (!currentImage && !currentPdfDoc)) return;
  evaluationUsed = true;
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

      // Finish the booklet before enabling revaluation or another upload.
      await (async () => {
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
              throw e;
            }
          }
        }
        if (isPdfMode) {
          const finalAll = Object.values(bookletPagesCache).sort((a, b) => a.pageNumber - b.pageNumber);
          if (!currentDiceRoll) {
            currentDiceRoll = await rollDice();
          }
          currentResult = evaluateBooklet(finalAll, evaluationMood, currentDiceRoll);
          currentResult = applyBorderlineOutcome(currentResult);
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
        currentDiceRoll = await rollDice();
      }
      currentResult = evaluateBooklet([bookletPagesCache[1]], evaluationMood, currentDiceRoll);
      currentResult = applyBorderlineOutcome(currentResult);
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
    evalBtnText.textContent = 'Evaluated · upload again';
    evaluateBtn.disabled = true;
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
  updateRevaluation();

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
    diceFace.className = 'dice-face';
    setDiceFace(result.diceRoll);
    const originalMarks = result.moderationMarks ?? result.revaluation?.previousMarks ?? result.totalMarks;
    document.getElementById('diceCard').dataset.outcome = result.diceRoll >= 4 ? 'high' : 'low';
    diceTitle.textContent = `Rolled ${result.diceRoll} / 6 · ${result.diceRoll >= 4 ? 'High roll' : 'Low roll'}`;
    diceSub.textContent = `${result.diceEffect?.chopPct || '0%'} moderation cut · ${Math.round(result.baseMarks)} → ${originalMarks} / 100${result.borderlineMode ? ' before borderline verdict' : result.revaluation ? ' before revaluation' : ''}.`;
  }

  if (result.revaluation) {
    document.getElementById('scoreExplanation').textContent += ` Revaluation total: ${result.totalMarks} / 100. Details below describe the original evaluation.`;
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

});

simTimeToggleBtn.addEventListener('click', () => {
  isLiveClock = false;
  simTimeToggleBtn.classList.add('active');
  liveTimeToggleBtn.classList.remove('active');
  scrubberContainer.style.display = 'flex';
  updateTimeAndMood();

});

timeSlider.addEventListener('input', (e) => {
  simulatedMinutes = parseInt(e.target.value, 10);
  updateTimeAndMood();

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

function uploadFile(file) {
  if (busy || !file) return;
  if (file && !(file.type.startsWith('image/') || file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
    setStatus('Please choose a PDF or image file.', true);
    return;
  }
  updateReactionImage(null);
  return withBusy(async () => {
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
  });
}
imageUploadInput.addEventListener('change', (event) => uploadFile(event.target.files[0]));
const dropZone = document.getElementById('dropZone');
let dragDepth = 0;
dropZone.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth++;
  if (!busy) dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
});
dropZone.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropZone.classList.remove('drag-over');
  if (busy) return;
  if (event.dataTransfer.files.length !== 1) {
    setStatus('Please drop one PDF or image at a time.', true);
    return;
  }
  uploadFile(event.dataTransfer.files[0]);
});

evaluateBtn.addEventListener('click', () => withBusy(runEvaluation));
toggleBoxes.addEventListener('change', redrawCanvas);
toggleRedPen.addEventListener('change', redrawCanvas);

// Sidebar Tab Navigation
const sidebarLinks = document.querySelectorAll('#sidebarNav a');
const appContainer = document.getElementById('app');
const pageEyebrow = document.getElementById('pageEyebrow');
const pageHeadingTitle = document.getElementById('pageHeadingTitle');
const pageHeadingDesc = document.getElementById('pageHeadingDesc');

const viewHeaders = {
  dashboard: {
    eyebrow: 'EXAMINATION / VALUATION',
    title: 'Valuation dashboard',
    desc: 'Upload your sheet and see how you did.'
  },
  canvas: {
    eyebrow: 'INSPECTION / CANVAS',
    title: 'Answer sheets & inspection',
    desc: 'Inspect student handwriting, OCR detected regions, and examiner red-ink annotations.'
  },
  report: {
    eyebrow: 'VALUATION / MARKSHEET',
    title: 'Valuation report & marksheet',
    desc: 'Moderation dice outcome, score breakdown, and examiner valuation remarks.'
  },
  shift: {
    eyebrow: 'EXAMINER CAMP / MOOD',
    title: 'Examiner shift & mood camp',
    desc: 'Choose the examiner shift for your next upload. Existing marks stay locked.'
  }
};

sidebarLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const view = link.dataset.view || 'dashboard';
    sidebarLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    appContainer.setAttribute('data-view', view);

    const meta = viewHeaders[view] || viewHeaders.dashboard;
    if (pageEyebrow) pageEyebrow.textContent = meta.eyebrow;
    if (pageHeadingTitle) pageHeadingTitle.textContent = meta.title;
    if (pageHeadingDesc) pageHeadingDesc.textContent = meta.desc;

    if (view === 'canvas') {
      redrawCanvas();
    }
  });
});

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

  updateRevaluation();
  setStatus('Upload a document to value.');
})();
