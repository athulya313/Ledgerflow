
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response, NextFunction } from "express";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../src/db/pool.js", () => ({
  pool: {
    query: queryMock,
  },
}));

import {
  requireOrganization,
  type OrganizationRequest,
} from "../src/middleware/requireorganization.js";



function createRequest(userId?: string): OrganizationRequest {
  return {
    params: { organizationId: "company-b" },
    user: userId
      ? ({ id: userId } as OrganizationRequest["user"])
      : undefined,
  } as unknown as OrganizationRequest;
}


function createResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  return res;
}

describe("requireOrganization security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks a user who is not a member of the requested organization", async () => {
    queryMock.mockResolvedValue({ rows: [] });

    const req = createRequest("user-from-company-a");
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    await requireOrganization(
      req,
      res as unknown as Response,
      next,
    );

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("m.user_id = $1 AND o.id = $2"),
      ["user-from-company-a", "company-b"],
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "You do not have access to this organization",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a user who belongs to the requested organization", async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: "company-b",
          name: "Company B",
          role: "auditor",
        },
      ],
    });

    const req = createRequest("user-from-company-b");
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    await requireOrganization(
      req,
      res as unknown as Response,
      next,
    );

    expect(req.organization).toEqual({
      id: "company-b",
      name: "Company B",
      role: "auditor",
    });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests before querying the database", async () => {
    const req = createRequest();
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    await requireOrganization(
      req,
      res as unknown as Response,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(queryMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
