/**
 * BRIQUE 145 — Utility Functions
 */

const COUNTRY_TO_ZONE: Record<string, string> = {
  // CEDEAO (West Africa)
  SN: "CEDEAO",
  ML: "CEDEAO",
  CI: "CEDEAO",
  BJ: "CEDEAO",
  BF: "CEDEAO",
  GH: "CEDEAO",
  NG: "CEDEAO",
  NE: "CEDEAO",
  TG: "CEDEAO",

  // EU
  FR: "EU",
  DE: "EU",
  ES: "EU",
  IT: "EU",
  BE: "EU",
  NL: "EU",

  // US
  US: "US",
  CA: "US",

  // ASEAN
  SG: "ASEAN",
  MY: "ASEAN",
  TH: "ASEAN",
  ID: "ASEAN",
  PH: "ASEAN",
  VN: "ASEAN"
};

export function mapCountryToZone(country?: string): string {
  if (!country) return "GLOBAL";
  const upperCountry = country.toUpperCase();
  return COUNTRY_TO_ZONE[upperCountry] || "GLOBAL";
}

export function normalizeCity(city?: string): string {
  if (!city) return "unknown";
  return city.trim().toLowerCase().slice(0, 100);
}

export function truncateToMinute(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return d;
}