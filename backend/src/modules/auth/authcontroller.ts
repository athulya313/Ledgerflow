import type { Request, Response, NextFunction } from "express";

import { loginUser, registerUser ,logoutUser} from "./authservice.js";
import type { AuthenticatedRequest } from "./authmiddleware.js";
import { pool } from "../../db/pool.js";




export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { sessionToken, ...result } = await registerUser(req.body);

    res.cookie("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { sessionToken, ...result } = await loginUser(req.body);

    res.cookie("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await logoutUser(req.cookies?.session);

    res.clearCookie("session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
export async function me(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = await pool.query(
    `SELECT o.id, o.name, m.role
     FROM memberships m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = $1
     ORDER BY o.name`,
    [req.user!.id],
  );

  res.json({
    user: req.user,
    organizations: result.rows,
  });
}