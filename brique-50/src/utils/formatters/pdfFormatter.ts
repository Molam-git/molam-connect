/**
 * Brique 50 - Fiscal Reporting
 * PDF Formatter using Puppeteer
 */

import puppeteer from "puppeteer";

export async function renderPdf(canonical: any, locale: string = "en"): Promise<Buffer> {
  const html = generateHTML(canonical, locale);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "20mm",
      right: "15mm",
      bottom: "20mm",
      left: "15mm",
    },
  });

  await browser.close();
  return Buffer.from(pdf);
}

function generateHTML(canonical: any, locale: string): string {
  const { legalEntity, reportType, periodStart, periodEnd, items = [] } = canonical;

  const labels = getLabels(locale);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 11pt;
      color: #1d1d1f;
      line-height: 1.5;
    }
    h1 { font-size: 24pt; font-weight: 600; margin-bottom: 8px; }
    h2 { font-size: 14pt; font-weight: 600; margin-top: 20px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { text-align: left; padding: 8px; border-bottom: 2px solid #1d1d1f; font-weight: 600; }
    td { padding: 8px; border-bottom: 1px solid #e5e5e5; }
    .header { margin-bottom: 24px; }
    .meta { color: #6e6e73; font-size: 10pt; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${labels.title} - ${reportType.toUpperCase()}</h1>
    <div class="meta">
      <strong>${labels.entity}:</strong> ${legalEntity}<br>
      <strong>${labels.period}:</strong> ${periodStart} → ${periodEnd}
    </div>
  </div>

  <h2>${labels.details}</h2>
  <table>
    <thead>
      <tr>
        <th>${labels.description}</th>
        <th>${labels.amount}</th>
        <th>${labels.currency}</th>
        <th>${labels.tax}</th>
      </tr>
    </thead>
    <tbody>
      ${items
        .map(
          (item: any) => `
        <tr>
          <td>${item.description || item.event_type || "-"}</td>
          <td>${item.amount || 0}</td>
          <td>${item.currency || "USD"}</td>
          <td>${item.tax_amount || 0}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <div style="margin-top: 40px; color: #6e6e73; font-size: 9pt;">
    ${labels.footer}
  </div>
</body>
</html>
  `;
}

function getLabels(locale: string): any {
  const translations: Record<string, any> = {
    en: {
      title: "Fiscal Report",
      entity: "Legal Entity",
      period: "Period",
      details: "Transaction Details",
      description: "Description",
      amount: "Amount",
      currency: "Currency",
      tax: "Tax",
      footer: "This document was generated automatically by Molam Treasury System.",
    },
    fr: {
      title: "Rapport Fiscal",
      entity: "Entité Légale",
      period: "Période",
      details: "Détails des Transactions",
      description: "Description",
      amount: "Montant",
      currency: "Devise",
      tax: "Taxe",
      footer: "Ce document a été généré automatiquement par le système Molam Treasury.",
    },
    es: {
      title: "Informe Fiscal",
      entity: "Entidad Legal",
      period: "Período",
      details: "Detalles de Transacciones",
      description: "Descripción",
      amount: "Monto",
      currency: "Moneda",
      tax: "Impuesto",
      footer: "Este documento fue generado automáticamente por el sistema Molam Treasury.",
    },
  };

  return translations[locale] || translations["en"];
}
