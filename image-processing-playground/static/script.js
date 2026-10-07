/*
  Image Processing Playground - frontend logic (CMU 15-113, Project 2).

  The flow: the user picks an image, we keep that File in memory, and every
  time the mode or a slider changes we POST the image plus the current
  settings to /api/process and display the processed image that comes back.
*/

const MAX_FILE_BYTES = 10 * 1024 * 1024; // keep in sync with MAX_UPLOAD_MEGABYTES in app.py
const ALLOWED_FILE_PATTERN = /\.(jpe?g|png)$/i;
const SLIDER_DEBOUNCE_MS = 250;

const HISTORY_STORAGE_KEY = "image-playground-history-v1";
const MAX_HISTORY_ENTRIES = 12;
const THUMBNAIL_MAX_SIDE = 320; // pixels

const EXPLANATIONS = {
  original: {
    title: "Original",
    text: "This is your image with no processing applied. Very large images are scaled down so their longest side is at most 1400 pixels, which keeps every operation fast.",
  },
  grayscale: {
    title: "Grayscale",
    text: "A color image stores three numbers per pixel: red, green and blue. Grayscale replaces them with a single intensity value that says how bright the pixel is. It is a weighted average, where green counts the most because our eyes are most sensitive to it. Many vision algorithms start with this step, since shapes and edges depend mostly on brightness rather than color.",
  },
  blur: {
    title: "Gaussian Blur",
    text: "Each pixel is replaced by a weighted average of the pixels around it. The weights follow a Gaussian (bell curve), so close neighbors count more than distant ones. Sigma sets how wide that bell curve is: a larger sigma averages over a bigger neighborhood and produces stronger smoothing.",
  },
  edges: {
    title: "Edge Detection (Canny)",
    text: "Canny looks for places where intensity changes sharply, which often correspond to object boundaries. A change stronger than the high threshold is always kept as an edge. A change between the two thresholds is kept only if it connects to a strong edge, and anything below the low threshold is thrown away. The image is converted to grayscale and lightly blurred first so that noise is not mistaken for edges.",
  },
  sharpen: {
    title: "Sharpen",
    text: "A small 3x3 grid of weights, called a convolution kernel, slides over the image. This kernel multiplies the center pixel by 3 and subtracts half of each of its four neighbors, giving a gentler sharpening effect. In a flat area nothing changes, because the weights add up to 1. Wherever a pixel differs from its neighbors, that local difference is emphasized, so edges and fine details look crisper.",
  },
  hough: {
    title: "Hough Line Detection",
    text: "First, Canny edge detection reduces the image to its edge pixels. Then every edge pixel votes for all of the lines that could pass through it. A line that collects many votes is one that many edge pixels agree on, in other words a group of edge pixels that could belong to the same straight line. The longest detected segments are drawn in cyan on top of the original image.",
  },
};

const fileInput = document.getElementById("file-input");
const dropzone = document.getElementById("dropzone");
const fileNameLabel = document.getElementById("file-name");
const modeInputs = document.querySelectorAll('input[name="mode"]');
const parameterGroups = document.querySelectorAll(".parameter-group");
const noParametersNote = document.getElementById("no-parameters");
const uploadMessage = document.getElementById("upload-message");  // problems with the chosen file
const resultMessage = document.getElementById("result-message");  // notes or errors about the result

const sigmaSlider = document.getElementById("sigma");
const lowSlider = document.getElementById("low-threshold");
const highSlider = document.getElementById("high-threshold");
const maxLinesSlider = document.getElementById("max-lines");
const sliders = [sigmaSlider, lowSlider, highSlider, maxLinesSlider];

const originalImage = document.getElementById("original-image");
const originalPlaceholder = document.getElementById("original-placeholder");
const processedImage = document.getElementById("processed-image");
const processedPlaceholder = document.getElementById("processed-placeholder");
const processedFrame = document.getElementById("processed-frame");

