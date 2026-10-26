import type { Response, NextFunction } from "express";
import type { OrganizationRequest } from "./requireorganization.js";

type OrganizationRole = "owner" | "finance_admin" | "auditor";

export function requireRole(...allowedRoles: OrganizationRole[]) {
  return (
    req: OrganizationRequest,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.organization) {
      res.status(403).json({
        error: "Organization access has not been verified",
      });
      return;
    }

    if (!allowedRoles.includes(req.organization.role)) {
      res.status(403).json({
        error: "Insufficient permissions",
      });
      return;
    }

    next();
  };
}