export function rateLimit() {
    return (_req: any, _res: any, next: any) => {
        // Implémentation réelle du rate limiting
        next();
    };
}