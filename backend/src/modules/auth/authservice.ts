import { pool } from "../../db/pool.js";
import { registerSchema } from "./authschema.js";
import { hashPassword } from "./password.js";
import { createSessionToken, hashSessionToken } from "./session.js";
import { loginSchema } from "./loginschema.js";
import { verifyPassword } from "./password.js";

export async function registerUser(input: unknown) {
  const data = registerSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  const sessionToken = createSessionToken();
const tokenHash = hashSessionToken(sessionToken);
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

   const userResult = await client.query(
  `INSERT INTO users (name, email, password_hash)
   VALUES ($1, LOWER($2), $3)
   RETURNING id, name, email`,
  [data.name, data.email, passwordHash],
);

const user = userResult.rows[0];

const organizationResult = await client.query(
  `INSERT INTO organizations (name)
   VALUES ($1)
   RETURNING id, name`,
  [data.organizationName],
);

const organization = organizationResult.rows[0];

await client.query(
  `INSERT INTO memberships (user_id, organization_id, role)
   VALUES ($1, $2, $3)`,
  [user.id, organization.id, "owner"],
);
await client.query(
  `INSERT INTO sessions (user_id, token_hash, expires_at)
   VALUES ($1, $2, $3)`,
  [user.id, tokenHash, expiresAt],
);

await client.query("COMMIT");


return { user, organization, sessionToken };
  } catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
}
}
export async function loginUser(input: unknown) {
  const data = loginSchema.parse(input);

  const result = await pool.query(
    `SELECT id, name, email, password_hash
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [data.email],
  );

  const user = result.rows[0];

  if (!user || !(await verifyPassword(user.password_hash, data.password))) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const sessionToken = createSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt],
  );

  const { password_hash: _passwordHash, ...safeUser } = user;

  return { user: safeUser, sessionToken };
}
export async function logoutUser(token: string | undefined): Promise<void> {
  if (!token) return;

  const tokenHash = hashSessionToken(token);

  await pool.query(
    `DELETE FROM sessions WHERE token_hash = $1`,
    [tokenHash],
  );
}