import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  createLedgerTransaction,
  listLedgerTransactions,
  getLedgerTransaction,
  getAccountBalances,
  getTrialBalance,
  reverseLedgerTransaction,
    getMonthlyCashFlow,
} from "./ledgerservices.js";
import type { AuthenticatedRequest } from "../auth/authmiddleware.js";
import {
  createTransferSchema,
  
} from "./ledgerschemas.js";
import { AppError } from "../../middleware/apperror.js";


export async function createLedgerTransactionController(
  req: AuthenticatedRequest,
  res: Response,
) {
  const { organizationId } = req.params;

  if (typeof organizationId !== "string") {
    res.status(400).json({ message: "Invalid organization ID" });
    return;
  }

  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  try {
    const idempotencyKey = req.get("Idempotency-Key");

    const transaction = await createLedgerTransaction(
      organizationId,
      req.body,
      req.user.id,
      idempotencyKey,
    );

    const replayed = transaction.idempotencyReplayed === true;

    res.status(replayed ? 200 : 201).json({
      message: replayed
        ? "Original ledger transaction returned successfully"
        : "Ledger transaction created and posted successfully",
      transaction,
    });
} catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        message: error.message,
      });
      return;
    }

    if (error instanceof ZodError) {
      res.status(400).json({
        message: "Invalid transaction data",
        errors: error.issues,
      });
      return;
    }

    if (error instanceof Error) {
      const badRequestErrors = [
        "Ledger transaction must have equal debit and credit totals",
        "One or more accounts do not exist, are inactive, or are inaccessible",
        "Idempotency-Key must contain 1 to 255 characters",
      ];

      if (badRequestErrors.includes(error.message)) {
        res.status(400).json({ message: error.message });
        return;
      }

      const conflictErrors = [
        "This Idempotency-Key was already used with different transaction data",
        "Unable to resolve the existing idempotent request",
        "The original transaction could not be retrieved",
        "Unable to post ledger transaction",
      ];

      if (conflictErrors.includes(error.message)) {
        res.status(409).json({ message: error.message });
        return;
      }
    }

    const databaseError = error as { code?: string };

    if (databaseError?.code === "23514") {
      res.status(400).json({
        message: "The transaction violates a ledger rule",
      });
      return;
    }

    console.error("Create ledger transaction failed:", error);

    res.status(500).json({
      message: "Failed to create ledger transaction",
    });
  }
}



export async function listLedgerTransactionsController(
  req: Request,
  res: Response,
) {
  const { organizationId } = req.params;

  if (typeof organizationId !== "string") {
    res.status(400).json({ message: "Invalid organization ID" });
    return;
  }

  const pageValue = req.query.page ?? "1";
  const limitValue = req.query.limit ?? "20";

  const page = Number(pageValue);
  const limit = Number(limitValue);

  if (
    typeof pageValue !== "string" ||
    typeof limitValue !== "string" ||
    !Number.isInteger(page) ||
    !Number.isInteger(limit) ||
    page < 1 ||
    limit < 1 ||
    limit > 100
  ) {
    res.status(400).json({
      message: "page must be positive; limit must be between 1 and 100",
    });
    return;
  }

  const from = req.query.from;
  const to = req.query.to;
  const search = req.query.search;

  if (
    (from !== undefined && typeof from !== "string") ||
    (to !== undefined && typeof to !== "string") ||
    (search !== undefined && typeof search !== "string")
  ) {
    res.status(400).json({
      message: "from, to, and search must be single string values",
    });
    return;
  }

  // Validate dates using the YYYY-MM-DD format.
  const isValidDate = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  };

  if (
    (from !== undefined && !isValidDate(from)) ||
    (to !== undefined && !isValidDate(to))
  ) {
    res.status(400).json({
      message: "from and to must be valid dates in YYYY-MM-DD format",
    });
    return;
  }

  if (from && to && from > to) {
    res.status(400).json({
      message: "from must be earlier than or equal to to",
    });
    return;
  }

  try {
    const result = await listLedgerTransactions(
      organizationId,
      page,
      limit,
      undefined,
      {
        from,
        to,
        search,
      },
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("List ledger transactions failed:", error);

    res.status(500).json({
      message: "Failed to retrieve ledger transactions",
    });
  }
}


export async function getLedgerTransactionController(
  req: Request,
  res: Response,
) {
  const { organizationId, transactionId } = req.params;

  if (
    typeof organizationId !== "string" ||
    typeof transactionId !== "string"
  ) {
    res.status(400).json({ message: "Invalid request parameters" });
    return;
  }

  try {
    const transaction = await getLedgerTransaction(
      organizationId,
      transactionId,
    );

    if (!transaction) {
      res.status(404).json({ message: "Transaction not found" });
      return;
    }

    res.status(200).json({ transaction });
  } catch (error) {
    console.error("Get ledger transaction failed:", error);

    res.status(500).json({
      message: "Failed to retrieve ledger transaction",
    });
  }
}

