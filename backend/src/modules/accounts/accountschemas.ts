import { z } from "zod";

export const createAccountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  accountType: z.enum([
    "asset",
    "liability",
    "equity",
    "income",
    "expense",
  ]),
});

export const accountIdSchema = z.string().uuid();