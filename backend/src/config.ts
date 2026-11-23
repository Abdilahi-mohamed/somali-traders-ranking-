import "dotenv/config";

const port = Number(process.env.PORT ?? 4000);
const bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

if (!Number.isInteger(bcryptRounds) || bcryptRounds < 10 || bcryptRounds > 14) {
  throw new Error("BCRYPT_ROUNDS must be an integer between 10 and 14.");
}

export const config = {
  port,
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  databasePath: process.env.DATABASE_PATH ?? "./data/traders.sqlite",
  bcryptRounds
};
