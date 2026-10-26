import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../modules/auth/authmiddleware.js";
import { pool } from "../db/pool.js";

export interface OrganizationRequest extends AuthenticatedRequest {
  organization?: {
    id: string;
    name: string;
    role: "owner" | "finance_admin" | "auditor";
  };
}

export async function requireOrganization(
  req: OrganizationRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const organizationId = req.params.organizationId;
    const userId = req.user?.id;

    // requireAuth must run before this middleware.
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!organizationId) {
      res.status(400).json({ error: "Organization ID is required" });
      return;
    }

    const result = await pool.query(
      `SELECT o.id, o.name, m.role
       FROM memberships m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = $1 AND o.id = $2`,
      [userId, organizationId],
    );

    if (result.rows.length === 0) {
      res.status(403).json({
        error: "You do not have access to this organization",
      });
      return;
    }

    req.organization = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}