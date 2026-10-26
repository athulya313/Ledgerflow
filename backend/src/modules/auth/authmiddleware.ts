import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { pool } from "../../db/pool.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = req.cookies?.session;

    if (!token || typeof token !== "string") {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const result = await pool.query(
      `SELECT u.id, u.name, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}