const explanationTitle = document.getElementById("explanation-title");
const explanationText = document.getElementById("explanation-text");

const historyList = document.getElementById("history-list");
const historyEmptyNote = document.getElementById("history-empty");
const clearHistoryButton = document.getElementById("clear-history");
const historyCardTemplate = document.getElementById("history-card-template");

let currentFile = null;       // the uploaded File, re-sent with every request
let currentThumbnail = null;  // Promise for a small copy of the upload, shown in the history
let latestRequestId = 0;      // lets us ignore replies that arrive out of order
let historyEntries = loadHistory();


/* ---------- Small helpers ---------- */

// Returns a version of `callback` that only runs once the calls have stopped
// for `delayMs`. Dragging a slider fires dozens of events per second; this
// turns them into a single request when the user pauses.
function debounce(callback, delayMs) {
  let timerId;
  return function () {
    clearTimeout(timerId);
    timerId = setTimeout(callback, delayMs);
  };
}

// Put text in one of the two message boxes. An empty message hides the box.
function showMessage(element, message, isError = false) {
  element.textContent = message || "";
  element.hidden = !message;
  element.classList.toggle("is-error", isError);
}

function setLoading(isLoading) {
  processedFrame.classList.toggle("is-loading", isLoading);
}

function getSelectedMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}


/* ---------- Updating the page ---------- */

// Show only the sliders that belong to the selected mode, and its explanation.
function updateModeUI() {
  const mode = getSelectedMode();
  let modeHasParameters = false;

  for (const group of parameterGroups) {
    const belongsToMode = group.dataset.mode === mode;
    group.hidden = !belongsToMode;
    if (belongsToMode) modeHasParameters = true;
  }

  noParametersNote.hidden = modeHasParameters;
  explanationTitle.textContent = EXPLANATIONS[mode].title;
  explanationText.textContent = EXPLANATIONS[mode].text;
}

function updateSliderLabels() {
  document.getElementById("sigma-value").textContent = Number(sigmaSlider.value).toFixed(1);
  document.getElementById("low-threshold-value").textContent = lowSlider.value;
  document.getElementById("high-threshold-value").textContent = highSlider.value;
  document.getElementById("max-lines-value").textContent = maxLinesSlider.value;
}

// The high threshold must never be below the low one, so whichever slider the
// user is dragging pushes the other one along with it.
function keepThresholdsOrdered(changedSlider) {
  // Slider values are strings, and as strings "100" < "50". Compare numbers.
  const low = Number(lowSlider.value);
  const high = Number(highSlider.value);
  if (low <= high) return;

  if (changedSlider === lowSlider) {
    highSlider.value = low;
  } else {
    lowSlider.value = high;
  }
}

function showOriginalPreview(file) {
  URL.revokeObjectURL(originalImage.src); // free the previous preview, if any
  originalImage.src = URL.createObjectURL(file);
  originalImage.hidden = false;
  originalPlaceholder.hidden = true;
}

function showProcessedImage(dataUrl) {
  processedImage.src = dataUrl;
  processedImage.hidden = false;
  processedPlaceholder.hidden = true;
}

function clearProcessedImage() {
  processedImage.removeAttribute("src");
  processedImage.hidden = true;
  processedPlaceholder.hidden = false;
  showMessage(resultMessage, "");
}

// Go back to the "nothing uploaded yet" state.
function resetToEmptyState() {
  currentFile = null;
  currentThumbnail = null;
  latestRequestId++; // any reply still on its way is now out of date
  setLoading(false);
  URL.revokeObjectURL(originalImage.src);
  originalImage.removeAttribute("src");
  originalImage.hidden = true;
  originalPlaceholder.hidden = false;
  clearProcessedImage();
  fileNameLabel.textContent = "JPG or PNG, up to 10 MB";
}


/* ---------- Uploading ---------- */

