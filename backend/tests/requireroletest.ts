import { describe, it, expect, vi } from "vitest";
import type { Response, NextFunction } from "express";
import type { OrganizationRequest } from "../src/middleware/requireorganization.js";
import { requireRole } from "../src/middleware/requirerole.js";

function createRequest(role?: "owner" | "finance_admin" | "auditor") {
  return {
    organization: role
      ? { id: "org-1", name: "Test Org", role }
      : undefined,
  } as OrganizationRequest;
}

function createResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  return res;
}

describe("requireRole", () => {
  it("allows an owner to perform finance actions", () => {
    const req = createRequest("owner");
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    requireRole("owner", "finance_admin")(
      req,
      res as unknown as Response,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows a finance admin to perform finance actions", () => {
    const req = createRequest("finance_admin");
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    requireRole("owner", "finance_admin")(
      req,
      res as unknown as Response,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it("blocks an auditor from performing finance actions", () => {
    const req = createRequest("auditor");
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    requireRole("owner", "finance_admin")(
      req,
      res as unknown as Response,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks requests without verified organization access", () => {
    const req = createRequest();
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    requireRole("owner")(
      req,
      res as unknown as Response,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});