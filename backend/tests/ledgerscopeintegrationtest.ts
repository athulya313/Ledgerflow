
import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { testPool } from "../src/db/testpool.js";
import {
  getAccountBalances,
  getLedgerTransaction,
  getTrialBalance,
  listLedgerTransactions,
} from "../src/modules/ledger/ledgerservices.js";
import { listAuditLogs } from "../src/modules/ledger/auditlogservices.js";

type OrganizationRecords = {
  organizationId: string;
  cashAccountId: string;
  incomeAccountId: string;
  postedTransactionId: string;
  draftTransactionId: string;
};

async function createOrganizationRecords(
  client: PoolClient,
  name: string,
): Promise<OrganizationRecords> {
  const organizationResult = await client.query<{ id: string }>(
    `INSERT INTO organizations (name)
     VALUES ($1)
     RETURNING id`,
    [`${name} ${crypto.randomUUID()}`],
  );

  const organizationId = organizationResult.rows[0]!.id;

  const cashResult = await client.query<{ id: string }>(
    `INSERT INTO accounts (organization_id, name, account_type)
     VALUES ($1, $2, 'asset')
     RETURNING id`,
    [organizationId, `Cash ${crypto.randomUUID()}`],
  );

  const incomeResult = await client.query<{ id: string }>(
    `INSERT INTO accounts (organization_id, name, account_type)
     VALUES ($1, $2, 'income')
     RETURNING id`,
    [organizationId, `Income ${crypto.randomUUID()}`],
  );

  const cashAccountId = cashResult.rows[0]!.id;
  const incomeAccountId = incomeResult.rows[0]!.id;

  const postedResult = await client.query<{ id: string }>(
    `INSERT INTO ledger_transactions
       (organization_id, description, status)
     VALUES ($1, $2, 'draft')
     RETURNING id`,
    [organizationId, `${name} posted transaction`],
  );

  const postedTransactionId = postedResult.rows[0]!.id;

  await client.query(
    `INSERT INTO ledger_entries
       (organization_id, transaction_id, account_id, entry_type, amount_paise)
     VALUES
       ($1, $2, $3, 'debit', 10000),
       ($1, $2, $4, 'credit', 10000)`,
    [organizationId, postedTransactionId, cashAccountId, incomeAccountId],
  );

  const draftResult = await client.query<{ id: string }>(
    `INSERT INTO ledger_transactions
       (organization_id, description, status)
     VALUES ($1, $2, 'draft')
     RETURNING id`,
    [organizationId, `${name} draft transaction`],
  );

  const draftTransactionId = draftResult.rows[0]!.id;

  await client.query(
    `INSERT INTO ledger_entries
       (organization_id, transaction_id, account_id, entry_type, amount_paise)
     VALUES
       ($1, $2, $3, 'debit', 5000),
       ($1, $2, $4, 'credit', 5000)`,
    [organizationId, draftTransactionId, cashAccountId, incomeAccountId],
  );

  await client.query(
    `UPDATE ledger_transactions
     SET status = 'posted',
         posted_at = NOW()
     WHERE organization_id = $1
       AND id = $2`,
    [organizationId, postedTransactionId],
  );

  return {
    organizationId,
    cashAccountId,
    incomeAccountId,
    postedTransactionId,
    draftTransactionId,
  };
}

async function withTestTransaction(
  test: (client: PoolClient) => Promise<void>,
) {
  const client = await testPool.connect();
  let transactionStarted = false;

  try {
    const database = await client.query<{ name: string }>(
      "SELECT current_database() AS name",
    );

    if (database.rows[0]?.name !== "ledgerflow_test") {
      throw new Error(
        "Safety check failed: refusing to write outside ledgerflow_test.",
      );
    }

    await client.query("BEGIN");
    transactionStarted = true;

    await test(client);
  } finally {
    try {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }
    } finally {
      client.release();
    }
  }
}

async function insertAuditLog(
  client: PoolClient,
  organizationId: string,
  actorUserId: string,
  action: string,
  createdAt: string,
) {
  await client.query(
    `INSERT INTO audit_logs
       (organization_id, actor_user_id, action, resource_type, metadata, created_at)
     VALUES ($1, $2, $3, 'test', '{}'::jsonb, $4::timestamptz)`,
    [organizationId, actorUserId, action, createdAt],
  );
}

