import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

try {
  const database = await pool.query(
    "SELECT current_database() AS name"
  );

  if (database.rows[0]?.name !== "ledgerflow") {
    throw new Error(
      `Safety check failed: expected ledgerflow, got ${database.rows[0]?.name}`
    );
  }

  await pool.query("BEGIN");

  await pool.query(`
    CREATE OR REPLACE FUNCTION enforce_audit_log_immutability()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION
        'Audit logs cannot be updated or deleted'
        USING ERRCODE = '55000';
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS audit_log_immutability_trigger
    ON public.audit_logs;
  `);

  await pool.query(`
    CREATE TRIGGER audit_log_immutability_trigger
    BEFORE UPDATE OR DELETE
    ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION enforce_audit_log_immutability();
  `);

  await pool.query("COMMIT");
  console.log("Audit-log protection installed in ledgerflow.");
} catch (error) {
  await pool.query("ROLLBACK").catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
