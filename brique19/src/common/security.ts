// src/common/security.ts
import { Request } from "express";

export async function verifyEmployeeJWT(req: Request): Promise<{ type: "EMPLOYEE"; employeeId: number; roles: string[] }> {
    // Implémentation simplifiée
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new Error("No token");

    // Vérification JWT réelle irait ici
    return { type: "EMPLOYEE", employeeId: 1, roles: ["pay_finance"] };
}

export async function verifyAgentJWT(req: Request): Promise<{ type: "AGENT"; agentId: number }> {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new Error("No token");

    return { type: "AGENT", agentId: Number(req.query.agentId) };
}

export async function requireFinanceRole(req: Request, requiredRoles: string[]) {
    const auth = await verifyEmployeeJWT(req);
    const hasRole = auth.roles.some(role => requiredRoles.includes(role));
    if (!hasRole) throw new Error("Insufficient permissions");
    return auth;
}