/**
 * Brique 50 - Fiscal Reporting
 * XML Formatter
 */

export function formatToXml(canonical: any): string {
  const { legalEntity, reportType, periodStart, periodEnd, items = [] } = canonical;

  if (reportType === "digital_services") {
    // EU Digital Services Tax format (example)
    return `<?xml version="1.0" encoding="UTF-8"?>
<DigitalServicesDeclaration>
  <Header>
    <LegalEntity>${escapeXml(legalEntity)}</LegalEntity>
    <PeriodStart>${periodStart}</PeriodStart>
    <PeriodEnd>${periodEnd}</PeriodEnd>
  </Header>
  <Transactions>
    ${items
      .map(
        (item: any) => `
    <Transaction>
      <Date>${item.date || ""}</Date>
      <Country>${item.country || ""}</Country>
      <Amount>${item.amount || 0}</Amount>
      <Currency>${item.currency || "USD"}</Currency>
      <Tax>${item.tax_amount || 0}</Tax>
    </Transaction>`
      )
      .join("")}
  </Transactions>
</DigitalServicesDeclaration>`;
  }

  // Generic XML format
  return `<?xml version="1.0" encoding="UTF-8"?>
<FiscalReport>
  <Header>
    <LegalEntity>${escapeXml(legalEntity)}</LegalEntity>
    <Type>${reportType}</Type>
    <PeriodStart>${periodStart}</PeriodStart>
    <PeriodEnd>${periodEnd}</PeriodEnd>
  </Header>
  <Items>
    ${items
      .map(
        (item: any) => `
    <Item>
      <Description>${escapeXml(item.description || "")}</Description>
      <Amount>${item.amount || 0}</Amount>
      <Currency>${item.currency || "USD"}</Currency>
    </Item>`
      )
      .join("")}
  </Items>
</FiscalReport>`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
