
import { z } from "zod";

export const createLedgerTransactionSchema = z.object({
  description: z.string().trim().min(3).max(500),

  reference: z.string().trim().min(1).max(255).optional(),

  entries: z
    .array(
      z.object({
        accountId: z.string().uuid(),

        entryType: z.enum(["debit", "credit"]),

        amountPaise: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER),
      }),
    )
    .min(2)
    .max(100),
});

export const createTransferSchema = z.object({
  description: z.string().trim().min(3).max(500),

  fromAccountId: z.string().uuid(),

  toAccountId: z.string().uuid(),

  amountPaise: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
}).refine(
  (data) => data.fromAccountId !== data.toAccountId,
  {
    message: "Source and destination accounts must be different",
    path: ["toAccountId"],
  },
);
