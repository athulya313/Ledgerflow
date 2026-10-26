
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../../db/pool.js";
import { AppError } from "../../middleware/apperror.js";
import {
  reconciliationUploadSchema,
  reconciliationCsvRowSchema,
} from "./reconciliationschemas.js";

const MAX_CSV_ROWS = 10_000;
const MAX_AMOUNT_PAISE = 9_223_372_036_854_775_807n;

function parseDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, "Dates must use YYYY-MM-DD format");
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new AppError(400, `Invalid transaction date: ${value}`);
  }

  return value;
}

function parseAmountToPaise(value: string): string {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new AppError(
      400,
      `Invalid amount "${value}". Use a decimal amount with at most two decimal places.`,
    );
  }

  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");

  let paise =
    BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));

  if (negative) {
    paise = -paise;
  }

  if (
    paise === 0n ||
    paise > MAX_AMOUNT_PAISE ||
    paise < -MAX_AMOUNT_PAISE
  ) {
    throw new AppError(400, "Amount is zero or outside the supported range");
  }

  return paise.toString();
}

export async function importBankStatement(
  organizationId: string,
  actorUserId: string,
  input: unknown,
  csvContent: string,
) {
  const upload = reconciliationUploadSchema.parse(input);

  if (!csvContent.trim()) {
    throw new AppError(400, "The uploaded CSV file is empty");
  }

  let parsedRows: unknown[];

  try {
    parsedRows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
      relax_column_count: false,
    }) as unknown[];
  } catch {
    throw new AppError(400, "The CSV file could not be parsed");
  }

  if (parsedRows.length === 0) {
    throw new AppError(400, "The CSV file contains no transaction rows");
  }

  if (parsedRows.length > MAX_CSV_ROWS) {
    throw new AppError(
      400,
      `A maximum of ${MAX_CSV_ROWS} CSV rows is allowed`,
    );
  }

  const rows = parsedRows.map((raw, index) => {
    const result = reconciliationCsvRowSchema.safeParse(raw);

    if (!result.success) {
      throw new AppError(
        400,
        `Invalid CSV data on row ${index + 2}`,
      );
    }

    const row = result.data;

    return {
      rowNumber: index + 2,
      transactionDate: parseDate(row.transaction_date),
      description: row.description,
      reference: row.reference?.trim() || null,
      amountPaise: parseAmountToPaise(row.amount),
    };
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const accountResult = await client.query(
      `SELECT id, account_type
       FROM accounts
       WHERE organization_id = $1
         AND id = $2
         AND status = 'active'
       FOR SHARE`,
      [organizationId, upload.accountId],
    );

    if (accountResult.rows.length === 0) {
      throw new AppError(
        400,
        "The selected account does not exist, is inactive, or is inaccessible",
      );
    }

    const account = accountResult.rows[0];

    if (account.account_type !== "asset") {
      throw new AppError(
        400,
        "Bank reconciliation requires an asset account",
      );
    }

    const reconciliationResult = await client.query(
      `INSERT INTO reconciliations (
         organization_id,
         account_id,
         statement_name,
         status,
         total_rows,
         created_by
       )
       VALUES ($1, $2, $3, 'pending', $4, $5)
       RETURNING *`,
      [
        organizationId,
        upload.accountId,
        upload.statementName,
        rows.length,
        actorUserId,
      ],
    );

    const reconciliation = reconciliationResult.rows[0];
    const usedTransactionIds: string[] = [];
    const items: unknown[] = [];

    let matchedCount = 0;

    for (const row of rows) {
      // Convention: positive bank amounts are deposits;
      // negative amounts are withdrawals.
      // For an asset account, these correspond to ledger
      // debits and credits respectively.
      const candidates = await client.query(
        `SELECT DISTINCT
           lt.id,
           lt.reference
         FROM ledger_entries le
         JOIN ledger_transactions lt
           ON lt.id = le.transaction_id
          AND lt.organization_id = le.organization_id
         WHERE le.organization_id = $1
           AND le.account_id = $2
           AND lt.status = 'posted'
           AND lt.posted_at::date = $3::date
           AND (
             CASE
               WHEN le.entry_type = 'debit'
                 THEN le.amount_paise
               ELSE -le.amount_paise
             END
           ) = $4::bigint
           AND (
             $5::text IS NULL
             OR lt.reference = $5
           )
           AND NOT (lt.id = ANY($6::uuid[]))
         LIMIT 2`,
        [
          organizationId,
          upload.accountId,
          row.transactionDate,
          row.amountPaise,
          row.reference,
          usedTransactionIds,
        ],
      );

      // Only an unambiguous match is accepted.
      const matched =
        candidates.rows.length === 1 ? candidates.rows[0] : null;

      if (matched) {
        usedTransactionIds.push(matched.id);
        matchedCount++;
      }

      const itemResult = await client.query(
        `INSERT INTO reconciliation_items (
           organization_id,
           reconciliation_id,
           row_number,
           transaction_date,
           description,
           reference,
           amount_paise,
           status,
           ledger_transaction_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          organizationId,
          reconciliation.id,
          row.rowNumber,
          row.transactionDate,
          row.description,
          row.reference,
          row.amountPaise,
          matched ? "matched" : "unmatched",
          matched?.id ?? null,
        ],
      );

      items.push(itemResult.rows[0]);
    }

    const unmatchedCount = rows.length - matchedCount;

    const updatedResult = await client.query(
      `UPDATE reconciliations
       SET status = 'completed',
           matched_rows = $3,
           unmatched_rows = $4,
           completed_at = NOW()
       WHERE organization_id = $1
         AND id = $2
       RETURNING *`,
      [
        organizationId,
        reconciliation.id,
        matchedCount,
        unmatchedCount,
      ],
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
        "BANK_STATEMENT_IMPORTED",
        "reconciliation",
        reconciliation.id,
        JSON.stringify({
          accountId: upload.accountId,
          totalRows: rows.length,
          matchedRows: matchedCount,
          unmatchedRows: unmatchedCount,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      reconciliation: updatedResult.rows[0],
      items,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Failed to roll back reconciliation import:",
        rollbackError,
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function listReconciliations(
  organizationId: string,
  page: number,
  limit: number,
) {
  const offset = (page - 1) * limit;

  const result = await pool.query(
    `SELECT
       r.id,
       r.account_id,
       a.name AS account_name,
       r.statement_name,
       r.status,
       r.total_rows,
       r.matched_rows,
       r.unmatched_rows,
       r.created_at,
       r.completed_at
     FROM reconciliations r
     JOIN accounts a
       ON a.organization_id = r.organization_id
      AND a.id = r.account_id
     WHERE r.organization_id = $1
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $2 OFFSET $3`,
    [organizationId, limit, offset],
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM reconciliations
     WHERE organization_id = $1`,
    [organizationId],
  );

  return {
    items: result.rows,
    pagination: {
      page,
      limit,
      total: countResult.rows[0].total as number,
      totalPages: Math.ceil(
        (countResult.rows[0].total as number) / limit,
      ),
    },
  };
}

export async function getReconciliationDetails(
  organizationId: string,
  reconciliationId: string,
  page: number,
  limit: number,
  status?: "matched" | "unmatched",
) {
  const offset = (page - 1) * limit;

  const reconciliationResult = await pool.query(
    `SELECT
       r.id,
       r.account_id,
       a.name AS account_name,
       r.statement_name,
       r.status,
       r.total_rows,
       r.matched_rows,
       r.unmatched_rows,
       r.created_at,
       r.completed_at
     FROM reconciliations r
     JOIN accounts a
       ON a.organization_id = r.organization_id
      AND a.id = r.account_id
     WHERE r.organization_id = $1
       AND r.id = $2`,
    [organizationId, reconciliationId],
  );

  if (reconciliationResult.rowCount === 0) {
    return null;
  }

  const values: unknown[] = [organizationId, reconciliationId];
  let statusFilter = "";

  if (status) {
    values.push(status);
    statusFilter = ` AND ri.status = $${values.length}`;
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM reconciliation_items ri
     WHERE ri.organization_id = $1
       AND ri.reconciliation_id = $2
       ${statusFilter}`,
    values,
  );

  values.push(limit, offset);

  const itemsResult = await pool.query(
    `SELECT
       ri.id,
       ri.row_number,
       ri.transaction_date,
       ri.description,
       ri.reference,
       ri.amount_paise::text AS amount_paise,
       ri.status,
       ri.ledger_transaction_id,
       ri.created_at
     FROM reconciliation_items ri
     WHERE ri.organization_id = $1
       AND ri.reconciliation_id = $2
       ${statusFilter}
     ORDER BY ri.row_number ASC
     LIMIT $${values.length - 1}
     OFFSET $${values.length}`,
    values,
  );

  const total = countResult.rows[0].total as number;

  return {
    reconciliation: reconciliationResult.rows[0],
    items: itemsResult.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

