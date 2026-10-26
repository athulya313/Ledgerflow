import type { Response } from "express";
import type { OrganizationRequest } from "../../middleware/requireorganization.js";

export function getOrganization(
  req: OrganizationRequest,
  res: Response,
) {
  res.json({
    organization: req.organization,
  });
}