
import { pool } from "../../db/pool.js";
import type { Pool, PoolClient } from "pg";
import { createLedgerTransactionSchema } from "./ledgerschemas.js";
import { AppError } from "../../middleware/apperror.js";
import { createHash } from "node:crypto";

type LedgerQuery = Pick<Pool | PoolClient, "query">;



export async function createLedgerTransaction(
  organizationId: string,
  input: unknown,
  actorUserId: string,
  idempotencyKey?: string,
  dbPool: Pool = pool,
) {
  const data = createLedgerTransactionSchema.parse(input);

  // Validate the optional idempotency key.
  if (
    idempotencyKey !== undefined &&
    (idempotencyKey.trim().length === 0 || idempotencyKey.length > 255)
  ) {
    throw new AppError(
      400,
      "Idempotency-Key must contain 1 to 255 characters",
    );
  }

  // Generate request hash for idempotency.
  const requestHash = createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");

  // Validate double-entry totals.
  const debitTotal = data.entries
    .filter((entry) => entry.entryType === "debit")
    .reduce((total, entry) => total + BigInt(entry.amountPaise), 0n);

  const creditTotal = data.entries
    .filter((entry) => entry.entryType === "credit")
    .reduce((total, entry) => total + BigInt(entry.amountPaise), 0n);

  if (
    debitTotal === 0n ||
    creditTotal === 0n ||
    debitTotal !== creditTotal
  ) {
    throw new AppError(
      400,
      "Ledger transaction must have equal debit and credit totals",
    );
  }

  const client = await dbPool.connect();

  try {
    await client.query("BEGIN");

    // Create the transaction.
    const transactionResult = await client.query(
      `INSERT INTO ledger_transactions (
         organization_id,
         description,
         reference,
         status,
         created_by,
         idempotency_key,
         request_hash
       )
       VALUES ($1, $2, $3, 'draft', $4, $5, $6)
       ON CONFLICT (organization_id, idempotency_key)
         WHERE idempotency_key IS NOT NULL
       DO NOTHING
       RETURNING
         id,
         organization_id,
         description,
         reference,
         status,
         created_at`,
      [
        organizationId,
        data.description,
        data.reference ?? null,
        actorUserId,
        idempotencyKey ?? null,
        idempotencyKey === undefined ? null : requestHash,
      ],
    );

    // Handle an existing idempotency key.
    if (transactionResult.rows.length === 0) {
      const existingResult = await client.query(
        `SELECT id, request_hash
         FROM ledger_transactions
         WHERE organization_id = $1
           AND idempotency_key = $2`,
        [organizationId, idempotencyKey],
      );

      const existing = existingResult.rows[0];

      if (!existing) {
        throw new AppError(
          409,
          "Unable to resolve the existing idempotent request",
        );
      }

      if (existing.request_hash !== requestHash) {
        throw new AppError(
          409,
          "This Idempotency-Key was already used with different transaction data",
        );
      }

      const existingTransaction = await getLedgerTransaction(
        organizationId,
        existing.id,
        client,
      );

      if (!existingTransaction) {
        throw new AppError(
          409,
          "The original transaction could not be retrieved",
        );
      }

      await client.query("COMMIT");

      return {
        ...existingTransaction,
        idempotencyReplayed: true,
      };
    }

    const transaction = transactionResult.rows[0];

    // Collect unique account IDs.
    const accountIds = [
      ...new Set(data.entries.map((entry) => entry.accountId)),
    ];

    // Lock affected accounts in a consistent order.
    // This prevents concurrent transactions from spending
    // the same available balance.
    const accountResult = await client.query(
      `SELECT id, name, account_type
       FROM accounts
       WHERE organization_id = $1
         AND id = ANY($2::uuid[])
         AND status = 'active'
       ORDER BY id
       FOR UPDATE`,
      [organizationId, accountIds],
    );

    if (accountResult.rows.length !== accountIds.length) {
      throw new AppError(
        400,
        "One or more accounts do not exist, are inactive, or are inaccessible",
      );
    }

    // Retrieve current posted balances for affected accounts.
    // Debit increases an asset balance; credit decreases it.
    const balanceResult = await client.query(
      `SELECT
         le.account_id,
         SUM(
           CASE
             WHEN le.entry_type = 'debit'
               THEN le.amount_paise
             ELSE -le.amount_paise
           END
         )::text AS balance_paise
       FROM ledger_entries le
       JOIN ledger_transactions lt
         ON lt.id = le.transaction_id
         AND lt.organization_id = le.organization_id
       WHERE le.organization_id = $1
         AND le.account_id = ANY($2::uuid[])
         AND lt.status = 'posted'
       GROUP BY le.account_id`,
      [organizationId, accountIds],
    );

    const currentBalances = new Map<string, bigint>();

    for (const row of balanceResult.rows) {
      currentBalances.set(
        row.account_id,
        BigInt(row.balance_paise),
      );
    }

    // Calculate the proposed balance changes.
    const proposedChanges = new Map<string, bigint>();

    for (const entry of data.entries) {
      const amount = BigInt(entry.amountPaise);

      const change =
        entry.entryType === "debit"
          ? amount
          : -amount;

      proposedChanges.set(
        entry.accountId,
        (proposedChanges.get(entry.accountId) ?? 0n) + change,
      );
    }

    // Format paise without losing BigInt precision.
    const formatPaise = (amount: bigint) => {
      const sign = amount < 0n ? "-" : "";
      const absolute = amount < 0n ? -amount : amount;

      return `${sign}${absolute / 100n}.${(absolute % 100n)
        .toString()
        .padStart(2, "0")}`;
    };

    // Prevent asset accounts from going below zero.
    for (const account of accountResult.rows) {
      if (account.account_type !== "asset") {
        continue;
      }

      const currentBalance =
        currentBalances.get(account.id) ?? 0n;

      const proposedChange =
        proposedChanges.get(account.id) ?? 0n;

      const resultingBalance =
        currentBalance + proposedChange;

      if (resultingBalance < 0n) {
        throw new AppError(
          400,
          `Insufficient balance in asset account "${account.name}". Available balance: ₹${formatPaise(currentBalance)}`,
        );
      }
    }

    // Insert debit and credit entries.
    for (const entry of data.entries) {
      await client.query(
        `INSERT INTO ledger_entries (
           organization_id,
           transaction_id,
           account_id,
           entry_type,
           amount_paise
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [
          organizationId,
          transaction.id,
          entry.accountId,
          entry.entryType,
          entry.amountPaise,
        ],
      );
    }

    // Post the transaction.
    const postedResult = await client.query(
      `UPDATE ledger_transactions
       SET status = 'posted',
           posted_at = NOW()
       WHERE id = $1
         AND organization_id = $2
       RETURNING
         id,
         organization_id,
         description,
         status,
         created_at,
         posted_at`,
      [transaction.id, organizationId],
    );

    if (postedResult.rows.length === 0) {
      throw new AppError(
        409,
        "Unable to post ledger transaction",
      );
    }

    // Retrieve posted entries.
    const entriesResult = await client.query(
      `SELECT
         id,
         account_id,
         entry_type,
         amount_paise,
         created_at
       FROM ledger_entries
       WHERE organization_id = $1
         AND transaction_id = $2
       ORDER BY created_at, id`,
      [organizationId, transaction.id],
    );

    // Record audit log.
    await client.query(
      `INSERT INTO audit_logs (
         organization_id,
         actor_user_id,
         action,
         resource_type,
         resource_id,
         metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        organizationId,
        actorUserId,
        "LEDGER_TRANSACTION_POSTED",
        "ledger_transaction",
        transaction.id,
        JSON.stringify({
          description: data.description,
          entryCount: data.entries.length,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      ...postedResult.rows[0],
      entries: entriesResult.rows,
      idempotencyReplayed: false,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Failed to roll back ledger transaction:",
        rollbackError,
      );
    }

    throw error;
  } finally {
    client.release();
  }
}



export async function listLedgerTransactions(
  organizationId: string,
  page: number,
  limit: number,
  db: LedgerQuery = pool,
  filters: {
    from?: string;
    to?: string;
    search?: string;
  } = {},
) {
  const offset = (page - 1) * limit;
  const values: unknown[] = [organizationId];
  const conditions = [
    "organization_id = $1",
    "status = 'posted'",
  ];

  if (filters.from) {
    values.push(filters.from);
        conditions.push(
  `posted_at >= ($${values.length}::date::timestamp AT TIME ZONE 'UTC')`,
);
  }

  if (filters.to) {
    values.push(filters.to);
   
      conditions.push(
  `posted_at < (($${values.length}::date + INTERVAL '1 day') AT TIME ZONE 'UTC')`,
);
    
  }

  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`description ILIKE $${values.length}`);
  }

  const whereClause = conditions.join(" AND ");

  const dataValues = [...values, limit, offset];

  const result = await db.query(
    `SELECT
       id,
       organization_id,
       description,
       reference,
       status,
       created_by,
       created_at,
       posted_at,
       COALESCE(
         (
           SELECT SUM(le.amount_paise)::text
           FROM ledger_entries le
           WHERE le.organization_id = ledger_transactions.organization_id
             AND le.transaction_id = ledger_transactions.id
             AND le.entry_type = 'debit'
         ),
         '0'
       ) AS amount_paise
     FROM ledger_transactions
     WHERE ${whereClause}
     ORDER BY posted_at DESC, id DESC
     LIMIT $${values.length + 1}
     OFFSET $${values.length + 2}`,
    dataValues,
  );

  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM ledger_transactions
     WHERE ${whereClause}`,
    values,
  );

  const total = countResult.rows[0].total as number;

  return {
    transactions: result.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}


export async function getLedgerTransaction(
  organizationId: string,
  transactionId: string,
  db: LedgerQuery = pool,
) {
  const transactionResult = await db.query(
    `SELECT
       id,
       organization_id,
       description,
       reference,
       status,
       created_by,
       created_at,
       posted_at
     FROM ledger_transactions
     WHERE organization_id = $1
       AND id = $2
       AND status = 'posted'`,
    [organizationId, transactionId],
  );

  if (transactionResult.rows.length === 0) {
    return null;
  }

  const entriesResult = await db.query(
    `SELECT
       id,
       account_id,
       entry_type,
       amount_paise,
       created_at
     FROM ledger_entries
     WHERE organization_id = $1
       AND transaction_id = $2
     ORDER BY created_at, id`,
    [organizationId, transactionId],
  );

  return {
    ...transactionResult.rows[0],
    entries: entriesResult.rows,
  };
}

export async function getAccountBalances(
  organizationId: string,
  db: LedgerQuery = pool,
) {
  const result = await db.query(
    `SELECT
       a.id AS account_id,
       a.name AS account_name,
       a.account_type,
       a.currency,
       COALESCE(
         SUM(le.amount_paise)
           FILTER (WHERE le.entry_type = 'debit'),
         0
       )::text AS total_debits_paise,
       COALESCE(
         SUM(le.amount_paise)
           FILTER (WHERE le.entry_type = 'credit'),
         0
       )::text AS total_credits_paise,
       (
         COALESCE(
           SUM(le.amount_paise)
             FILTER (WHERE le.entry_type = 'debit'),
           0
         )
         -
         COALESCE(
           SUM(le.amount_paise)
             FILTER (WHERE le.entry_type = 'credit'),
           0
         )
       )::text AS net_debit_paise,
       CASE
         WHEN a.account_type IN ('asset', 'expense') THEN
           COALESCE(
             SUM(le.amount_paise)
               FILTER (WHERE le.entry_type = 'debit'),
             0
           )
           -
           COALESCE(
             SUM(le.amount_paise)
               FILTER (WHERE le.entry_type = 'credit'),
             0
           )
         ELSE
           COALESCE(
             SUM(le.amount_paise)
               FILTER (WHERE le.entry_type = 'credit'),
             0
           )
           -
           COALESCE(
             SUM(le.amount_paise)
               FILTER (WHERE le.entry_type = 'debit'),
             0
           )
       END::text AS balance_paise
     FROM accounts a
     LEFT JOIN ledger_entries le
       ON le.account_id = a.id
       AND le.organization_id = a.organization_id
       AND EXISTS (
         SELECT 1
         FROM ledger_transactions lt
         WHERE lt.id = le.transaction_id
           AND lt.organization_id = le.organization_id
           AND lt.status = 'posted'
       )
     WHERE a.organization_id = $1
     GROUP BY a.id, a.name, a.account_type, a.currency
     ORDER BY a.name ASC`,
    [organizationId],
  );

  return result.rows;
}

export async function getTrialBalance(
  organizationId: string,
  db: LedgerQuery = pool,
) {
  const accounts = await getAccountBalances(organizationId, db);

  let totalDebits = 0n;
  let totalCredits = 0n;

  const trialBalanceAccounts = accounts.map((account) => {
    const balance = BigInt(account.balance_paise);

    const normalDebitAccount =
      account.account_type === "asset" ||
      account.account_type === "expense";

    let debitBalance = 0n;
    let creditBalance = 0n;

    if (normalDebitAccount) {
      if (balance >= 0n) {
        debitBalance = balance;
      } else {
        creditBalance = -balance;
      }
    } else {
      if (balance >= 0n) {
        creditBalance = balance;
      } else {
        debitBalance = -balance;
      }
    }

    totalDebits += debitBalance;
    totalCredits += creditBalance;

    return {
      accountId: account.account_id,
      accountName: account.account_name,
      accountType: account.account_type,
      debitBalancePaise: debitBalance.toString(),
      creditBalancePaise: creditBalance.toString(),
    };
  });

  return {
    organizationId,
    accounts: trialBalanceAccounts,
    totalDebitsPaise: totalDebits.toString(),
    totalCreditsPaise: totalCredits.toString(),
    isBalanced: totalDebits === totalCredits,
  };
}

export async function getMonthlyCashFlow(
  organizationId: string,
  db: LedgerQuery = pool,
) {
  const result = await db.query(
    `WITH months AS (
       SELECT generate_series(
         date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
         date_trunc('month', CURRENT_DATE),
         INTERVAL '1 month'
       )::date AS month_start
     ),
     monthly_totals AS (
       SELECT
         date_trunc('month', lt.posted_at)::date AS month_start,
         SUM(
           CASE
             WHEN a.account_type = 'income'
               AND le.entry_type = 'credit'
               THEN le.amount_paise
             WHEN a.account_type = 'income'
               AND le.entry_type = 'debit'
               THEN -le.amount_paise
             ELSE 0
           END
         ) AS income_paise,
         SUM(
           CASE
             WHEN a.account_type = 'expense'
               AND le.entry_type = 'debit'
               THEN le.amount_paise
             WHEN a.account_type = 'expense'
               AND le.entry_type = 'credit'
               THEN -le.amount_paise
             ELSE 0
           END
         ) AS expenses_paise
       FROM ledger_entries le
       JOIN ledger_transactions lt
         ON lt.id = le.transaction_id
         AND lt.organization_id = le.organization_id
       JOIN accounts a
         ON a.id = le.account_id
         AND a.organization_id = le.organization_id
       WHERE le.organization_id = $1
         AND lt.status = 'posted'
         AND lt.posted_at >=
           date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
         AND lt.posted_at <
           date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
         AND a.account_type IN ('income', 'expense')
       GROUP BY date_trunc('month', lt.posted_at)::date
     )
     SELECT
       to_char(m.month_start, 'YYYY-MM') AS month,
       COALESCE(mt.income_paise, 0)::text AS income_paise,
       COALESCE(mt.expenses_paise, 0)::text AS expenses_paise
     FROM months m
     LEFT JOIN monthly_totals mt
       ON mt.month_start = m.month_start
     ORDER BY m.month_start ASC`,
    [organizationId],
  );

  return result.rows;
}


export async function reverseLedgerTransaction(
  organizationId: string,
  transactionId: string,
  actorUserId: string,
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the original transaction to prevent concurrent reversals.
    const originalResult = await client.query(
      `SELECT id, description, status, reverses_transaction_id
       FROM ledger_transactions
       WHERE organization_id = $1
         AND id = $2
       FOR UPDATE`,
      [organizationId, transactionId],
    );

    const original = originalResult.rows[0];

    if (!original) {
      throw new AppError(404, "Ledger transaction not found");
    }

    if (original.status !== "posted") {
      throw new AppError(
        400,
        "Only posted transactions can be reversed",
      );
    }

    if (original.reverses_transaction_id) {
      throw new AppError(
        400,
        "A reversal transaction cannot itself be reversed",
      );
    }

    const existingReversal = await client.query(
      `SELECT id
       FROM ledger_transactions
       WHERE organization_id = $1
         AND reverses_transaction_id = $2`,
      [organizationId, transactionId],
    );

    if (existingReversal.rows.length > 0) {
      throw new AppError(
        409,
        "This transaction has already been reversed",
      );
    }

    const entriesResult = await client.query(
      `SELECT account_id, entry_type, amount_paise
       FROM ledger_entries
       WHERE organization_id = $1
         AND transaction_id = $2
       ORDER BY id`,
      [organizationId, transactionId],
    );

    if (entriesResult.rows.length < 2) {
      throw new AppError(
        400,
        "The original transaction has no valid ledger entries to reverse",
      );
    }
    
    // Collect unique account IDs affected by the reversal.
    const accountIds = [
      ...new Set(
        entriesResult.rows.map((entry) => entry.account_id),
      ),
    ];

    // Lock affected accounts in a consistent order.
    const accountResult = await client.query(
      `SELECT id, name, account_type
       FROM accounts
       WHERE organization_id = $1
         AND id = ANY($2::uuid[])
         AND status = 'active'
       ORDER BY id
       FOR UPDATE`,
      [organizationId, accountIds],
    );

    if (accountResult.rows.length !== accountIds.length) {
      throw new AppError(
        400,
        "One or more accounts do not exist, are inactive, or are inaccessible",
      );
    }

    // Retrieve current posted balances.
    const balanceResult = await client.query(
      `SELECT
         le.account_id,
         SUM(
           CASE
             WHEN le.entry_type = 'debit'
               THEN le.amount_paise
             ELSE -le.amount_paise
           END
         )::text AS balance_paise
       FROM ledger_entries le
       JOIN ledger_transactions lt
         ON lt.id = le.transaction_id
         AND lt.organization_id = le.organization_id
       WHERE le.organization_id = $1
         AND le.account_id = ANY($2::uuid[])
         AND lt.status = 'posted'
       GROUP BY le.account_id`,
      [organizationId, accountIds],
    );

    const currentBalances = new Map<string, bigint>();

    for (const row of balanceResult.rows) {
      currentBalances.set(
        row.account_id,
        BigInt(row.balance_paise),
      );
    }

    // Calculate the balance impact of reversing each entry.
    const proposedChanges = new Map<string, bigint>();

    for (const entry of entriesResult.rows) {
      const amount = BigInt(entry.amount_paise);

      // Reversal swaps debit and credit.
      const change =
        entry.entry_type === "debit"
          ? -amount
          : amount;

      proposedChanges.set(
        entry.account_id,
        (proposedChanges.get(entry.account_id) ?? 0n) + change,
      );
    }

    // Prevent reversal from making an asset account negative.
    for (const account of accountResult.rows) {
      if (account.account_type !== "asset") {
        continue;
      }

      const currentBalance =
        currentBalances.get(account.id) ?? 0n;

      const proposedChange =
        proposedChanges.get(account.id) ?? 0n;

      if (currentBalance + proposedChange < 0n) {
        const absolute = currentBalance < 0n
          ? -currentBalance
          : currentBalance;

        const availableBalance =
          `${absolute / 100n}.${(absolute % 100n)
            .toString()
            .padStart(2, "0")}`;

        throw new AppError(
          400,
          `Cannot reverse transaction. Insufficient balance in asset account "${account.name}". Available balance: ₹${availableBalance}`,
        );
      }
    }


    const reversalResult = await client.query(
      `INSERT INTO ledger_transactions (
         organization_id,
         description,
         status,
         created_by,
         reverses_transaction_id
       )
       VALUES ($1, $2, 'draft', $3, $4)
       RETURNING id, organization_id, description, status, created_at`,
      [
        organizationId,
        `Reversal: ${original.description}`,
        actorUserId,
        transactionId,
      ],
    );

    const reversal = reversalResult.rows[0];

    for (const entry of entriesResult.rows) {
      const oppositeType =
        entry.entry_type === "debit" ? "credit" : "debit";

      await client.query(
        `INSERT INTO ledger_entries (
           organization_id,
           transaction_id,
           account_id,
           entry_type,
           amount_paise
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [
          organizationId,
          reversal.id,
          entry.account_id,
          oppositeType,
          entry.amount_paise,
        ],
      );
    }

    const postedResult = await client.query(
      `UPDATE ledger_transactions
       SET status = 'posted', posted_at = NOW()
       WHERE organization_id = $1
         AND id = $2
       RETURNING id, organization_id, description, status, created_at, posted_at`,
      [organizationId, reversal.id],
    );

    const reversalEntriesResult = await client.query(
      `SELECT id, account_id, entry_type, amount_paise, created_at
       FROM ledger_entries
       WHERE organization_id = $1
         AND transaction_id = $2
       ORDER BY created_at, id`,
      [organizationId, reversal.id],
    );

    await client.query(
      `INSERT INTO audit_logs (
         organization_id,
         actor_user_id,
         action,
         resource_type,
         resource_id,
         metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        organizationId,
        actorUserId,
        "LEDGER_TRANSACTION_REVERSED",
        "ledger_transaction",
        reversal.id,
        JSON.stringify({
          originalTransactionId: transactionId,
          reversalTransactionId: reversal.id,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      ...postedResult.rows[0],
      entries: reversalEntriesResult.rows,
      reversesTransactionId: transactionId,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Failed to roll back reversal:", rollbackError);
    }

    throw error;
  } finally {
    client.release();
  }
}
