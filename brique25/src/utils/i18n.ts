import { Request, Response, NextFunction } from "express";

export function i18nMiddleware(req: any, res: any, next: NextFunction) {
    const lang = req.user?.lang || "en";
    req.t = (key: string) => {
        // Simplified i18n - would integrate with proper i18n library
        return key;
    };
    next();
}