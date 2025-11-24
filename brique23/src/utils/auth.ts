export function authAdmin(scope: string) {
    return (req: any, res: any, next: any) => {
        // Implémentation réelle à connecter avec le système d'authentification Molam
        // Pour l'instant, stub d'authentification
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Vérifier le scope dans le token JWT
        try {
            // Décoder et vérifier le JWT
            // const decoded = verifyToken(token);
            // if (!decoded.scopes.includes(scope)) {
            //   return res.status(403).json({ error: 'Insufficient permissions' });
            // }
            next();
        } catch (error) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    };
}