
import type { Request, Response, NextFunction } from "express";
import { listAuditLogs } from "./auditlogservices.js";

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export async function listAuditLogsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { organizationId } = req.params;

    if (typeof organizationId !== "string") {
      res.status(400).json({ message: "Invalid organization ID" });
      return;
    }

    const pageParam = req.query.page ?? "1";
    const limitParam = req.query.limit ?? "20";

    if (
      typeof pageParam !== "string" ||
      typeof limitParam !== "string"
    ) {
      res.status(400).json({
        message: "Page and limit must each be a single value",
      });
      return;
    }

    const page = Number(pageParam);
    const limit = Number(limitParam);

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      res.status(400).json({
        message: "Page must be positive and limit must be between 1 and 100",
      });
      return;
    }

    const action = req.query.action;
    const from = req.query.from;
    const to = req.query.to;

    if (
      (action !== undefined && typeof action !== "string") ||
      (from !== undefined && typeof from !== "string") ||
      (to !== undefined && typeof to !== "string")
    ) {
      res.status(400).json({
        message: "Action, from, and to must each be single values",
      });
      return;
    }

    if (
      (from !== undefined && !isValidDate(from)) ||
      (to !== undefined && !isValidDate(to))
    ) {
      res.status(400).json({
        message: "Dates must be valid dates in YYYY-MM-DD format",
      });
      return;
    }

    if (from && to && from > to) {
      res.status(400).json({
        message: "'from' must be on or before 'to'",
      });
      return;
    }

    if (action !== undefined && action.trim().length === 0) {
      res.status(400).json({
        message: "Action cannot be empty",
      });
      return;
    }

    const result = await listAuditLogs(organizationId, page, limit, {
      ...(action !== undefined && { action }),
      ...(from !== undefined && { from }),
      ...(to !== undefined && { to }),
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