async function getTestActorUserId(client: PoolClient): Promise<string> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM users LIMIT 1`,
  );

  if (!result.rows[0]) {
    throw new Error(
      "Audit-log tests require at least one user in ledgerflow_test.",
    );
  }

  return result.rows[0].id;
}


async function createPostedHistoryTransaction(
  client: PoolClient,
  organizationId: string,
  cashAccountId: string,
  incomeAccountId: string,
  description: string,
  postedAt: string,
): Promise<string> {
  const transactionResult = await client.query<{ id: string }>(
    `INSERT INTO ledger_transactions (organization_id, description, status)
     VALUES ($1, $2, 'draft')
     RETURNING id`,
    [organizationId, description],
  );

  const transactionId = transactionResult.rows[0]!.id;

  await client.query(
    `INSERT INTO ledger_entries
       (organization_id, transaction_id, account_id, entry_type, amount_paise)
     VALUES
       ($1, $2, $3, 'debit', 10000),
       ($1, $2, $4, 'credit', 10000)`,
    [organizationId, transactionId, cashAccountId, incomeAccountId],
  );

  await client.query(
    `UPDATE ledger_transactions
     SET status = 'posted',
         posted_at = $3::timestamptz
     WHERE organization_id = $1
       AND id = $2`,
    [organizationId, transactionId, postedAt],
  );

  return transactionId;
}

describe("Ledger organization isolation", () => {
  afterAll(async () => {
    await testPool.end();
  });

  it("returns an empty result when an organization has no audit logs", async () => {
    await withTestTransaction(async (client) => {
      const records = await createOrganizationRecords(
        client,
        "Audit Log Empty Test",
      );

      const result = await listAuditLogs(
        records.organizationId,
        1,
        20,
        {},
        client,
      );

      expect(result.auditLogs).toHaveLength(0);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });
  });

  it("lists only the selected organization's audit logs", async () => {
    await withTestTransaction(async (client) => {
      const orgA = await createOrganizationRecords(client, "Audit Log Org A");
      const orgB = await createOrganizationRecords(client, "Audit Log Org B");
      const actorUserId = await getTestActorUserId(client);

      await insertAuditLog(
        client,
        orgA.organizationId,
        actorUserId,
        "TEST_ACTION_A",
        "2026-01-10T10:00:00Z",
      );

      await insertAuditLog(
        client,
        orgB.organizationId,
        actorUserId,
        "TEST_ACTION_B",
        "2026-01-10T11:00:00Z",
      );

      const result = await listAuditLogs(
        orgA.organizationId,
        1,
        20,
        {},
        client,
      );

      expect(result.auditLogs).toHaveLength(1);
      expect(result.auditLogs[0]?.organization_id).toBe(orgA.organizationId);
      expect(result.auditLogs[0]?.action).toBe("TEST_ACTION_A");
      expect(result.pagination.total).toBe(1);
    });
  });

  it("filters audit logs by action", async () => {
    await withTestTransaction(async (client) => {
      const org = await createOrganizationRecords(client, "Audit Action Filter");
      const actorUserId = await getTestActorUserId(client);

      await insertAuditLog(
        client, org.organizationId, actorUserId,
        "LEDGER_TRANSACTION_POSTED", "2026-01-10T10:00:00Z",
      );
      await insertAuditLog(
        client, org.organizationId, actorUserId,
        "ACCOUNT_CREATED", "2026-01-11T10:00:00Z",
      );
      await insertAuditLog(
        client, org.organizationId, actorUserId,
        "LEDGER_TRANSACTION_POSTED", "2026-01-12T10:00:00Z",
      );

      const result = await listAuditLogs(
        org.organizationId,
        1,
        20,
        { action: "LEDGER_TRANSACTION_POSTED" },
        client,
      );

      expect(result.auditLogs).toHaveLength(2);
      expect(
        result.auditLogs.every(
          (log) => log.action === "LEDGER_TRANSACTION_POSTED",
        ),
      ).toBe(true);
      expect(result.pagination.total).toBe(2);
    });
  });

  it("filters audit logs by an inclusive date range", async () => {
    await withTestTransaction(async (client) => {
      const org = await createOrganizationRecords(client, "Audit Date Filter");
      const actorUserId = await getTestActorUserId(client);

      await insertAuditLog(
        client, org.organizationId, actorUserId,
        "BEFORE_RANGE", "2026-01-09T23:59:59Z",
      );
      await insertAuditLog(
        client, org.organizationId, actorUserId,
        "START_DATE", "2026-01-10T00:00:00Z",
      );
      await insertAuditLog(
        client, org.organizationId, actorUserId,
        "END_DATE", "2026-01-12T23:59:59Z",
      );
      await insertAuditLog(
        client, org.organizationId, actorUserId,
        "AFTER_RANGE", "2026-01-13T00:00:00Z",
      );

      const result = await listAuditLogs(
        org.organizationId,
        1,
        20,
        { from: "2026-01-10", to: "2026-01-12" },
        client,
      );
   expect(result.auditLogs).toHaveLength(2);
      expect(
        result.auditLogs.map((log) => log.action).sort(),
      ).toEqual(["END_DATE", "START_DATE"]);
      expect(result.pagination.total).toBe(2);
    });
  });

  it("paginates audit logs and returns the filtered total", async () => {
    await withTestTransaction(async (client) => {
      const org = await createOrganizationRecords(client, "Audit Pagination");
      const actorUserId = await getTestActorUserId(client);

      for (let i = 1; i <= 5; i++) {
        await insertAuditLog(
          client,
          org.organizationId,
          actorUserId,
          `PAGINATION_ACTION_${i}`,
          `2026-02-${String(i).padStart(2, "0")}T10:00:00Z`,
        );
      }

      const result = await listAuditLogs(
        org.organizationId,
        2,
        2,
        {},
        client,
      );

      expect(result.auditLogs).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 5,
        totalPages: 3,
      });

      // Results are ordered newest first.
  expect(result.auditLogs[0]?.action).toBe("PAGINATION_ACTION_3");

expect(result.auditLogs[1]?.action).toBe("PAGINATION_ACTION_2");
    });
  });

  it("does not return another organization's transaction details", async () => {
    await withTestTransaction(async (client) => {
      const orgA = await createOrganizationRecords(client, "Scope company A");
      const orgB = await createOrganizationRecords(client, "Scope company B");

      const result = await getLedgerTransaction(
        orgA.organizationId,
        orgB.postedTransactionId,
        client,
      );

      expect(result).toBeNull();
    });
  });


  
  it("does not return a draft transaction in transaction details", async () => {
    await withTestTransaction(async (client) => {
      const orgA = await createOrganizationRecords(client, "Draft company A");

      const result = await getLedgerTransaction(
        orgA.organizationId,
        orgA.draftTransactionId,
        client,
      );

      expect(result).toBeNull();
    });
  });

  it("allows audit logs to be inserted", async () => {
    await withTestTransaction(async (client) => {
      const org = await createOrganizationRecords(client, "Audit Insert Test");
      const actorUserId = await getTestActorUserId(client);

      await insertAuditLog(
        client,
        org.organizationId,
        actorUserId,
        "IMMUTABILITY_INSERT_TEST",
        "2026-03-01T10:00:00Z",
      );

      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM audit_logs
         WHERE organization_id = $1
           AND action = 'IMMUTABILITY_INSERT_TEST'`,
        [org.organizationId],
      );

      expect(result.rows[0]?.count).toBe("1");
    });
  });

  it("rejects updates to audit logs", async () => {
    await withTestTransaction(async (client) => {
      const org = await createOrganizationRecords(client, "Audit Update Test");
      const actorUserId = await getTestActorUserId(client);

      await insertAuditLog(
        client,
        org.organizationId,
        actorUserId,
        "IMMUTABILITY_UPDATE_TEST",
        "2026-03-01T10:00:00Z",
      );

      const result = await client.query<{ id: string }>(
        `SELECT id FROM audit_logs
         WHERE organization_id = $1
           AND action = 'IMMUTABILITY_UPDATE_TEST'`,
        [org.organizationId],
      );

      const auditLogId = result.rows[0]!.id;

      await client.query("SAVEPOINT audit_update_attempt");

      let updateError: unknown;

      try {
        await client.query(
          `UPDATE audit_logs
           SET action = 'CHANGED_ACTION'
           WHERE id = $1`,
          [auditLogId],
        );
      } catch (error) {
        updateError = error;
      }

      await client.query("ROLLBACK TO SAVEPOINT audit_update_attempt");
      await client.query("RELEASE SAVEPOINT audit_update_attempt");

      expect(updateError).toBeDefined();
      expect((updateError as { code?: string }).code).toBe("55000");
      expect(String((updateError as Error).message)).toContain(
        "Audit logs cannot be updated or deleted",
      );
    });
  });

  it("rejects deletes of audit logs", async () => {
    await withTestTransaction(async (client) => {
      const org = await createOrganizationRecords(client, "Audit Delete Test");
      const actorUserId = await getTestActorUserId(client);

      await insertAuditLog(
        client,
        org.organizationId,
        actorUserId,
        "IMMUTABILITY_DELETE_TEST",
        "2026-03-01T10:00:00Z",
      );

      const result = await client.query<{ id: string }>(
        `SELECT id FROM audit_logs
         WHERE organization_id = $1
           AND action = 'IMMUTABILITY_DELETE_TEST'`,
        [org.organizationId],
      );

      const auditLogId = result.rows[0]!.id;

      await client.query("SAVEPOINT audit_delete_attempt");

      let deleteError: unknown;

      try {
        await client.query(
          `DELETE FROM audit_logs WHERE id = $1`,
          [auditLogId],
        );
      } catch (error) {
        deleteError = error;
      }

      await client.query("ROLLBACK TO SAVEPOINT audit_delete_attempt");
      await client.query("RELEASE SAVEPOINT audit_delete_attempt");

      expect(deleteError).toBeDefined();
      expect((deleteError as { code?: string }).code).toBe("55000");
      expect(String((deleteError as Error).message)).toContain(
        "Audit logs cannot be updated or deleted",
      );
    });
  });

  it("filters ledger transactions by an inclusive date range", async () => {
    await withTestTransaction(async (client) => {
      const org = await createOrganizationRecords(client, "History Date Filter");

      await createPostedHistoryTransaction(
        client, org.organizationId, org.cashAccountId, org.incomeAccountId,
        "DATE_RANGE_CASE_BEFORE", "2026-01-09T23:59:59Z",
      );
      await createPostedHistoryTransaction(
        client, org.organizationId, org.cashAccountId, org.incomeAccountId,
        "DATE_RANGE_CASE_START", "2026-01-10T00:00:00Z",
      );
      await createPostedHistoryTransaction(
        client, org.organizationId, org.cashAccountId, org.incomeAccountId,
        "DATE_RANGE_CASE_END", "2026-01-12T23:59:59Z",
      );
      await createPostedHistoryTransaction(
        client, org.organizationId, org.cashAccountId, org.incomeAccountId,
        "DATE_RANGE_CASE_AFTER", "2026-01-13T00:00:00Z",
      );

      const result = await listLedgerTransactions(
        org.organizationId,
        1,
        20,
        client,
        {
          from: "2026-01-10",
          to: "2026-01-12",
          search: "DATE_RANGE_CASE",
        },
      );

      expect(result.transactions.map((transaction) => transaction.description))
        .toEqual(["DATE_RANGE_CASE_END", "DATE_RANGE_CASE_START"]);
      expect(result.pagination.total).toBe(2);
    });
  });

  it("filters ledger transactions by description search", async () => {
    await withTestTransaction(async (client) => {
      const org = await createOrganizationRecords(client, "History Search Filter");

      await createPostedHistoryTransaction(
        client, org.organizationId, org.cashAccountId, org.incomeAccountId,
        "UNIQUE_SEARCH_MATCH", "2026-04-01T10:00:00Z",
      );
      await createPostedHistoryTransaction(
        client, org.organizationId, org.cashAccountId, org.incomeAccountId,
        "UNRELATED_DESCRIPTION", "2026-04-02T10:00:00Z",
      );

      const result = await listLedgerTransactions(
        org.organizationId,
        1,
        20,
        client,
        { search: "unique_search_match" },
      );

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]?.description).toBe("UNIQUE_SEARCH_MATCH");
      expect(result.pagination.total).toBe(1);
    });
  });

  it("paginates ledger transactions and returns the matching total", async () => {
    await withTestTransaction(async (client) => {
      const org = await createOrganizationRecords(client, "History Pagination");

      for (let day = 1; day <= 5; day++) {
        await createPostedHistoryTransaction(
          client,
          org.organizationId,
          org.cashAccountId,
          org.incomeAccountId,
          `HISTORY_PAGE_${day}`,
          `2026-02-${String(day).padStart(2, "0")}T10:00:00Z`,
        );
      }

      const result = await listLedgerTransactions(
        org.organizationId,
        2,
        2,
        client,
        { search: "HISTORY_PAGE_" },
      );

      expect(result.transactions).toHaveLength(2);
      expect(result.transactions.map((transaction) => transaction.description))
        .toEqual(["HISTORY_PAGE_3", "HISTORY_PAGE_2"]);
      expect(result.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 5,
        totalPages: 3,
      });
    });
  });

  it("lists only the selected organization's ledger transactions", async () => {
    await withTestTransaction(async (client) => {
      const orgA = await createOrganizationRecords(client, "History Scope A");
      const orgB = await createOrganizationRecords(client, "History Scope B");

      await createPostedHistoryTransaction(
        client, orgA.organizationId, orgA.cashAccountId, orgA.incomeAccountId,
        "ORG_LIST_SCOPE_A", "2026-05-01T10:00:00Z",
      );
      await createPostedHistoryTransaction(
        client, orgB.organizationId, orgB.cashAccountId, orgB.incomeAccountId,
        "ORG_LIST_SCOPE_B", "2026-05-02T10:00:00Z",
      );

      const result = await listLedgerTransactions(
        orgA.organizationId,
        1,
        20,
        client,
        { search: "ORG_LIST_SCOPE_" },
      );

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]?.organization_id).toBe(orgA.organizationId);
      expect(result.transactions[0]?.description).toBe("ORG_LIST_SCOPE_A");
      expect(result.pagination.total).toBe(1);
    });
  });

});
