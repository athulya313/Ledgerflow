
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool.js";
import { testPool } from "../src/db/testpool.js";
import {
  createLedgerTransaction,
  reverseLedgerTransaction,
} from "../src/modules/ledger/ledgerservices.js";

type TestFixture = {
  organizationId: string;
  userId: string;
  assetAccountId: string;
  incomeAccountId: string;
  expenseAccountId: string;
};

async function createFixture(): Promise<TestFixture> {
  const databaseCheck = await Promise.all([
    testPool.query<{ name: string }>(
      "SELECT current_database() AS name",
    ),
    pool.query<{ name: string }>(
      "SELECT current_database() AS name",
    ),
  ]);

  if (
    databaseCheck[0].rows[0]?.name !== "ledgerflow_test" ||
    databaseCheck[1].rows[0]?.name !== "ledgerflow_test"
  ) {
    throw new Error(
      "Safety check failed: both database pools must use ledgerflow_test.",
    );
  }

  const uniqueId = crypto.randomUUID();

  const userResult = await testPool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      `reversal-test-${uniqueId}@example.com`,
      "integration-test-password-hash",
      "Reversal Integration Test",
    ],
  );

  const organizationResult = await testPool.query<{ id: string }>(
    `INSERT INTO organizations (name)
     VALUES ($1)
     RETURNING id`,
    [`Reversal test organization ${uniqueId}`],
  );

  const organizationId = organizationResult.rows[0]!.id;
  const userId = userResult.rows[0]!.id;

  const assetResult = await testPool.query<{ id: string }>(
    `INSERT INTO accounts (organization_id, name, account_type)
     VALUES ($1, $2, 'asset')
     RETURNING id`,
    [organizationId, `Test cash ${uniqueId}`],
  );

  const incomeResult = await testPool.query<{ id: string }>(
    `INSERT INTO accounts (organization_id, name, account_type)
     VALUES ($1, $2, 'income')
     RETURNING id`,
    [organizationId, `Test income ${uniqueId}`],
  );

  const expenseResult = await testPool.query<{ id: string }>(
    `INSERT INTO accounts (organization_id, name, account_type)
     VALUES ($1, $2, 'expense')
     RETURNING id`,
    [organizationId, `Test expense ${uniqueId}`],
  );

  return {
    organizationId,
    userId,
    assetAccountId: assetResult.rows[0]!.id,
    incomeAccountId: incomeResult.rows[0]!.id,
    expenseAccountId: expenseResult.rows[0]!.id,
  };
}

async function postTransaction(
  fixture: TestFixture,
  description: string,
  entries: {
    accountId: string;
    entryType: "debit" | "credit";
    amountPaise: number;
  }[],
) {
  return createLedgerTransaction(
    fixture.organizationId,
    {
      description,
      entries,
    },
    fixture.userId,
    undefined,
    testPool,
  );
}

async function getAssetBalance(
  organizationId: string,
  assetAccountId: string,
): Promise<string> {
  const result = await testPool.query<{ balance_paise: string }>(
    `SELECT COALESCE(
       SUM(
         CASE
           WHEN le.entry_type = 'debit'
             THEN le.amount_paise
           ELSE -le.amount_paise
         END
       ),
       0
     )::text AS balance_paise
     FROM ledger_entries le
     JOIN ledger_transactions lt
       ON lt.id = le.transaction_id
       AND lt.organization_id = le.organization_id
     WHERE le.organization_id = $1
       AND le.account_id = $2
       AND lt.status = 'posted'`,
    [organizationId, assetAccountId],
  );

  return result.rows[0]!.balance_paise;
}

