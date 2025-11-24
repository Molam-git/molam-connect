import { prisma } from "../infra/db.js";

export async function getCurrencyMeta(code: string) {
    return prisma.molam_currency.findUnique({
        where: { code }
    });
}