function handleFile(file) {
  if (!file) return;

  if (!ALLOWED_FILE_PATTERN.test(file.name)) {
    showMessage(uploadMessage, "Unsupported file type. Please upload a JPG or PNG image.", true);
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showMessage(uploadMessage, "That file is too large. Please upload an image under 10 MB.", true);
    return;
  }

  showMessage(uploadMessage, "");
  currentFile = file;
  fileNameLabel.textContent = `Selected: ${file.name}`;
  showOriginalPreview(file);
  // Start shrinking the upload now, so its thumbnail is ready by the time the
  // first result arrives. If the file turns out to be unreadable this becomes null.
  currentThumbnail = makeThumbnail(originalImage.src).catch(() => null);
  processImage();
}


/* ---------- History ---------- */

// The history lives in this browser's localStorage and never reaches the
// server. Only small thumbnails are kept, because localStorage can hold just
// a few megabytes.

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return []; // storage is blocked, or what was saved is not valid JSON
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries));
  } catch {
    // Storage is full or blocked. The history still works until the page closes.
  }
}

// Loads an image from a URL and resolves with the <img> once it is ready.
// This uses the load event rather than image.decode(), because decode() waits
// for the page to render a frame and so never finishes in a background tab.
function loadImage(imageUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = imageUrl;
  });
}

