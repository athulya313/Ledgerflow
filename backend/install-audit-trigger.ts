import { testPool } from "./src/db/testpool.js";

try {
  await testPool.query("BEGIN");

  await testPool.query(`
    CREATE OR REPLACE FUNCTION enforce_audit_log_immutability()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION
        'Audit logs cannot be updated or deleted'
        USING ERRCODE = '55000';
    END;
    $$ LANGUAGE plpgsql;
  `);

  await testPool.query(`
    DROP TRIGGER IF EXISTS audit_log_immutability_trigger
    ON public.audit_logs;
  `);

  await testPool.query(`
    CREATE TRIGGER audit_log_immutability_trigger
    BEFORE UPDATE OR DELETE
    ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION enforce_audit_log_immutability();
  `);

  await testPool.query("COMMIT");
  console.log("Audit-log immutability trigger installed in ledgerflow_test.");
} catch (error) {
  await testPool.query("ROLLBACK").catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await testPool.end();
}
