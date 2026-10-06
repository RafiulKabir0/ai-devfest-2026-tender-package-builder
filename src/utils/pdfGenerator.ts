import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { TenderInfo, Requirement, UploadedPdfFile } from '../types';

export interface IncludedDocumentItem {
  requirement: Requirement;
  file: UploadedPdfFile;
  expiryDate: string;
}

/**
 * Generates the complete compliant Tender Package PDF.
 * Includes:
 * 1. English Cover Page
 * 2. Matched documents in ascending requirement order
 * 3. Page X of Y footer on EVERY page (including cover)
 */
export async function generatePackagePdf(
  tender: TenderInfo,
  includedItems: IncludedDocumentItem[]
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();
  const helvetica = await mergedPdf.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold);

  // 1. Cover Page (Standard A4: 595.28 x 841.89 points)
  const coverPage = mergedPdf.addPage([595.28, 841.89]);
  const { width: cWidth, height: cHeight } = coverPage.getSize();

  // Top header accent line
  coverPage.drawRectangle({
    x: 40,
    y: cHeight - 65,
    width: cWidth - 80,
    height: 6,
    color: rgb(0.14, 0.38, 0.82), // Royal blue accent
  });

  // Main Title
  coverPage.drawText('TENDER DOCUMENT PACKAGE', {
    x: 40,
    y: cHeight - 105,
    size: 20,
    font: helveticaBold,
    color: rgb(0.1, 0.15, 0.25),
  });

  coverPage.drawText('Official Tender Submission Dossier', {
    x: 40,
    y: cHeight - 122,
    size: 11,
    font: helvetica,
    color: rgb(0.38, 0.44, 0.52),
  });

  // Tender Details Summary Box
  const infoTop = cHeight - 148;
  coverPage.drawRectangle({
    x: 40,
    y: infoTop - 132,
    width: cWidth - 80,
    height: 132,
    color: rgb(0.96, 0.975, 0.995),
    borderColor: rgb(0.85, 0.88, 0.94),
    borderWidth: 1,
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const tenderDetails: [string, string][] = [
    ['Tender ID:', tender.tender_id || 'N/A'],
    ['Tender Title:', tender.title || 'N/A'],
    ['Procuring Entity:', tender.procuring_entity || 'N/A'],
    ['Bidder Name:', tender.bidder || 'N/A'],
    ['Submission Deadline:', tender.submission_deadline || 'N/A'],
    ['Package Creation Date:', todayStr],
  ];

  tenderDetails.forEach(([label, value], idx) => {
    const yPos = infoTop - 22 - idx * 19;
    coverPage.drawText(label, {
      x: 55,
      y: yPos,
      size: 9.5,
      font: helveticaBold,
      color: rgb(0.22, 0.28, 0.38),
    });
    coverPage.drawText(value, {
      x: 205,
      y: yPos,
      size: 9.5,
      font: helvetica,
      color: rgb(0.12, 0.14, 0.18),
    });
  });

  // Table of Included Documents
  const tableTop = infoTop - 165;
  coverPage.drawText('TABLE OF INCLUDED DOCUMENTS', {
    x: 40,
    y: tableTop,
    size: 13,
    font: helveticaBold,
    color: rgb(0.1, 0.15, 0.25),
  });

  // Table header bar
  coverPage.drawRectangle({
    x: 40,
    y: tableTop - 30,
    width: cWidth - 80,
    height: 22,
    color: rgb(0.14, 0.38, 0.82),
  });

  coverPage.drawText('#', { x: 48, y: tableTop - 22, size: 9, font: helveticaBold, color: rgb(1, 1, 1) });
  coverPage.drawText('Requirement Title', { x: 75, y: tableTop - 22, size: 9, font: helveticaBold, color: rgb(1, 1, 1) });
  coverPage.drawText('Attached File', { x: 265, y: tableTop - 22, size: 9, font: helveticaBold, color: rgb(1, 1, 1) });
  coverPage.drawText('Pages', { x: 440, y: tableTop - 22, size: 9, font: helveticaBold, color: rgb(1, 1, 1) });
  coverPage.drawText('Expiry Date', { x: 485, y: tableTop - 22, size: 9, font: helveticaBold, color: rgb(1, 1, 1) });

  let curY = tableTop - 30;

  // Render Table Rows
  includedItems.forEach((item, index) => {
    curY -= 22;
    // Row alternate background
    if ((index + 1) % 2 === 0) {
      coverPage.drawRectangle({
        x: 40,
        y: curY,
        width: cWidth - 80,
        height: 22,
        color: rgb(0.96, 0.975, 0.995),
      });
    }

    // Row bottom line
    coverPage.drawLine({
      start: { x: 40, y: curY },
      end: { x: cWidth - 40, y: curY },
      color: rgb(0.88, 0.9, 0.94),
      thickness: 0.5,
    });

    coverPage.drawText(String(index + 1), {
      x: 48,
      y: curY + 6,
      size: 8.5,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });

    // English title as required for cover page
    const title = item.requirement.title_en || item.requirement.id;
    coverPage.drawText(title.length > 32 ? title.slice(0, 31) + '…' : title, {
      x: 75,
      y: curY + 6,
      size: 8.5,
      font: helveticaBold,
      color: rgb(0.12, 0.14, 0.18),
    });

    const fname = item.file.name;
    coverPage.drawText(fname.length > 30 ? fname.slice(0, 29) + '…' : fname, {
      x: 265,
      y: curY + 6,
      size: 8,
      font: helvetica,
      color: rgb(0.2, 0.24, 0.3),
    });

    coverPage.drawText(String(item.file.pageCount), {
      x: 446,
      y: curY + 6,
      size: 8.5,
      font: helvetica,
      color: rgb(0.2, 0.24, 0.3),
    });

    coverPage.drawText(item.expiryDate || 'N/A', {
      x: 485,
      y: curY + 6,
      size: 8,
      font: helvetica,
      color: rgb(0.3, 0.35, 0.4),
    });
  });

  // 2. Append all matched documents in ascending requirement order
  for (const item of includedItems) {
    try {
      const srcDoc = await PDFDocument.load(item.file.arrayBuffer, { ignoreEncryption: true });
      const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
      for (const p of copiedPages) {
        mergedPdf.addPage(p);
      }
    } catch (err) {
      console.error(`Failed to append document ${item.file.name}:`, err);
      throw new Error(`Failed to append document ${item.file.name}`);
    }
  }

  // 3. Count total pages and add footer to EVERY page
  const totalPages = mergedPdf.getPageCount();

  for (let i = 0; i < totalPages; i++) {
    const page = mergedPdf.getPage(i);
    const { width } = page.getSize();
    const pageNum = i + 1;
    const footerText = `${tender.tender_id} | Page ${pageNum} of ${totalPages}`;
    const textWidth = helvetica.widthOfTextAtSize(footerText, 9);

    page.drawText(footerText, {
      x: (width - textWidth) / 2,
      y: 20,
      size: 9,
      font: helvetica,
      color: rgb(0.25, 0.28, 0.32),
    });
  }

  return await mergedPdf.save();
}
