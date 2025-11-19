// ============================================================================
// I18n Middleware - Multi-language support
// ============================================================================

import { Request, Response, NextFunction } from "express";

const translations: Record<string, Record<string, string>> = {
  en: {
    sales: "Sales",
    refunds: "Refunds",
    fees: "Fees",
    net_revenue: "Net Revenue",
    transactions: "Transactions",
    payouts: "Payouts",
    disputes: "Disputes",
  },
  fr: {
    sales: "Ventes",
    refunds: "Remboursements",
    fees: "Frais",
    net_revenue: "Revenu Net",
    transactions: "Transactions",
    payouts: "Versements",
    disputes: "Litiges",
  },
  ar: {
    sales: "المبيعات",
    refunds: "المبالغ المستردة",
    fees: "الرسوم",
    net_revenue: "صافي الإيرادات",
    transactions: "المعاملات",
    payouts: "المدفوعات",
    disputes: "النزاعات",
  },
  wo: {
    sales: "Jàyyu",
    refunds: "Dellu",
    fees: "Sàcc",
    net_revenue: "Jàyyu bu Mat",
    transactions: "Jëfandikoo",
    payouts: "Fey",
    disputes: "Xeex",
  },
};

export function i18nMiddleware(req: Request, res: Response, next: NextFunction): void {
  const lang = req.user?.lang || req.headers["accept-language"]?.split(",")[0] || "en";
  const locale = lang.split("-")[0]; // en-US -> en

  // Attach translate function to response locals
  res.locals.t = (key: string): string => {
    return translations[locale]?.[key] || translations.en[key] || key;
  };

  res.locals.lang = locale;

  next();
}

export function translate(key: string, lang: string = "en"): string {
  const locale = lang.split("-")[0];
  return translations[locale]?.[key] || translations.en[key] || key;
}
