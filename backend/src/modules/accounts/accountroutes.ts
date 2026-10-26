import { Router } from "express";
import { requireAuth } from "../auth/authmiddleware.js";
import { requireOrganization } from "../../middleware/requireorganization.js";
import { requireRole } from "../../middleware/requirerole.js";
import {
  createAccountController,
  getAccountController,
  listAccountsController,
} from "./accountcontroller.js";

export const accountsRouter = Router();

accountsRouter.post(
  "/:organizationId/accounts",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin"),
  createAccountController,
);

accountsRouter.get(
  "/:organizationId/accounts",
  requireAuth,
  requireOrganization,
  listAccountsController,
);

accountsRouter.get(
  "/:organizationId/accounts/:accountId",
  requireAuth,
  requireOrganization,
  getAccountController,
);