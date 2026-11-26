import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAccountVerification, providerAccountType } from "../src/accountVerification.js";

const registered = { accountNumber: "123456", server: "Broker-Live", platform: "MT5" };
const realProvider = {
  login: 123456,
  server: "broker-live",
  platform: "mt5",
  tradeMode: "ACCOUNT_TRADE_MODE_REAL",
  investorMode: true
};

test("classifies only explicitly reported provider account types", () => {
  assert.equal(providerAccountType("ACCOUNT_TRADE_MODE_REAL"), "REAL");
  assert.equal(providerAccountType("ACCOUNT_TRADE_MODE_DEMO"), "DEMO");
  assert.equal(providerAccountType("ACCOUNT_TRADE_MODE_CONTEST"), "CONTEST");
  assert.equal(providerAccountType(""), "UNKNOWN");
  assert.equal(providerAccountType(null), "UNKNOWN");
});

test("accepts a real account only after investor, identity, and ownership checks", () => {
  assert.deepEqual(evaluateAccountVerification(realProvider, registered, true), {
    accountType: "REAL",
    status: "verified_real",
    reason: "provider_confirmed_real_read_only_account"
  });
  assert.equal(evaluateAccountVerification(realProvider, registered, false).status, "pending_verification");
  assert.equal(evaluateAccountVerification({ ...realProvider, investorMode: false }, registered, true).status, "connection_failed");
});

test("rejects demo and contest accounts and leaves unknown types pending", () => {
  assert.equal(evaluateAccountVerification({ ...realProvider, tradeMode: "DEMO" }, registered, true).status, "demo_account");
  assert.equal(evaluateAccountVerification({ ...realProvider, tradeMode: "CONTEST" }, registered, true).status, "contest_account");
  assert.equal(evaluateAccountVerification({ ...realProvider, tradeMode: "UNRECOGNIZED" }, registered, true).status, "pending_verification");
});

test("does not verify an account whose provider identity differs from registration", () => {
  assert.equal(evaluateAccountVerification({ ...realProvider, login: 654321 }, registered, true).status, "pending_verification");
  assert.equal(evaluateAccountVerification({ ...realProvider, server: "Broker-Demo" }, registered, true).status, "pending_verification");
  assert.equal(evaluateAccountVerification({ ...realProvider, platform: "MT4" }, registered, true).status, "pending_verification");
  assert.equal(evaluateAccountVerification({ ...realProvider, login: null }, registered, true).status, "pending_verification");
});
