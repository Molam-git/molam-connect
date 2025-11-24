export function authMiddleware(_scope: string) {
    return (req: any, _res: any, next: any) => {
        // Implémentation réelle de l'authentification JWT
        req.user = { id: 1 }; // placeholder
        next();
    };
}