// ============================================================================
// Brique 46 - Billing & Invoicing
// PDF Generation (HTML to PDF using Puppeteer)
// ============================================================================

import puppeteer from "puppeteer";

const MOCK_PDF_GENERATION = process.env.MOCK_PDF_GENERATION === "true";
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;

/**
 * Render HTML to PDF using Puppeteer
 */
export async function renderHTMLToPDF(html: string): Promise<Buffer> {
  if (MOCK_PDF_GENERATION) {
    // Return mock PDF for development
    return Buffer.from(`%PDF-1.4\nMOCK PDF CONTENT\n${html.slice(0, 100)}...`);
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
      printBackground: true,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return str.replace(/[&<>"']/g, (m) => map[m]);
}
