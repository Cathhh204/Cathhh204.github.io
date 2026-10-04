/*
  Image Processing Playground - frontend logic (CMU 15-113, Project 2).

  The flow: the user picks an image, we keep that File in memory, and every
  time the mode or a slider changes we POST the image plus the current
  settings to /api/process and display the processed image that comes back.
*/

const MAX_FILE_BYTES = 10 * 1024 * 1024; // keep in sync with MAX_UPLOAD_MEGABYTES in app.py
const ALLOWED_FILE_PATTERN = /\.(jpe?g|png)$/i;
const SLIDER_DEBOUNCE_MS = 250;

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
    text: "A small 3x3 grid of weights, called a convolution kernel, slides over the image. This kernel multiplies the center pixel by 5 and subtracts its four neighbors. In a flat area nothing changes, because the weights add up to 1. Wherever a pixel differs from its neighbors, that local difference is emphasized, so edges and fine details look crisper.",
  },
  hough: {
    title: "Hough Line Detection",
    text: "First, Canny edge detection reduces the image to its edge pixels. Then every edge pixel votes for all of the lines that could pass through it. A line that collects many votes is one that many edge pixels agree on, in other words a group of edge pixels that could belong to the same straight line. The longest detected segments are drawn in red on top of the original image.",
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

let currentFile = null;   // the uploaded File, re-sent with every request
let latestRequestId = 0;  // lets us ignore replies that arrive out of order


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
  processImage();
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

  const requestId = ++latestRequestId;
  setLoading(true);

  let result;
  try {
    result = await requestProcessedImage();
  } catch (error) {
    result = { error: error.message };
  }

  // Requests can overlap. If a newer one was sent while this one was in
  // flight, this reply is stale and showing it would undo the newer settings.
  if (requestId !== latestRequestId) return;

  setLoading(false);
  if (result.error) {
    clearProcessedImage();
    showMessage(resultMessage, result.error, true);
  } else {
    showProcessedImage(result.image);
    showMessage(resultMessage, result.message);
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

// Some browsers restore radio buttons and sliders after a reload, so set the
// labels and visible controls from the actual values rather than assuming.
updateModeUI();
updateSliderLabels();
