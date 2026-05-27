(function () {
  "use strict";

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const cameraBtn = document.getElementById("cameraBtn");
  const cameraContainer = document.getElementById("cameraContainer");
  const cameraVideo = document.getElementById("cameraVideo");
  const captureBtn = document.getElementById("captureBtn");
  const closeCameraBtn = document.getElementById("closeCameraBtn");
  const captureCanvas = document.getElementById("captureCanvas");
  const previewContainer = document.getElementById("previewContainer");
  const previewImg = document.getElementById("previewImg");
  const scanBtn = document.getElementById("scanBtn");
  const resetBtn = document.getElementById("resetBtn");
  const spinner = document.getElementById("spinner");
  const errorBox = document.getElementById("errorBox");
  const resultsSection = document.getElementById("resultsSection");
  const identifiedBanner = document.getElementById("identifiedBanner");
  const resultsGrid = document.getElementById("resultsGrid");

  let currentFile = null;
  let cameraStream = null;

  // ── Drag & drop ──────────────────────────────────────────────
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) loadFile(file);
  });

  dropZone.addEventListener("click", (e) => {
    if (e.target === dropZone || e.target.closest(".drop-zone") === dropZone) {
      if (!e.target.closest(".btn")) fileInput.click();
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
  });

  // ── Camera ───────────────────────────────────────────────────
  cameraBtn.addEventListener("click", async () => {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      cameraVideo.srcObject = cameraStream;
      dropZone.hidden = true;
      cameraContainer.hidden = false;
    } catch {
      showError("Camera access denied or not available. Please upload an image instead.");
    }
  });

  captureBtn.addEventListener("click", () => {
    captureCanvas.width = cameraVideo.videoWidth;
    captureCanvas.height = cameraVideo.videoHeight;
    captureCanvas.getContext("2d").drawImage(cameraVideo, 0, 0);
    captureCanvas.toBlob((blob) => {
      stopCamera();
      loadFile(new File([blob], "capture.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  });

  closeCameraBtn.addEventListener("click", stopCamera);

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    cameraContainer.hidden = true;
    dropZone.hidden = false;
  }

  // ── File loading ──────────────────────────────────────────────
  function loadFile(file) {
    currentFile = file;
    const url = URL.createObjectURL(file);
    previewImg.src = url;
    dropZone.hidden = true;
    cameraContainer.hidden = true;
    previewContainer.hidden = false;
    hideResults();
    hideError();
  }

  // ── Reset ─────────────────────────────────────────────────────
  resetBtn.addEventListener("click", reset);

  function reset() {
    currentFile = null;
    previewContainer.hidden = true;
    dropZone.hidden = false;
    fileInput.value = "";
    hideResults();
    hideError();
    spinner.hidden = true;
  }

  // ── Scan ──────────────────────────────────────────────────────
  scanBtn.addEventListener("click", () => {
    if (!currentFile) return;
    hideResults();
    hideError();
    previewContainer.hidden = true;
    spinner.hidden = false;

    const form = new FormData();
    form.append("image", currentFile);

    fetch("/scan", { method: "POST", body: form })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        spinner.hidden = true;
        previewContainer.hidden = false;
        if (!ok || data.error) {
          showError(data.error || "Something went wrong. Please try again.");
          return;
        }
        renderResults(data);
      })
      .catch(() => {
        spinner.hidden = true;
        previewContainer.hidden = false;
        showError("Network error. Is the server running?");
      });
  });

  // ── Render results ────────────────────────────────────────────
  function renderResults({ identified, results }) {
    const authorText = identified.author ? ` by <strong>${esc(identified.author)}</strong>` : "";
    identifiedBanner.innerHTML =
      `Identified: <strong>${esc(identified.title)}</strong>${authorText}`;

    resultsGrid.innerHTML = results
      .map(
        (r) => `
      <div class="result-card">
        <div class="result-cover">
          ${r.cover_url
            ? `<img src="${esc(r.cover_url)}" alt="Cover" loading="lazy" />`
            : `<span class="no-cover">📖</span>`}
        </div>
        <div class="result-body">
          <div class="result-title">${esc(r.title || identified.title)}</div>
          ${r.authors && r.authors.length
            ? `<div class="result-author">${esc(r.authors.join(", "))}</div>`
            : ""}
          ${r.year ? `<div class="result-year">First published: ${r.year}</div>` : ""}
          ${r.isbn ? `<div class="result-isbn">ISBN: ${r.isbn}</div>` : ""}
        </div>
        <div class="store-links">
          <a class="store-link amazon" href="${esc(r.amazon_url)}" target="_blank" rel="noopener">
            <span class="icon">🛒</span> Find on Amazon
          </a>
          <a class="store-link" href="${esc(r.google_books_url)}" target="_blank" rel="noopener">
            <span class="icon">📗</span> Google Books
          </a>
          <a class="store-link" href="${esc(r.goodreads_url)}" target="_blank" rel="noopener">
            <span class="icon">⭐</span> Goodreads
          </a>
          <a class="store-link" href="${esc(r.open_library_url)}" target="_blank" rel="noopener">
            <span class="icon">🏛️</span> Open Library
          </a>
        </div>
      </div>`
      )
      .join("");

    resultsSection.hidden = false;
  }

  // ── Helpers ───────────────────────────────────────────────────
  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }
  function hideError() { errorBox.hidden = true; }
  function hideResults() { resultsSection.hidden = true; }

  function esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
