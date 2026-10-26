
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
}));

vi.mock("../src/db/pool.js", () => ({
  pool: {
    connect: connectMock,
  },
}));

import { createLedgerTransaction } from "../src/modules/ledger/ledgerservices.js";

describe("createLedgerTransaction validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unbalanced transaction before connecting to the database", async () => {
    const input = {
      description: "Unbalanced transaction",
      entries: [
        {
          accountId: "557c2882-db34-4f79-be16-93a4dd786a3c",
          entryType: "debit",
          amountPaise: 100000,
        },
        {
          accountId: "f129d031-e09c-49c3-8c34-5f4f5cbc3272",
          entryType: "credit",
          amountPaise: 90000,
        },
      ],
    };

    await expect(
      createLedgerTransaction("ac9b9bce-9efd-4a27-b5b3-8851cdd4f339", input),
    ).rejects.toThrow(
      "Ledger transaction must have equal debit and credit totals",
    );

    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rejects a transaction with an invalid account ID", async () => {
    const input = {
      description: "Invalid account",
      entries: [
        {
          accountId: "not-a-uuid",
          entryType: "debit",
          amountPaise: 100000,
        },
        {
          accountId: "f129d031-e09c-49c3-8c34-5f4f5cbc3272",
          entryType: "credit",
          amountPaise: 100000,
        },
      ],
    };

    await expect(
      createLedgerTransaction("ac9b9bce-9efd-4a27-b5b3-8851cdd4f339", input),
    ).rejects.toThrow();

    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rejects a zero or negative amount", async () => {
    const input = {
      description: "Invalid amount",
      entries: [
        {
          accountId: "557c2882-db34-4f79-be16-93a4dd786a3c",
          entryType: "debit",
          amountPaise: 0,
        },
        {
          accountId: "f129d031-e09c-49c3-8c34-5f4f5cbc3272",
          entryType: "credit",
          amountPaise: 0,
        },
      ],
    };

    await expect(
      createLedgerTransaction("ac9b9bce-9efd-4a27-b5b3-8851cdd4f339", input),
    ).rejects.toThrow();

    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rejects a transaction with fewer than two entries", async () => {
    const input = {
      description: "Only one entry",
      entries: [
        {
          accountId: "557c2882-db34-4f79-be16-93a4dd786a3c",
          entryType: "debit",
          amountPaise: 100000,
        },
      ],
    };

    await expect(
      createLedgerTransaction("ac9b9bce-9efd-4a27-b5b3-8851cdd4f339", input),
    ).rejects.toThrow();

    expect(connectMock).not.toHaveBeenCalled();
  });
});
