/**
 * Brique 43 - Checkout Orchestration
 * Internationalization Middleware
 *
 * Extracts lang, currency, country from:
 * 1. Auth context (JWT/API key)
 * 2. Headers (Accept-Language, X-Currency, X-Country)
 * 3. Defaults
 */

import { Request, Response, NextFunction } from "express";

export interface I18nContext {
  lang: string;
  currency: string;
  country: string;
}

declare global {
  namespace Express {
    interface Request {
      i18n?: I18nContext;
    }
  }
}

/**
 * i18n middleware - enriches request with locale context
 */
export function i18nMiddleware(req: Request, res: Response, next: NextFunction): void {
  const auth = req.auth;
  const acceptLang = (req.headers["accept-language"] as string) || "";
  const currency = (req.headers["x-currency"] as string) || "";
  const country = (req.headers["x-country"] as string) || "";

  // Priority: auth > headers > defaults
  req.i18n = {
    lang: auth?.lang || acceptLang.split(",")[0]?.split("-")[0] || "en",
    currency: auth?.currency || currency || "USD",
    country: auth?.country || country || "US",
  };

  next();
}
