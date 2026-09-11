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
    currentResult = null;
    currentGrouped = null;
    currentImage = null;
    currentPdfDoc = null;
    bookletPagesCache = {};
    isPdfMode = false;
    pdfPaginationBar.style.display = 'none';
    mainCanvas.getContext('2d').clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    gradeBadge.textContent = '—';
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
const loadingText = document.querySelector('.loading-text');
const evaluateBtn = document.getElementById('evaluateBtn');
const evalBtnText = document.getElementById('evalBtnText');
const toggleBoxes = document.getElementById('toggleBoxes');
const toggleRedPen = document.getElementById('toggleRedPen');
const imageUploadInput = document.getElementById('imageUploadInput');
const presetBtns = document.querySelectorAll('.preset-btn');
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

    // Run full booklet evaluation across all pages
    await runEvaluation();
  } catch (err) {
    throw err;
  } finally {
    loadingOverlay.style.display = 'none';
  }
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
      currentResult = evaluateBooklet(allEvaluated, currentMood);
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
    renderMarksheet(currentResult);
  }
}

// Evaluate Paper / Booklet Workflow
async function runEvaluation() {
  loadingOverlay.style.display = 'flex';
  evalBtnText.textContent = 'Evaluating…';
  evaluateBtn.disabled = true;

  const evaluationMood = { ...currentMood };
  try {
    if (isPdfMode && currentPdfDoc) {
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
      currentResult = evaluateBooklet(Object.values(bookletPagesCache), evaluationMood);

      redrawCanvas();
      renderMarksheet(currentResult);
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
              currentResult = evaluateBooklet(evaluatedSoFar, evaluationMood);
              renderMarksheet(currentResult);
              setStatus(`${documentName} · ${evaluatedSoFar.length}/${totalPdfPages} pages evaluated`);
            } catch (e) {
              console.warn(`Error processing page ${i}:`, e);
            }
          }
        }
        if (isPdfMode) {
          const finalAll = Object.values(bookletPagesCache).sort((a, b) => a.pageNumber - b.pageNumber);
          currentResult = evaluateBooklet(finalAll, evaluationMood);
          renderMarksheet(currentResult);
          redrawCanvas();
          setStatus(`${documentName} · ${finalAll.length} page(s) evaluated · Full Booklet Scrutinized`);
        }
      })();
    } else if (currentImage) {
      // Single Image Evaluation
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

      currentResult = evaluateBooklet([bookletPagesCache[1]], evaluationMood);
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
  if (!currentImage || !currentGrouped || !currentResult) return;
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
    : 'No answer regions detected. This score cannot be interpreted as an assessment of the answer.';

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
  if (Object.keys(bookletPagesCache).length > 0) {
    currentResult = evaluateBooklet(Object.values(bookletPagesCache), currentMood);
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
  if (Object.keys(bookletPagesCache).length > 0) {
    currentResult = evaluateBooklet(Object.values(bookletPagesCache), currentMood);
    redrawCanvas();
    renderMarksheet(currentResult);
  }
});

timeSlider.addEventListener('input', (e) => {
  simulatedMinutes = parseInt(e.target.value, 10);
  updateTimeAndMood();
  if (Object.keys(bookletPagesCache).length > 0) {
    currentResult = evaluateBooklet(Object.values(bookletPagesCache), currentMood);
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
    if (Object.keys(bookletPagesCache).length > 0) {
      currentResult = evaluateBooklet(Object.values(bookletPagesCache), currentMood);
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

presetBtns.forEach(btn => {
  btn.addEventListener('click', () => withBusy(async () => {
    documentName = btn.textContent.trim();
    presetBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const sampleFile = btn.dataset.sample;
    const isPdf = btn.dataset.isPdf === 'true';

    if (isPdf) {
      await loadPdfBooklet(`/samples/${sampleFile}`, sampleFile);
    } else {
      await loadImage(`/samples/${sampleFile}`);
      await runEvaluation();
    }
  }));
});

imageUploadInput.addEventListener('change', (e) => withBusy(async () => {
  const file = e.target.files[0];
  if (!file) return;
  documentName = file.name;

  presetBtns.forEach(b => b.classList.remove('active'));

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