export async function getAccountBalancesController(
  req: Request,
  res: Response,
) {
  const { organizationId } = req.params;

  if (typeof organizationId !== "string") {
    res.status(400).json({ message: "Invalid organization ID" });
    return;
  }

  try {
    const accounts = await getAccountBalances(organizationId);

    res.status(200).json({ accounts });
  } catch (error) {
    console.error("Get account balances failed:", error);

    res.status(500).json({
      message: "Failed to retrieve account balances",
    });
  }
}

export async function getTrialBalanceController(
  req: Request,
  res: Response,
) {
  const { organizationId } = req.params;

  if (typeof organizationId !== "string") {
    res.status(400).json({ message: "Invalid organization ID" });
    return;
  }

  try {
    const report = await getTrialBalance(organizationId);

    res.status(200).json({ trialBalance: report });
  } catch (error) {
    console.error("Get trial balance failed:", error);

    res.status(500).json({
      message: "Failed to generate trial balance",
    });
  }
}

export async function getMonthlyCashFlowController(
  req: Request,
  res: Response,
) {
  const { organizationId } = req.params;

  if (typeof organizationId !== "string") {
    res.status(400).json({ message: "Invalid organization ID" });
    return;
  }

  try {
    const months = await getMonthlyCashFlow(organizationId);

    res.status(200).json({ months });
  } catch (error) {
    console.error("Get monthly cash flow failed:", error);

    res.status(500).json({
      message: "Failed to generate monthly cash flow",
    });
  }
}

export async function createTransferController(
  req: AuthenticatedRequest,
  res: Response,
) {
  const { organizationId } = req.params;

  if (typeof organizationId !== "string") {
    res.status(400).json({ message: "Invalid organization ID" });
    return;
  }

  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  try {
    const data = createTransferSchema.parse(req.body);
    const idempotencyKey = req.get("Idempotency-Key");

    const transaction = await createLedgerTransaction(
      organizationId,
      {
        description: data.description,
        entries: [
          {
            accountId: data.toAccountId,
            entryType: "debit",
            amountPaise: data.amountPaise,
          },
          {
            accountId: data.fromAccountId,
            entryType: "credit",
            amountPaise: data.amountPaise,
          },
        ],
      },
      req.user.id,
      idempotencyKey,
    );

    const replayed = transaction.idempotencyReplayed === true;

    res.status(replayed ? 200 : 201).json({
      message: replayed
        ? "Original transfer returned successfully"
        : "Transfer completed successfully",
      transaction,
    });
  } catch (error) {
    // Handle application errors with their intended HTTP status.
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        message: error.message,
      });
      return;
    }

    // Handle request validation errors.
    if (error instanceof ZodError) {
      res.status(400).json({
        message: "Invalid transfer data",
        errors: error.issues,
      });
      return;
    }

    // Handle known business errors.
    if (error instanceof Error) {
      const badRequestErrors = [
        "Ledger transaction must have equal debit and credit totals",
        "One or more accounts do not exist, are inactive, or are inaccessible",
        "Idempotency-Key must contain 1 to 255 characters",
      ];

      if (badRequestErrors.includes(error.message)) {
        res.status(400).json({ message: error.message });
        return;
      }

      const conflictErrors = [
        "This Idempotency-Key was already used with different transaction data",
        "Unable to resolve the existing idempotent request",
        "The original transaction could not be retrieved",
        "Unable to post ledger transaction",
      ];

      if (conflictErrors.includes(error.message)) {
        res.status(409).json({ message: error.message });
        return;
      }
    }

    // Handle database constraint violations.
    const databaseError = error as { code?: string };

    if (databaseError?.code === "23514") {
      res.status(400).json({
        message: "The transaction violates a ledger rule",
      });
      return;
    }

    // Handle unexpected errors.
    console.error("Create transfer failed:", error);

    res.status(500).json({
      message: "Failed to complete transfer",
    });
  }
}

export async function reverseLedgerTransactionController(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
   
    const organizationId = req.params.organizationId;
const transactionId = req.params.transactionId;

if (
  typeof organizationId !== "string" ||
  typeof transactionId !== "string"
) {
  return res.status(400).json({
    message: "Valid organization ID and transaction ID are required",
  });
}

    if (!organizationId || !transactionId) {
      return res.status(400).json({
        message: "Organization ID and transaction ID are required",
      });
    }

    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const transaction = await reverseLedgerTransaction(
      organizationId,
      transactionId,
      req.user.id,
    );

    return res.status(201).json({
      message: "Ledger transaction reversed successfully",
      transaction,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    console.error("Failed to reverse ledger transaction:", error);

    return res.status(500).json({
      message: "Failed to reverse ledger transaction",
    });
  }
}
