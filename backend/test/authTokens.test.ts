import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionToken, hashPassword, readSessionToken, verifyPassword } from "../src/authTokens.js";

process.env.AUTH_TOKEN_SECRET = "test-only-signing-secret-that-is-long-enough";

test("passwords are hashed and verified without storing the original password", async () => {
  const record = await hashPassword("correct horse battery staple");
  assert.notEqual(record, "correct horse battery staple");
  assert.match(record, /^scrypt\$/);
  assert.equal(await verifyPassword("correct horse battery staple", record), true);
  assert.equal(await verifyPassword("wrong password", record), false);
});

test("signed sessions enforce role, signature, and expiry", () => {
  const { token } = createSessionToken("trader-123", "trader");
  assert.deepEqual(readSessionToken(token, "trader")?.sub, "trader-123");
  assert.equal(readSessionToken(token, "admin"), null);
  assert.equal(readSessionToken(`${token.slice(0, -1)}x`, "trader"), null);

  const expired = createSessionToken("trader-123", "trader", -1);
  assert.equal(readSessionToken(expired.token, "trader"), null);
});
