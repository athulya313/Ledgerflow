require("dotenv").config({ path: ".env.test" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'ledger_transactions'
  ORDER BY indexname
`)
.then(result => console.table(result.rows))
.catch(console.error)
.finally(() => pool.end());
