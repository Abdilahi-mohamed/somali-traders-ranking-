import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createSessionToken, hashPassword, verifyPassword, readSessionToken } from "./authTokens.js";
import { getMongoCollections } from "./mongo.js";

export const adminLoginSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128)
}).strict();

export class InvalidAdminCredentialsError extends Error {
  constructor() {
    super("Invalid username or password.");
    this.name = "InvalidAdminCredentialsError";
  }
}

export async function provisionInitialAdmin() {
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const parsedEmail = email ? z.string().email().safeParse(email) : null;
  if (!username && !email && !password) {
    if (await (await getMongoCollections()).admin_users.countDocuments() === 0) {
      console.warn("No administrator exists. Configure ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD to provision one.");
    }
    return;
  }
  if (!username || !email || !password || !parsedEmail?.success || !/^[a-z0-9._-]{3,32}$/.test(username) || password.length < 12) {
    throw new Error("Set a valid ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD (at least 12 characters) together.");
  }

  const admins = (await getMongoCollections()).admin_users;
  await admins.updateOne(
    { username },
    {
      $setOnInsert: {
        user_id: randomUUID(),
        username,
        email,
        password_hash: await hashPassword(password),
        created_at: new Date().toISOString()
      }
    },
    { upsert: true }
  );
}

export async function loginAdmin(username: string, password: string) {
  const admins = (await getMongoCollections()).admin_users;
  const admin = await admins.findOne({ username }, { collation: { locale: "en", strength: 2 } });
  if (!admin || !await verifyPassword(password, admin.password_hash)) throw new InvalidAdminCredentialsError();

  const session = createSessionToken(admin.user_id, "admin");
  return {
    accessToken: session.token,
    expiresIn: session.expiresIn,
    user: { id: admin.user_id, username: admin.username, email: admin.email }
  };
}

export async function getAdminFromAccessToken(accessToken: string) {
  const claims = readSessionToken(accessToken, "admin");
  if (!claims) return null;

  const admin = await (await getMongoCollections()).admin_users.findOne({ user_id: claims.sub });
  if (!admin) return null;
  return { id: admin.user_id, username: admin.username, email: admin.email };
}
