
import { afterAll, describe, expect, it } from "vitest";
import { testPool } from "../src/db/testpool.js";

afterAll(async () => {
  await testPool.end();
});

describe("LedgerFlow test database connection", () => {
  it("connects only to ledgerflow_test", async () => {
    const result = await testPool.query<{
      database_name: string;
    }>("SELECT current_database() AS database_name");

    expect(result.rows[0]?.database_name).toBe("ledgerflow_test");
  });
});
