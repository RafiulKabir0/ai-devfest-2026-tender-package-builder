# Tender Document Package Builder

Official submission for the **AI DevFest 2026 Vibe-Coding Contest**.

---

## Participant Information
- **Name:** Rafiul Kabir
- **Registration Number:** [253-35-162]

---

## Live Links
- **Public GitHub Repository:** [https://github.com/RafiulKabir0/ai-devfest-2026-tender-package-builder](https://github.com/RafiulKabir0/ai-devfest-2026-tender-package-builder)
- **Live Deployment (HTTPS):** [https://ai-devfest-2026-tender-package-buil.vercel.app](https://ai-devfest-2026-tender-package-buil.vercel.app)

---

## Overview
The **Tender Document Package Builder** is a client-side web application engineered to streamline official tender submission dossier assembly. The application processes arbitrary `requirements.json` specifications, ingests and verifies multiple PDF documents, detects exact duplicate file content via cryptographic hashing, manages one-to-one requirement mapping, enforces strict submission deadline expiry checks, and compiles a single, compliant, sequentially ordered PDF package featuring an official English cover page and dynamic universal `Page X of Y` footers on every page.

All processing occurs strictly inside the client browser. No documents, metadata, or keys are transmitted to any backend or cloud service.

---

## Main Features
1. **Dynamic `requirements.json` Ingestion:**
   - Safe client-side schema parsing and validation.
   - Dynamic extraction and display of Tender ID, Title, Procuring Entity, Bidder Name, and Submission Deadline.
   - Automatic ordering of tender requirements sorted ascending by `order`.

2. **Client-Side Multi-PDF Ingestion & Validation:**
   - Multi-file drag-and-drop and file-picker upload.
   - Enforces 30-file maximum and 50 MB total package size limits.
   - Strict rejection and warning alerts for non-PDF files.
   - Non-destructive corrupted/encrypted file safety guards.
   - Accurate client-side page counting.

3. **Cryptographic SHA-256 Duplicate Detection:**
   - Uses Web Crypto API (`crypto.subtle.digest`) to compute binary SHA-256 hashes of all uploaded PDFs.
   - Visual red duplicate badges and duplicate state tracking.
   - Prevents multiple copies of identical PDFs from being assigned to different requirements.

4. **1-to-1 Requirement Matching & Expiry Engine:**
   - Each requirement can have at most one matched file.
   - Each file can be assigned to at most one requirement.
   - Calendar-date comparison (`YYYY-MM-DD` string comparison) between document expiry dates and tender submission deadline, avoiding timezone and daylight savings distortion.

5. **Strict 5-State Status Engine & Blocking Validation:**
   - Centralized status engine computing:
     - `Missing`: Mandatory requirement with no matched file (**Blocking**).
     - `Expiry date needed`: Requirement with `has_expiry: true` and matched file, but no expiry date provided (**Blocking**).
     - `Expired`: Document expiry date is strictly before the submission deadline (**Blocking**).
     - `Not provided`: Optional requirement with no matched file (**Non-blocking**).
     - `OK`: Requirement fully satisfied with valid document and valid expiry date (**Non-blocking**).
   - Package generation button is strictly disabled whenever any blocking issue exists, displaying an explicit breakdown of all blocking issues.

6. **Compliant PDF Package Generation:**
   - Page 1: Official English cover page containing complete tender metadata and an ordered table of all included documents (with document title, attached filename, page counts, and expiry dates).
   - Subsequent pages: Original pages of all matched documents appended in ascending requirement order.
   - Skips unprovided optional requirements.
   - Universal footer stamped on **every** page (including cover page): `<tender_id> | Page X of Y` (where `Y` is the exact total package page count).
   - Single-click download named `<tender_id>_Package.pdf` (e.g., `T-2026-0417_Package.pdf`).

7. **Bilingual Support (English & Bangla):**
   - Full interface toggle between English and Bengali (বাংলা).
   - Translates all headings, buttons, instructions, status badges, summary counters, and alerts.
   - Uses `title_en` for English and `title_bn` for Bengali.
   - Retains the official English cover page on generated PDFs as mandated by contest rules.

---

## Bonus Features
- **Smart Auto-Match Suggestion:** Intelligent keyword-based matching algorithm that analyzes filename tokens against requirement titles and codes to map files with a single click.
- **Visual Status Overview Bar:** Real-time summary pills indicating exact counts of OK, Missing, Expiry Needed, Expired, and Not Provided documents.
- **Unmatch & Re-assignment Controls:** One-click unmatch and replacement for rapid file adjustments.
- **Responsive & Accessible UI:** Office document management theme with typography optimized for both English (Inter) and Bengali (Noto Sans Bengali).

---

## Known Problems
- **None.** All core, priority 1, priority 2, and sample pack verification requirements are implemented and verified end-to-end.

---

## AI Tools Used
- **Google Antigravity IDE** powered by Gemini 3.8 Flash (High) Advanced Agentic Coding.

---

## Most Useful AI Prompt
```
Build a client-side Tender Document Package Builder in Vite, React, and TypeScript that dynamically parses requirements.json, performs multi-PDF upload, SHA-256 duplicate detection, strict calendar-date expiry validation against tender submission deadline, 5-state requirement status tracking, blocking issue prevention, bilingual English/Bangla UI, and compiles a single compliant PDF package with an English cover page and Page X of Y footer on every page using pdf-lib.
```

---

## How to Run Locally

### Prerequisites
- Node.js 18+ (tested on Node.js v22.14.0)
- npm 9+

### Installation & Development
```bash
# Clone the repository
git clone https://github.com/RafiulKabir0/ai-devfest-2026-tender-package-builder.git
cd ai-devfest-2026-tender-package-builder

# Install dependencies
npm install

# Start local development server
npm run dev
```

Visit `http://localhost:3000` in Google Chrome.

---

## How to Build

```bash
# Type check and build production bundle
npm run build

# Preview production build locally
npm run preview
```

Production artifacts will be generated in `dist/`.
