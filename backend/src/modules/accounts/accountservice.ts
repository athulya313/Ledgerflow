import { pool } from "../../db/pool.js";
import {
  accountIdSchema,
  createAccountSchema,
} from "./accountschemas.js";

export async function createAccountRecord(
  organizationId: string,
  input: unknown,
) {
  const data = createAccountSchema.parse(input);

  const result = await pool.query(
    `INSERT INTO accounts (
       organization_id,
       name,
       account_type
     )
     VALUES ($1, $2, $3)
     RETURNING
       id,
       organization_id,
       name,
       account_type,
       currency,
       status,
       created_at`,
    [organizationId, data.name, data.accountType],
  );

  return result.rows[0];
}

export async function listAccounts(organizationId: string) {
  const result = await pool.query(
    `SELECT
       id,
       organization_id,
       name,
       account_type,
       currency,
       status,
       created_at
     FROM accounts
     WHERE organization_id = $1
     ORDER BY created_at DESC, id DESC`,
    [organizationId],
  );

  return result.rows;
}

export async function findAccountById(
  organizationId: string,
  accountId: string,
) {
  const validAccountId = accountIdSchema.parse(accountId);

  const result = await pool.query(
    `SELECT
       id,
       organization_id,
       name,
       account_type,
       currency,
       status,
       created_at
     FROM accounts
     WHERE organization_id = $1
       AND id = $2`,
    [organizationId, validAccountId],
  );

  return result.rows[0] ?? null;
}