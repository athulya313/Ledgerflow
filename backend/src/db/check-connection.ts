import { pool } from "./pool.js";

try {
  const result = await pool.query("SELECT NOW()");
  console.log("PostgreSQL connected:", result.rows[0]);
} catch (error) {
  console.error("PostgreSQL connection failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}