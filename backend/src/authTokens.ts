import { createHmac, randomBytes, scrypt as scryptCallback, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const dummySalt = randomBytes(16);
const dummyPasswordHash = scryptSync("not-a-real-password", dummySalt, 32).toString("base64url");
const dummyPasswordRecord = `scrypt$${dummySalt.toString("base64url")}$${dummyPasswordHash}`;

type SessionRole = "trader" | "admin";
type SessionClaims = { sub: string; role: SessionRole; exp: number };

export class AuthConfigurationError extends Error {
  constructor() {
    super("AUTH_TOKEN_SECRET must be set to a random value of at least 32 characters.");
    this.name = "AuthConfigurationError";
  }
}

function sessionSecret() {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("replace-with-")) {
    throw new AuthConfigurationError();
  }
  return secret;
}

export function validateAuthConfiguration() {
  sessionSecret();
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, passwordRecord?: string) {
  const [algorithm, encodedSalt, encodedHash] = (passwordRecord ?? dummyPasswordRecord).split("$");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedHash) return false;
  const salt = Buffer.from(encodedSalt, "base64url");
  const expected = Buffer.from(encodedHash, "base64url");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  const matches = timingSafeEqual(actual, expected);
  return passwordRecord !== undefined && matches;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function createSessionToken(subject: string, role: SessionRole, lifetimeSeconds = 60 * 60 * 24 * 7) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ sub: subject, role, iat: issuedAt, exp: issuedAt + lifetimeSeconds }));
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", sessionSecret()).update(unsigned).digest("base64url");
  return { token: `${unsigned}.${signature}`, expiresIn: lifetimeSeconds };
}

export function readSessionToken(token: string, requiredRole: SessionRole): SessionClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const expected = createHmac("sha256", sessionSecret()).update(unsigned).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  try {
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as { alg?: unknown; typ?: unknown };
    const claims = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<SessionClaims>;
    if (
      header.alg !== "HS256" ||
      header.typ !== "JWT" ||
      typeof claims.sub !== "string" ||
      claims.sub.length === 0 ||
      claims.role !== requiredRole ||
      typeof claims.exp !== "number" ||
      claims.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return { sub: claims.sub, role: requiredRole, exp: claims.exp };
  } catch {
    return null;
  }
}
