
import { Router } from "express";
import { requireAuth } from "../auth/authmiddleware.js";
import { requireOrganization } from "../../middleware/requireorganization.js";
import { requireRole } from "../../middleware/requirerole.js";
import { listAuditLogsController } from "./auditlogcontroller.js";
import multer from "multer";
import { importBankStatementController } from "./reconciliationcontroller.js";
import { manuallyMatchReconciliationItemController } from "./reconciliationcontroller.js";

import {
  createLedgerTransactionController,
  listLedgerTransactionsController,
  getLedgerTransactionController,
  getAccountBalancesController,
  getTrialBalanceController,
  createTransferController,
  reverseLedgerTransactionController,
  getMonthlyCashFlowController,
  
} from "./ledgercontoller.js";
import {
  listReconciliationsController,
  getReconciliationDetailsController,
} from "./reconciliationquerycontroller.js";

const router = Router();
const reconciliationUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
});

router.post(
  "/organizations/:organizationId/ledger/transactions",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin"),
  createLedgerTransactionController,
);

router.get(
  "/organizations/:organizationId/ledger/transactions",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin", "auditor"),
  listLedgerTransactionsController,
);

router.get(
  "/organizations/:organizationId/ledger/transactions/:transactionId",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin", "auditor"),
  getLedgerTransactionController,
);
router.get(
  "/organizations/:organizationId/ledger/account-balances",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin", "auditor"),
  getAccountBalancesController,
);
router.get(
  "/organizations/:organizationId/ledger/monthly-cash-flow",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin", "auditor"),
  getMonthlyCashFlowController,
);

router.get(
  "/organizations/:organizationId/ledger/trial-balance",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin", "auditor"),
  getTrialBalanceController,
);
router.get(
  "/organizations/:organizationId/audit-logs",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin", "auditor"),
  listAuditLogsController,
);
router.post(
  "/organizations/:organizationId/ledger/transfers",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin"),
  createTransferController,
);
router.post(
  "/organizations/:organizationId/ledger/transactions/:transactionId/reverse",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin"),
  reverseLedgerTransactionController,
);
router.post(
  "/organizations/:organizationId/reconciliations",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin"),
  reconciliationUpload.single("file"),
  importBankStatementController,
);
router.get(
  "/organizations/:organizationId/reconciliations",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin", "auditor"),
  listReconciliationsController,
);

router.get(
  "/organizations/:organizationId/reconciliations/:reconciliationId",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin", "auditor"),
  getReconciliationDetailsController,
);
router.patch(
  "/organizations/:organizationId/reconciliations/:reconciliationId/items/:itemId/match",
  requireAuth,
  requireOrganization,
  requireRole("owner", "finance_admin"),
  manuallyMatchReconciliationItemController,
);

export default router;
