import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
    errorFormat: "minimal",
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
});

// Graceful shutdown
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});