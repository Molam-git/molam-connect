import { prisma } from "../infra/db.js";

export async function findUserById(userId: string) {
    return prisma.molam_users.findUnique({
        where: { id: userId },
        select: {
            id: true,
            user_type: true,
            country: true,
            kyc_level: true,
            is_active: true
        }
    });
}

export async function resolveUserByHandle(handle: { type: "phone" | "email" | "molam_id"; value: string }) {
    // Stub implementation - in production this would query an identity table
    if (handle.type === "molam_id") {
        return prisma.molam_users.findUnique({
            where: { id: handle.value },
            select: { id: true }
        });
    }

    // For phone/email, you would query a separate identities table
    // This is a simplified version
    return null;
}