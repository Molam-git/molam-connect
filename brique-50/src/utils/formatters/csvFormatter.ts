/**
 * Brique 50 - Fiscal Reporting
 * CSV Formatter
 */

export function formatToCsv(canonical: any): string {
  const { reportType, items = [] } = canonical;

  if (reportType === "vat_return") {
    // VAT Return CSV format
    const header = "Line,Description,Net Amount,Tax Rate,Tax Amount,Currency\n";
    const rows = items.map((item: any, idx: number) =>
      `${idx + 1},${item.description || "Service Fee"},${item.amount || 0},${item.tax_rate || 0},${
        item.tax_amount || 0
      },${item.currency || "USD"}`
    );
    return header + rows.join("\n");
  }

  if (reportType === "withholding") {
    // Withholding tax CSV format
    const header = "Beneficiary,Country,Amount,Withholding Rate,Tax Withheld,Currency\n";
    const rows = items.map((item: any) =>
      `${item.beneficiary || ""},${item.country || ""},${item.amount || 0},${item.rate || 0},${
        item.tax_withheld || 0
      },${item.currency || "USD"}`
    );
    return header + rows.join("\n");
  }

  // Generic CSV format
  const header = "Date,Description,Amount,Currency\n";
  const rows = items.map((item: any) =>
    `${item.date || ""},${item.description || ""},${item.amount || 0},${item.currency || "USD"}`
  );
  return header + rows.join("\n");
}
