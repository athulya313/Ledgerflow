
import type { Request, Response , NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../../middleware/apperror.js";
import { importBankStatement } from "./reconciliationservices.js";
import { manuallyMatchReconciliationItem } from "./reconciliationservices.js";



type ReconciliationRequest = Request & {
  user?: {
    id: string;
  };
};

export async function importBankStatementController(
  req: ReconciliationRequest,
  res: Response,
) {
  try {
    const organizationId = req.params.organizationId;

    if (typeof organizationId !== "string") {
      return res.status(400).json({
        message: "Valid organization ID is required",
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Please upload a CSV file using the 'file' field",
      });
    }

    if (!req.file.originalname.toLowerCase().endsWith(".csv")) {
      return res.status(400).json({
        message: "Only CSV files are allowed",
      });
    }

    const csvContent = req.file.buffer.toString("utf8");

    const result = await importBankStatement(
      organizationId,
      req.user.id,
      {
        accountId: req.body.accountId,
        statementName: req.body.statementName,
      },
      csvContent,
    );

    return res.status(201).json({
      message: "Bank statement imported successfully",
      ...result,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Invalid reconciliation input",
        errors: error.issues,
      });
    }

    console.error("Failed to import bank statement:", error);

    return res.status(500).json({
      message: "Failed to import bank statement",
    });
  }
  
}
export async function manuallyMatchReconciliationItemController(
  req: ReconciliationRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const result = await manuallyMatchReconciliationItem(
      req.params.organizationId as string,
      req.params.reconciliationId as string,
      req.params.itemId as string,
      req.body.ledgerTransactionId,
      req.user.id,
    );

    return res.status(200).json({
      message: "Reconciliation item matched successfully",
      result,
    });
  } catch (error) {
    next(error);
  }
}