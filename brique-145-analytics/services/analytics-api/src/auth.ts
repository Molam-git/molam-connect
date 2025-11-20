/**
 * BRIQUE 145 — Authentication & Authorization
 */
import jwt from "jsonwebtoken";

export async function verifyMolamJwt(token: string): Promise<any> {
  const publicKey = process.env.MOLAM_ID_PUBLIC_KEY || "";

  if (!publicKey) {
    throw new Error("MOLAM_ID_PUBLIC_KEY not configured");
  }

  try {
    const payload = jwt.verify(token, publicKey, {
      algorithms: ["RS256", "ES256"]
    });
    return payload;
  } catch (error: any) {
    throw new Error(`Invalid token: ${error.message}`);
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: any, res: any, next: any) => {
    const userRoles = req.user?.roles || [];

    const hasRole = userRoles.some((role: string) =>
      allowedRoles.includes(role)
    );

    if (!hasRole) {
      return res.status(403).json({
        error: "forbidden",
        required_roles: allowedRoles
      });
    }

    next();
  };
}
