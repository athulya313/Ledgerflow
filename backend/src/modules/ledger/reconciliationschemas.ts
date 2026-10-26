
import { z } from "zod";

export const reconciliationUploadSchema = z.object({
  accountId: z.string().uuid(),
  statementName: z.string().trim().min(1).max(255),
});

export const reconciliationCsvRowSchema = z.object({
  transaction_date: z.string().trim().min(1),
  description: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(120).optional(),
  amount: z.string().trim().min(1),
});

export type ReconciliationUploadInput = z.infer<
  typeof reconciliationUploadSchema
>;

export type ReconciliationCsvRow = z.infer<
  typeof reconciliationCsvRowSchema
>;
