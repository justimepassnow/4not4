<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />



# KTU Valuator 3000 🎯

## Basic Details
### Team Name: Supply Shenanigans

### Team Members
- Team Lead: Akshay - TinkerHub

### Project Description
A satirical, in-browser answer sheet evaluation software inspired by Kerala KTU valuation memes. Instead of reading handwritten answers, it evaluates papers based on physical ink volume, answer vertical height, flowchart/box presence, and most importantly: the **exact time of evaluation** (pre-lunch hangry hour vs post-chaya nirvana).

### The Problem (that doesn't exist)
KTU engineering professors spend countless hours agonizing over whether students actually answered the question or just drew a recursive system architecture diagram with 5 arrows and wrote lyrics in cursive.

### The Solution (that nobody asked for)
An automated in-browser AI valuation cell powered by PaddleOCR DBNet (ONNX WASM) that ignores semantic words entirely and scores papers using authentic university valuation lore:
- **Vertical Span Metric**: The longer the answer, the higher the marks.
- **Diagram Multiplier**: Any box with arrows gets +3.5 marks automatically.
- **Time-of-Valuation Mood Engine**:
  - **12:30 PM (Pre-Lunch Hangry Hour)**: -25% penalty, 38/100 failure syndrome.
  - **11:15 AM (Post-Chaya Nirvana)**: Sulaimani & Parippuvada high, +10 marks to everyone!
  - **02:45 PM (Post-Lunch Food Coma)**: Flat 52/100 to everyone without looking.
  - **04:50 PM (KSRTC Bus Rush)**: 5-second grading purely by diagram count.

## Technical Details
### Technologies/Components Used
For Software:
- Languages: JavaScript (ES Modules), HTML5 Canvas, CSS3
- Frameworks/Tools: Vite
- Machine Learning Engine: `onnxruntime-web` (PaddleOCR DBNet Mobile `ch_PP-OCRv3_det` in WebAssembly)
- Image Processing: Canvas API, Adaptive Thresholding, Connected-Component Bounding Box Extraction

### Implementation
For Software:
# Installation
```bash
npm install
```

# Run
```bash
npm run dev
```


### Project Documentation
For Software:

# Screenshots (Add at least 3)
![Screenshot1](Add screenshot 1 here with proper name)
*Add caption explaining what this shows*

![Screenshot2](Add screenshot 2 here with proper name)
*Add caption explaining what this shows*

![Screenshot3](Add screenshot 3 here with proper name)
*Add caption explaining what this shows*

# Diagrams
![Workflow](Add your workflow/architecture diagram here)
*Add caption explaining your workflow*

For Hardware:

# Schematic & Circuit
![Circuit](Add your circuit diagram here)
*Add caption explaining connections*

![Schematic](Add your schematic diagram here)
*Add caption explaining the schematic*

# Build Photos
![Components](Add photo of your components here)
*List out all components shown*

![Build](Add photos of build process here)
*Explain the build steps*

![Final](Add photo of final product here)
*Explain the final build*

### Project Demo
# Video
[Add your demo video link here]
*Explain what the video demonstrates*

# Additional Demos
[Add any extra demo materials/links]

## Team Contributions
- [Name 1]: [Specific contributions]
- [Name 2]: [Specific contributions]
- [Name 3]: [Specific contributions]

---
Made with ❤️ at TinkerHub Useless Projects 

![Static Badge](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)
![Static Badge](https://img.shields.io/badge/UselessProjects--26-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)





### Valuation workspace
The interface uses a responsive blue portal theme. Upload an image or PDF, toggle region outlines and marks, and navigate PDF pages to review the complete booklet report.

Question markers are estimated from compact shapes in the left margin with nearby answer content. Without markers, large whitespace gaps separate regions. Labels such as R1 and P2-R1 identify detected regions, not recognised question numbers. Detached headers are excluded when a first answer marker is found. The existing satirical scoring and shift rules are preserved.

The basic detector keeps thin strokes, separates margin markers from answer lines, and supports both image and PDF canvases. Detection remains geometric; handwriting recognition and semantic answer assessment are not included. ONNX runtime assets are bundled locally with the app.

Run `npm test` for grouping, fallback detection, supplied image samples, and three-page PDF checks. Run `npm run build` for the production bundle.
