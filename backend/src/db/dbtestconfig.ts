
import dotenv from "dotenv";
import path from "node:path";

const testEnvPath = path.resolve(process.cwd(), ".env.test");

const result = dotenv.config({ path: testEnvPath });

if (result.error) {
  throw new Error(
    "Could not load backend/.env.test. Create the file before running integration tests.",
  );
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing from .env.test.");
}

const parsedUrl = new URL(databaseUrl);

if (parsedUrl.pathname.replace("/", "") !== "ledgerflow_test") {
  throw new Error(
    "Safety check failed: integration tests may only use ledgerflow_test.",
  );
}

export const testDatabaseUrl = databaseUrl;
