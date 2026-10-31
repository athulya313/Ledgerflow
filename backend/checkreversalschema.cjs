require("dotenv").config({ path: ".env.test" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  console.log("DATABASE:", (await pool.query(
    "SELECT current_database()"
  )).rows);

  console.log("COLUMN:", (await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'ledger_transactions'
    AND column_name = 'reverses_transaction_id'
  `)).rows);

  console.log("INDEX:", (await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'ledger_transactions'
    AND indexname = 'ledger_transactions_one_reversal'
  `)).rows);

  console.log("CONSTRAINT:", (await pool.query(`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.ledger_transactions'::regclass
    AND conname = 'ledger_transactions_reversal_fk'
  `)).rows);
}

check()
  .catch(console.error)
  .finally(() => pool.end());
