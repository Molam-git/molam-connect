import { z } from "zod";

export const CreateWalletSchema = z.object({
    user_id: z.string().uuid(),
    country_code: z.string().length(2),
    currency: z.string().length(3),
    is_default: z.boolean().optional().default(false),
    display_name: z.string().max(120).optional(),
});

export const UpdateWalletSchema = z.object({
    is_default: z.boolean().optional(),
    status: z.enum(["active", "frozen", "closed"]).optional(),
    display_name: z.string().max(120).optional(),
});