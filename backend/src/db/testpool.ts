
import pg from "pg";
import { testDatabaseUrl } from "./dbtestconfig.js";

const { Pool } = pg;

export const testPool = new Pool({
  connectionString: testDatabaseUrl,
});
