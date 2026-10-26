
import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { testPool } from "../src/db/testpool.js";

type TestRecords = {
  organizationId: string;
  debitAccountId: string;
  creditAccountId: string;
  transactionId: string;
};

async function createDraftTransaction(
  client: PoolClient,
  balanced: boolean,
): Promise<TestRecords> {
  const organization = await client.query<{ id: string }>(
    `INSERT INTO organizations (name)
     VALUES ($1)
     RETURNING id`,
    [`Ledger integration test ${crypto.randomUUID()}`],
  );

  const organizationId = organization.rows[0]!.id;

  const debitAccount = await client.query<{ id: string }>(
    `INSERT INTO accounts (organization_id, name, account_type)
     VALUES ($1, $2, 'asset')
     RETURNING id`,
    [organizationId, `Test cash ${crypto.randomUUID()}`],
  );

  const creditAccount = await client.query<{ id: string }>(
    `INSERT INTO accounts (organization_id, name, account_type)
     VALUES ($1, $2, 'income')
     RETURNING id`,
    [organizationId, `Test income ${crypto.randomUUID()}`],
  );

  const debitAccountId = debitAccount.rows[0]!.id;
  const creditAccountId = creditAccount.rows[0]!.id;

  const transaction = await client.query<{ id: string }>(
    `INSERT INTO ledger_transactions
       (organization_id, description)
     VALUES ($1, $2)
     RETURNING id`,
    [organizationId, "Integration test transaction"],
  );

  const transactionId = transaction.rows[0]!.id;

  await client.query(
    `INSERT INTO ledger_entries
       (organization_id, transaction_id, account_id, entry_type, amount_paise)
     VALUES
       ($1, $2, $3, 'debit', 10000),
       ($1, $2, $4, 'credit', $5)`,
    [
      organizationId,
      transactionId,
      debitAccountId,
      creditAccountId,
      balanced ? 10000 : 9000,
    ],
  );

  return {
    organizationId,
    debitAccountId,
    creditAccountId,
    transactionId,
  };
}

async function withTestTransaction(
  test: (client: PoolClient) => Promise<void>,
) {
  const client = await testPool.connect();
  let transactionStarted = false;

  try {
    // Verify the destination before performing any writes.
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

describe("PostgreSQL ledger integrity rules", () => {
  afterAll(async () => {
    await testPool.end();
  });

  it("allows a balanced transaction to be posted", async () => {
    await withTestTransaction(async (client) => {
      const records = await createDraftTransaction(client, true);

      const result = await client.query(
        `UPDATE ledger_transactions
         SET status = 'posted', posted_at = NOW()
         WHERE id = $1 AND organization_id = $2
         RETURNING status`,
        [records.transactionId, records.organizationId],
      );

      expect(result.rows[0]?.status).toBe("posted");
    });
  });

  it("rejects an unbalanced transaction from being posted", async () => {
    await withTestTransaction(async (client) => {
      const records = await createDraftTransaction(client, false);

      await expect(
        client.query(
          `UPDATE ledger_transactions
           SET status = 'posted', posted_at = NOW()
           WHERE id = $1 AND organization_id = $2`,
          [records.transactionId, records.organizationId],
        ),
      ).rejects.toThrow();
    });
  });

  it("rejects changes to an already-posted transaction", async () => {
    await withTestTransaction(async (client) => {
      const records = await createDraftTransaction(client, true);

      await client.query(
        `UPDATE ledger_transactions
         SET status = 'posted', posted_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [records.transactionId, records.organizationId],
      );

      await expect(
        client.query(
          `UPDATE ledger_transactions
           SET description = 'Changed after posting'
           WHERE id = $1 AND organization_id = $2`,
          [records.transactionId, records.organizationId],
        ),
      ).rejects.toThrow();
    });
  });

  it("rejects adding entries to an already-posted transaction", async () => {
    await withTestTransaction(async (client) => {
      const records = await createDraftTransaction(client, true);

      await client.query(
        `UPDATE ledger_transactions
         SET status = 'posted', posted_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [records.transactionId, records.organizationId],
      );

      await expect(
        client.query(
          `INSERT INTO ledger_entries
             (organization_id, transaction_id, account_id, entry_type, amount_paise)
           VALUES ($1, $2, $3, 'debit', 1000)`,
          [
            records.organizationId,
            records.transactionId,
            records.debitAccountId,
          ],
        ),
      ).rejects.toThrow();
    });
  });
});

