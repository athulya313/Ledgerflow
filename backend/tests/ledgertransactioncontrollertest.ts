
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { listLedgerTransactionsMock } = vi.hoisted(() => ({
  listLedgerTransactionsMock: vi.fn(),
}));

vi.mock("../src/modules/ledger/ledgerservices.js", () => ({
  createLedgerTransaction: vi.fn(),
  listLedgerTransactions: listLedgerTransactionsMock,
  getLedgerTransaction: vi.fn(),
  getAccountBalances: vi.fn(),
  getTrialBalance: vi.fn(),
}));

import { listLedgerTransactionsController } from "../src/modules/ledger/ledgercontoller.js";

function createRequest(query: Record<string, unknown> = {}) {
  return {
    params: { organizationId: "company-a" },
    query,
  } as unknown as Request;
}

function createResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  return res;
}

describe("listLedgerTransactionsController filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an invalid date format", async () => {
    const req = createRequest({ from: "hello" });
    const res = createResponse();

    await listLedgerTransactionsController(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "from and to must be valid dates in YYYY-MM-DD format",
    });
    expect(listLedgerTransactionsMock).not.toHaveBeenCalled();
  });

  it("rejects an impossible calendar date", async () => {
    const req = createRequest({ from: "2026-02-30" });
    const res = createResponse();

    await listLedgerTransactionsController(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(listLedgerTransactionsMock).not.toHaveBeenCalled();
  });

  it("rejects a date range where from is after to", async () => {
    const req = createRequest({
      from: "2026-02-20",
      to: "2026-02-10",
    });
    const res = createResponse();

    await listLedgerTransactionsController(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "from must be earlier than or equal to to",
    });
    expect(listLedgerTransactionsMock).not.toHaveBeenCalled();
  });

  it("passes valid date and search filters to the service", async () => {
    const result = {
      transactions: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    };

    listLedgerTransactionsMock.mockResolvedValue(result);

    const req = createRequest({
      from: "2026-02-01",
      to: "2026-02-28",
      search: "rent",
    });
    const res = createResponse();

    await listLedgerTransactionsController(req, res as unknown as Response);

    expect(listLedgerTransactionsMock).toHaveBeenCalledWith(
      "company-a",
      1,
      20,
      undefined,
      {
        from: "2026-02-01",
        to: "2026-02-28",
        search: "rent",
      },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it.each([
    { query: { page: "0" }, description: "page zero" },
    { query: { page: "-1" }, description: "negative page" },
    { query: { page: "1.5" }, description: "fractional page" },
    { query: { page: "abc" }, description: "non-numeric page" },
    { query: { limit: "0" }, description: "limit zero" },
    { query: { limit: "101" }, description: "limit over 100" },
    { query: { limit: "1.5" }, description: "fractional limit" },
    { query: { limit: "abc" }, description: "non-numeric limit" },
  ])("rejects invalid pagination: $description", async ({ query }) => {
    const req = createRequest(query);
    const res = createResponse();

    await listLedgerTransactionsController(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "page must be positive; limit must be between 1 and 100",
    });
    expect(listLedgerTransactionsMock).not.toHaveBeenCalled();
  });

  it.each([
    { from: ["2026-02-01", "2026-02-02"] },
    { to: ["2026-02-20", "2026-02-21"] },
    { search: ["rent", "salary"] },
  ])("rejects repeated query parameters", async (query) => {
    const req = createRequest(query);
    const res = createResponse();

    await listLedgerTransactionsController(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "from, to, and search must be single string values",
    });
    expect(listLedgerTransactionsMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the service fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    listLedgerTransactionsMock.mockRejectedValue(
      new Error("Database connection failed"),
    );

    const req = createRequest({ search: "rent" });
    const res = createResponse();

    try {
      await listLedgerTransactionsController(
        req,
        res as unknown as Response,
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Failed to retrieve ledger transactions",
      });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