describe("Reversal asset balance protection integration tests", () => {
  afterAll(async () => {
    await Promise.all([
      testPool.end(),
      pool.end(),
    ]);
  });

  it("rejects reversal when the remaining asset balance is insufficient", async () => {
    const fixture = await createFixture();

    // Original receipt: ₹1,000.
    const original = await postTransaction(
      fixture,
      "Original receipt",
      [
        {
          accountId: fixture.assetAccountId,
          entryType: "debit",
          amountPaise: 100000,
        },
        {
          accountId: fixture.incomeAccountId,
          entryType: "credit",
          amountPaise: 100000,
        },
      ],
    );

    // Spend ₹300, leaving ₹700.
    await postTransaction(
      fixture,
      "Cash expenditure",
      [
        {
          accountId: fixture.expenseAccountId,
          entryType: "debit",
          amountPaise: 30000,
        },
        {
          accountId: fixture.assetAccountId,
          entryType: "credit",
          amountPaise: 30000,
        },
      ],
    );

    expect(
      await getAssetBalance(
        fixture.organizationId,
        fixture.assetAccountId,
      ),
    ).toBe("70000");

    // Reversing ₹1,000 would make the asset balance negative.
    await expect(
      reverseLedgerTransaction(
        fixture.organizationId,
        original.id,
        fixture.userId,
      ),
    ).rejects.toThrow(/Insufficient balance in asset account/);

    // The failed reversal must not change the balance.
    expect(
      await getAssetBalance(
        fixture.organizationId,
        fixture.assetAccountId,
      ),
    ).toBe("70000");
  });

  it("allows reversal when sufficient asset balance remains", async () => {
    const fixture = await createFixture();

    // Original receipt: ₹1,000.
    const original = await postTransaction(
      fixture,
      "Original receipt",
      [
        {
          accountId: fixture.assetAccountId,
          entryType: "debit",
          amountPaise: 100000,
        },
        {
          accountId: fixture.incomeAccountId,
          entryType: "credit",
          amountPaise: 100000,
        },
      ],
    );

    // Additional receipt: ₹500.
    await postTransaction(
      fixture,
      "Additional receipt",
      [
        {
          accountId: fixture.assetAccountId,
          entryType: "debit",
          amountPaise: 50000,
        },
        {
          accountId: fixture.incomeAccountId,
          entryType: "credit",
          amountPaise: 50000,
        },
      ],
    );

    expect(
      await getAssetBalance(
        fixture.organizationId,
        fixture.assetAccountId,
      ),
    ).toBe("150000");

    // Reversing the original ₹1,000 should succeed.
    await reverseLedgerTransaction(
      fixture.organizationId,
      original.id,
      fixture.userId,
    );

    // The reversal should leave ₹500.
    expect(
      await getAssetBalance(
        fixture.organizationId,
        fixture.assetAccountId,
      ),
    ).toBe("50000");

    // Verify that the reversal was actually posted.
    const reversalResult = await testPool.query<{
      id: string;
      status: string;
    }>(
      `SELECT id, status
       FROM ledger_transactions
       WHERE organization_id = $1
         AND reverses_transaction_id = $2`,
      [fixture.organizationId, original.id],
    );

    expect(reversalResult.rows).toHaveLength(1);
    expect(reversalResult.rows[0]!.status).toBe("posted");
  });
  it("rejects an expense that would make the asset balance negative", async () => {
  const fixture = await createFixture();

  // Initial receipt: ₹500.
  await postTransaction(
    fixture,
    "Initial cash receipt",
    [
      {
        accountId: fixture.assetAccountId,
        entryType: "debit",
        amountPaise: 50000,
      },
      {
        accountId: fixture.incomeAccountId,
        entryType: "credit",
        amountPaise: 50000,
      },
    ],
  );

  expect(
    await getAssetBalance(
      fixture.organizationId,
      fixture.assetAccountId,
    ),
  ).toBe("50000");

  // Attempt to spend ₹700 when only ₹500 is available.
  const attemptedDescription = "Oversized expense attempt";

  await expect(
    postTransaction(
      fixture,
      attemptedDescription,
      [
        {
          accountId: fixture.expenseAccountId,
          entryType: "debit",
          amountPaise: 70000,
        },
        {
          accountId: fixture.assetAccountId,
          entryType: "credit",
          amountPaise: 70000,
        },
      ],
    ),
  ).rejects.toThrow(/Insufficient balance in asset account/);

  // The failed transaction must not change the balance.
  expect(
    await getAssetBalance(
      fixture.organizationId,
      fixture.assetAccountId,
    ),
  ).toBe("50000");

  // Verify that no transaction was created, even as a draft.
  const transactionResult = await testPool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM ledger_transactions
     WHERE organization_id = $1
       AND description = $2`,
    [fixture.organizationId, attemptedDescription],
  );

  expect(transactionResult.rows[0]!.count).toBe("0");
});
it("rejects a transfer that exceeds the source asset balance", async () => {
  const fixture = await createFixture();

  // Create a second asset account as the transfer destination.
  const destinationResult = await testPool.query<{ id: string }>(
    `INSERT INTO accounts (organization_id, name, account_type)
     VALUES ($1, $2, 'asset')
     RETURNING id`,
    [fixture.organizationId, "Transfer destination"],
  );

  const destinationAccountId = destinationResult.rows[0]!.id;

  // Fund the source account with ₹500.
  await postTransaction(
    fixture,
    "Initial source funding",
    [
      {
        accountId: fixture.assetAccountId,
        entryType: "debit",
        amountPaise: 50000,
      },
      {
        accountId: fixture.incomeAccountId,
        entryType: "credit",
        amountPaise: 50000,
      },
    ],
  );

  // Verify initial balances.
  expect(
    await getAssetBalance(
      fixture.organizationId,
      fixture.assetAccountId,
    ),
  ).toBe("50000");

  expect(
    await getAssetBalance(
      fixture.organizationId,
      destinationAccountId,
    ),
  ).toBe("0");

  // Attempt to transfer ₹700 from an account holding only ₹500.
  const transferDescription = "Insufficient balance transfer";

  await expect(
    postTransaction(
      fixture,
      transferDescription,
      [
        {
          accountId: destinationAccountId,
          entryType: "debit",
          amountPaise: 70000,
        },
        {
          accountId: fixture.assetAccountId,
          entryType: "credit",
          amountPaise: 70000,
        },
      ],
    ),
  ).rejects.toThrow(/Insufficient balance in asset account/);

  // Neither account should have changed.
  expect(
    await getAssetBalance(
      fixture.organizationId,
      fixture.assetAccountId,
    ),
  ).toBe("50000");

  expect(
    await getAssetBalance(
      fixture.organizationId,
      destinationAccountId,
    ),
  ).toBe("0");

  // No failed transfer transaction should remain.
  const result = await testPool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM ledger_transactions
     WHERE organization_id = $1
       AND description = $2`,
    [fixture.organizationId, transferDescription],
  );

  expect(result.rows[0]!.count).toBe("0");
});
it("prevents concurrent transactions from overspending an asset account", async () => {
  const fixture = await createFixture();

  // Initial balance: ₹1,000.
  await postTransaction(
    fixture,
    "Initial concurrency funding",
    [
      {
        accountId: fixture.assetAccountId,
        entryType: "debit",
        amountPaise: 100000,
      },
      {
        accountId: fixture.incomeAccountId,
        entryType: "credit",
        amountPaise: 100000,
      },
    ],
  );

  // Two requests arrive simultaneously.
  const results = await Promise.allSettled([
    postTransaction(
      fixture,
      "Concurrent expense A",
      [
        {
          accountId: fixture.expenseAccountId,
          entryType: "debit",
          amountPaise: 70000,
        },
        {
          accountId: fixture.assetAccountId,
          entryType: "credit",
          amountPaise: 70000,
        },
      ],
    ),

    postTransaction(
      fixture,
      "Concurrent expense B",
      [
        {
          accountId: fixture.expenseAccountId,
          entryType: "debit",
          amountPaise: 60000,
        },
        {
          accountId: fixture.assetAccountId,
          entryType: "credit",
          amountPaise: 60000,
        },
      ],
    ),
  ]);

  // Exactly one transaction must succeed.
  const successful = results.filter(
    (result) => result.status === "fulfilled",
  );

  const failed = results.filter(
    (result) => result.status === "rejected",
  );

  expect(successful).toHaveLength(1);
  expect(failed).toHaveLength(1);

  // Final balance must be ₹300 or ₹400, never negative.
  const finalBalance = await getAssetBalance(
    fixture.organizationId,
    fixture.assetAccountId,
  );

  expect(["30000", "40000"]).toContain(finalBalance);

  // Exactly one of the two expenses must be posted.
  const postedResult = await testPool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM ledger_transactions
     WHERE organization_id = $1
       AND description IN ($2, $3)
       AND status = 'posted'`,
    [
      fixture.organizationId,
      "Concurrent expense A",
      "Concurrent expense B",
    ],
  );

  expect(postedResult.rows[0]!.count).toBe("1");
});
it("prevents concurrent duplicate reversals of the same transaction", async () => {
  const fixture = await createFixture();

  // Create an original receipt of ₹1,000.
  const original = await postTransaction(
    fixture,
    "Concurrent reversal original receipt",
    [
      {
        accountId: fixture.assetAccountId,
        entryType: "debit",
        amountPaise: 100000,
      },
      {
        accountId: fixture.incomeAccountId,
        entryType: "credit",
        amountPaise: 100000,
      },
    ],
  );

  // Two requests attempt to reverse the same transaction simultaneously.
  const results = await Promise.allSettled([
    reverseLedgerTransaction(
      fixture.organizationId,
      original.id,
      fixture.userId,
    ),
    reverseLedgerTransaction(
      fixture.organizationId,
      original.id,
      fixture.userId,
    ),
  ]);

  const successful = results.filter(
    (result) => result.status === "fulfilled",
  );

  const failed = results.filter(
    (result) => result.status === "rejected",
  );

  // Only one reversal should succeed.
  expect(successful).toHaveLength(1);
  expect(failed).toHaveLength(1);

  // Exactly one reversal record should exist.
  const reversalResult = await testPool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM ledger_transactions
     WHERE organization_id = $1
       AND reverses_transaction_id = $2`,
    [fixture.organizationId, original.id],
  );

  expect(reversalResult.rows[0]!.count).toBe("1");

  // The original ₹1,000 receipt should be fully reversed.
  expect(
    await getAssetBalance(
      fixture.organizationId,
      fixture.assetAccountId,
    ),
  ).toBe("0");
});
});
