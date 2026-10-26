
import type { Request, Response } from "express";
import {
  getReconciliationDetails,
  listReconciliations,
} from "./reconciliationservices.js";

type ReconciliationRequest = Request & {
  user?: { id: string };
};

function parsePagination(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback;

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return Math.min(parsed, max);
}

export async function listReconciliationsController(
  req: ReconciliationRequest,
  res: Response,
) {
  const organizationId = req.params.organizationId;

  if (typeof organizationId !== "string") {
    return res.status(400).json({ message: "Valid organization ID is required" });
  }

  const page = parsePagination(req.query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePagination(req.query.limit, 20, 100);

  if (page === null || limit === null) {
    return res.status(400).json({
      message: "page must be a positive integer and limit must be between 1 and 100",
    });
  }

  try {
    const result = await listReconciliations(organizationId, page, limit);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Failed to list reconciliations:", error);
    return res.status(500).json({ message: "Failed to list reconciliations" });
  }
}

export async function getReconciliationDetailsController(
  req: ReconciliationRequest,
  res: Response,
) {
  const organizationId = req.params.organizationId;
  const reconciliationId = req.params.reconciliationId;

  if (
    typeof organizationId !== "string" ||
    typeof reconciliationId !== "string"
  ) {
    return res.status(400).json({ message: "Valid IDs are required" });
  }

  const page = parsePagination(req.query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePagination(req.query.limit, 20, 100);
  const status = req.query.status;

  if (page === null || limit === null) {
    return res.status(400).json({
      message: "page must be a positive integer and limit must be between 1 and 100",
    });
  }

  if (
    status !== undefined &&
    status !== "matched" &&
    status !== "unmatched"
  ) {
    return res.status(400).json({
      message: "status must be 'matched' or 'unmatched'",
    });
  }

  try {
    const result = await getReconciliationDetails(
      organizationId,
      reconciliationId,
      page,
      limit,
      status as "matched" | "unmatched" | undefined,
    );

    if (!result) {
      return res.status(404).json({ message: "Reconciliation not found" });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Failed to get reconciliation details:", error);
    return res.status(500).json({
      message: "Failed to get reconciliation details",
    });
  }
}
