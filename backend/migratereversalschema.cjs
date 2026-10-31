require("dotenv").config({ path: ".env.test" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  const db = await pool.query("SELECT current_database()");
  if (db.rows[0].current_database !== "ledgerflow_test") {
    throw new Error("Safety check failed. Not the test database.");
  }

  await pool.query("BEGIN");

  try {
    await pool.query(`
      ALTER TABLE public.ledger_transactions
      ADD COLUMN IF NOT EXISTS reverses_transaction_id uuid
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ledger_transactions_one_reversal
      ON public.ledger_transactions (organization_id, reverses_transaction_id)
      WHERE reverses_transaction_id IS NOT NULL
    `);

    await pool.query(`
      ALTER TABLE public.ledger_transactions
      ADD CONSTRAINT ledger_transactions_reversal_fk
      FOREIGN KEY (organization_id, reverses_transaction_id)
      REFERENCES public.ledger_transactions (organization_id, id)
      ON DELETE RESTRICT
    `);

    await pool.query("COMMIT");
    console.log("Reversal schema migration completed successfully.");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

migrate()
  .catch(console.error)
  .finally(() => pool.end());
