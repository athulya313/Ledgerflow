import type { Response, NextFunction } from "express";
import type { OrganizationRequest } from "../../middleware/requireorganization.js";
import {
  createAccountRecord,
  findAccountById,
  listAccounts,
} from "./accountservice.js";

export async function createAccountController(
  req: OrganizationRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.organization) {
      res.status(403).json({ error: "Organization access required" });
      return;
    }

    const account = await createAccountRecord(
      req.organization.id,
      req.body,
    );

    res.status(201).json({ account });
  } catch (error) {
    next(error);
  }
}

export async function listAccountsController(
  req: OrganizationRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.organization) {
      res.status(403).json({ error: "Organization access required" });
      return;
    }

    const accounts = await listAccounts(req.organization.id);

    res.status(200).json({ accounts });
  } catch (error) {
    next(error);
  }
}

export async function getAccountController(
  req: OrganizationRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.organization) {
      res.status(403).json({ error: "Organization access required" });
      return;
    }

    const accountId = req.params.accountId;

    if (typeof accountId !== "string") {
      res.status(400).json({ error: "Invalid account ID" });
      return;
    }

    const account = await findAccountById(
      req.organization.id,
      accountId,
    );

    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    res.status(200).json({ account });
  } catch (error) {
    next(error);
  }
}
