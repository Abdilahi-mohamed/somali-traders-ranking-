import { z } from "zod";
import { createSessionToken, readSessionToken, verifyPassword } from "./authTokens.js";
import { getMongoCollections } from "./mongo.js";

export const traderLoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
}).strict();

export class InvalidTraderCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidTraderCredentialsError";
  }
}

export async function loginTrader(email: string, password: string) {
  const profiles = (await getMongoCollections()).trader_profiles;
  const trader = await profiles.findOne(
    { email: email.toLowerCase() },
    { collation: { locale: "en", strength: 2 } }
  );
  if (!trader || !await verifyPassword(password, trader.password_hash)) throw new InvalidTraderCredentialsError();

  const session = createSessionToken(trader.user_id, "trader");
  return {
    userId: trader.user_id,
    accessToken: session.token,
    expiresIn: session.expiresIn
  };
}

export async function getTraderFromAccessToken(accessToken: string) {
  const claims = readSessionToken(accessToken, "trader");
  if (!claims) return null;

  const trader = await (await getMongoCollections()).trader_profiles.findOne(
    { user_id: claims.sub },
    { projection: { user_id: 1, full_name: 1, trading_alias: 1 } }
  );
  if (!trader) return null;
  return { user_id: trader.user_id, full_name: trader.full_name, trading_alias: trader.trading_alias };
}