// Shrinks an image by drawing it onto a small canvas. Returns the result as a
// JPEG data URL, which is a string and can therefore be saved in localStorage.
async function makeThumbnail(imageUrl) {
  const image = await loadImage(imageUrl);

  const scale = Math.min(1, THUMBNAIL_MAX_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff"; // JPEG has no transparency; see-through areas would turn black
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

// The current slider values as short text, for example "Low 50, High 150".
function describeSettings(mode) {
  if (mode === "blur") return `Sigma ${Number(sigmaSlider.value).toFixed(1)}`;
  if (mode === "edges") return `Low ${lowSlider.value}, High ${highSlider.value}`;
  if (mode === "hough") return `Up to ${maxLinesSlider.value} lines`;
  return "";
}

async function addToHistory(request, processedImageUrl) {
  if (request.mode === "original") return; // nothing was changed, so nothing to remember

  const originalThumbnail = await request.originalThumbnail;
  const processedThumbnail = await makeThumbnail(processedImageUrl).catch(() => null);
  // The history is a nice-to-have: if a thumbnail could not be made, skip the entry.
  if (!originalThumbnail || !processedThumbnail) return;

  // Making thumbnails takes a moment. If a newer request went out meanwhile,
  // its own result will be recorded instead, so this one is out of date.
  if (request.id !== latestRequestId) return;

  const entry = {
    fileName: request.fileName,
    mode: request.mode,
    title: EXPLANATIONS[request.mode].title,
    settings: request.settings,
    savedAt: Date.now(),
    originalThumbnail,
    processedThumbnail,
  };

  // Keep one entry per image and mode, so trying new slider values replaces
  // the old entry instead of filling the history with near-duplicates. Two
  // entries come from the same image when their original thumbnails match.
  historyEntries = historyEntries.filter(
    (old) => old.originalThumbnail !== originalThumbnail || old.mode !== entry.mode
  );
  historyEntries.unshift(entry); // newest first
  historyEntries = historyEntries.slice(0, MAX_HISTORY_ENTRIES);

  saveHistory();
  renderHistory();
}

function createHistoryCard(entry) {
  const card = historyCardTemplate.content.cloneNode(true);

  const original = card.querySelector(".history-original");
  original.src = entry.originalThumbnail;
  original.alt = `Original: ${entry.fileName}`;

  const processed = card.querySelector(".history-processed");
  processed.src = entry.processedThumbnail;
  processed.alt = `Result: ${entry.title}`;

  const savedAt = new Date(entry.savedAt).toLocaleString([], {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  // textContent rather than innerHTML, so a file name is never treated as HTML.
  card.querySelector(".history-title").textContent = entry.title;
  card.querySelector(".history-settings").textContent = entry.settings;
  card.querySelector(".history-settings").hidden = !entry.settings;
  card.querySelector(".history-details").textContent = `${entry.fileName} · ${savedAt}`;
  return card;
}

function renderHistory() {
  historyList.replaceChildren(...historyEntries.map(createHistoryCard));
  historyEmptyNote.hidden = historyEntries.length > 0;
  clearHistoryButton.hidden = historyEntries.length === 0;
}


/* ---------- Talking to the backend ---------- */

function buildFormData() {
  const mode = getSelectedMode();
  const formData = new FormData();
  formData.append("image", currentFile);
  formData.append("operation", mode);

  if (mode === "blur") {
    formData.append("sigma", sigmaSlider.value);
  } else if (mode === "edges") {
    formData.append("low_threshold", lowSlider.value);
    formData.append("high_threshold", highSlider.value);
  } else if (mode === "hough") {
    formData.append("max_lines", maxLinesSlider.value);
  }
  return formData;
}

// Sends the request. Returns { image, message } or throws an Error whose
// message is safe to show to the user.
async function requestProcessedImage() {
  let response;
  try {
    response = await fetch("/api/process", { method: "POST", body: buildFormData() });
  } catch {
    // fetch only rejects when no answer came back at all (offline, server down).
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  // If the server itself crashed, the reply may not be JSON. Use {} instead.
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.image) {
    throw new Error(data.error || "The server could not process this image. Please try again.");
  }
  return data;
}

async function processImage() {
  if (!currentFile) {
    showMessage(uploadMessage, "Upload an image first, then try out the controls.");
    return;
  }

  // Write down what this request is for. By the time the reply arrives the
  // user may have moved a slider again, and the history needs the settings
  // that actually produced the image.
  const request = {
    id: ++latestRequestId,
    fileName: currentFile.name,
    originalThumbnail: currentThumbnail,
    mode: getSelectedMode(),
    settings: describeSettings(getSelectedMode()),
  };
  setLoading(true);

  let result;
  try {
    result = await requestProcessedImage();
  } catch (error) {
    result = { error: error.message };
  }

  // Requests can overlap. If a newer one was sent while this one was in
  // flight, this reply is stale and showing it would undo the newer settings.
  if (request.id !== latestRequestId) return;

  setLoading(false);
  if (result.error) {
    clearProcessedImage();
    showMessage(resultMessage, result.error, true);
  } else {
    showProcessedImage(result.image);
    showMessage(resultMessage, result.message);
    addToHistory(request, result.image);
  }
}

const processImageDebounced = debounce(processImage, SLIDER_DEBOUNCE_MS);


/* ---------- Event listeners ---------- */

fileInput.addEventListener("change", () => {
  handleFile(fileInput.files[0]);
  fileInput.value = ""; // so choosing the same file again still fires "change"
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault(); // tells the browser this element accepts drops
  dropzone.classList.add("is-dragging");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("is-dragging");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragging");
  handleFile(event.dataTransfer.files[0]);
});

// A file dropped anywhere else on the page would make the browser leave the
// app and open the file instead.
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

// The browser could not display the file, so it is not a usable image even
// though its name ended in .jpg or .png.
originalImage.addEventListener("error", () => {
  resetToEmptyState();
  showMessage(uploadMessage, "That file could not be read as an image. It may be corrupted.", true);
});

for (const modeInput of modeInputs) {
  modeInput.addEventListener("change", () => {
    updateModeUI();
    processImage();
  });
}

for (const slider of sliders) {
  slider.addEventListener("input", () => {
    keepThresholdsOrdered(slider);
    updateSliderLabels();
    processImageDebounced();
  });
}

clearHistoryButton.addEventListener("click", () => {
  historyEntries = [];
  saveHistory();
  renderHistory();
});

// Some browsers restore radio buttons and sliders after a reload, so set the
// labels and visible controls from the actual values rather than assuming.
updateModeUI();
updateSliderLabels();
renderHistory();
