# Implementation Plan: In-Browser Answer Sheet Analysis via PaddleOCR (Detection-Only)

This document outlines the end-to-end architecture and implementation strategy for using a lightweight PaddleOCR detection model to analyze handwritten answer sheets directly in the browser. 

By isolating the **DBNet Detection Model (~3-4MB)** and running it via WebAssembly (WASM), we achieve high-speed bounding box generation without the overhead of full text recognition (OCR) or server-side processing.

---

## 1. System Architecture & Tech Stack

*   **Core Engine:** `onnxruntime-web` (Microsoft's WebAssembly port for running machine learning models in-browser).
*   **Model:** PaddleOCR DBNet (Mobile version, quantized to `.onnx` format).
*   **Image Processing:** HTML5 `<canvas>` API for rendering, cropping, and pixel manipulation.
*   **Hosting / Deployment:** A serverless static edge network like Cloudflare Pages is ideal for serving the static HTML/JS and the `.onnx` model files efficiently.
*   **Development Environment:** Node.js, Vite (for fast local dev server), and standard JavaScript/TypeScript.

---

## 2. Phase 1: Preparation & Model Acquisition

Before writing application logic, the model must be prepared for the browser.

1.  **Download the DBNet Model:** Obtain the lightweight PaddleOCR text detection model (usually named `ch_PP-OCRv3_det`).
2.  **Convert to ONNX:** Use the `paddle2onnx` Python utility to convert the model into the `.onnx` format. 
    ```bash
    paddle2onnx --model_dir ./ch_PP-OCRv3_det_infer                 --model_filename inference.pdmodel                 --params_filename inference.pdiparams                 --save_file ./dbnet.onnx                 --enable_onnx_checker True
    ```
3.  **Project Setup:** Initialize a new Vite project. Place `dbnet.onnx` into the `/public` directory so it can be fetched by the browser at runtime.
4.  **Install Dependencies:** 
    ```bash
    npm install onnxruntime-web
    ```

---

## 3. Phase 2: Browser Ingestion Pipeline

The pipeline begins when an image is loaded into the browser via file upload or camera capture.

### 3.1. Canvas Pre-processing
*   Load the image into an `Image()` object.
*   Draw the image onto a hidden `<canvas>`.
*   **Resize & Pad:** The DBNet model expects inputs in multiples of 32 (e.g., 640x640). Scale the image down while preserving the aspect ratio, and pad the remaining space with black pixels.
*   **Tensor Extraction:** Extract the raw pixel data using `ctx.getImageData()`. Convert this into a flat `Float32Array`, normalizing the RGB values to a `[0, 1]` range as required by the model.

### 3.2. WebAssembly Inference
*   Initialize the ONNX Runtime session:
    ```javascript
    import * as ort from 'onnxruntime-web';
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
    const session = await ort.InferenceSession.create('/dbnet.onnx', { executionProviders: ['wasm'] });
    ```
*   Pass the `Float32Array` tensor to the session.
*   The model will output a probability map (a grid where high values indicate the presence of ink).

---

## 4. Phase 3: Bounding Box Extraction (The Post-Processing)

The raw output of the ONNX model is a heatmap. To get actionable X/Y coordinates, we must process this map.

1.  **Thresholding:** Iterate through the probability map. Any pixel above a certain confidence threshold (e.g., `0.6`) is flagged as "ink".
2.  **Contour Finding:** Use a lightweight JavaScript implementation of connected-component labeling (or a small library like `jsfeat`) to group adjacent "ink" pixels into solid blocks.
3.  **Box Generation:** Calculate the minimum bounding rectangle `[x, y, width, height]` for each distinct block. 
4.  **Rescaling:** Multiply the bounding box coordinates back up by the scale factor used in Step 3.1 to map them to the original, full-size image.

---

## 5. Phase 4: Spatial Logic & Answer Sizing (The Core Algorithm)

Now that you have an array of bounding boxes for every piece of writing on the page, apply spatial logic to determine which boxes belong to which question.

### Step A: Identify the Anchors (Questions)
Assuming the printed questions (e.g., "Q1", "Q2") have a distinct, predictable structure or location:
*   Sort all bounding boxes vertically by their `y` coordinate (top to bottom).
*   Identify the boxes that represent the printed questions. *Tip: Printed text bounding boxes are usually perfectly horizontal, tightly packed, and align strictly to the left margin.*

### Step B: Group Answers to Questions
Iterate through the boxes. Any box that falls spatially *below* the Q1 anchor, but *above* the Q2 anchor, is classified as the "Answer to Q1".

### Step C: Measure Answer Size
For the array of boxes grouped under Q1:
1.  **Find the extremes:** Find the minimum `y` (top of the first handwriting line) and the maximum `y + height` (bottom of the last handwriting line).
2.  **Calculate Height:** The difference between these two Y coordinates is the total vertical space consumed by the answer.
3.  **Volume Metric:** Optionally, sum the area (`width * height`) of all individual boxes within the group to get an "ink volume" metric. This differentiates a full page of writing from a single, vertically stretched line.

---

## 6. Phase 5: Feedback and Validation UI

Provide immediate visual feedback to the user to ensure the crop and logic worked correctly.

*   Render the original image on a visible UI `<canvas>`.
*   Draw **Blue** bounding boxes around identified Questions.
*   Draw **Green** bounding boxes around grouped Answers.
*   Overlay a small text label displaying the calculated size/volume metric next to each answer block.

---

## 7. Next Steps for Implementation
1. Ensure your local environment has Python installed for the `paddle2onnx` conversion script.
2. Draft the HTML/JS boilerplate for the image uploader.
3. Implement the `onnxruntime-web` initialization function to verify the model loads successfully in the browser without memory leaks.
