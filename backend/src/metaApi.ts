import { z } from "zod";
import { config, isMetaApiConfigured } from "./config.js";

const provisionedAccountSchema = z.object({
  id: z.string().min(1),
  state: z.string().optional(),
  connectionStatus: z.string().optional(),
  region: z.string().optional()
}).passthrough();

const accountInformationSchema = z.object({
  login: z.union([z.string(), z.number()]).nullish(),
  broker: z.string().nullish(),
  name: z.string().nullish(),
  server: z.string().nullish(),
  platform: z.string().nullish(),
  tradeMode: z.string().nullish(),
  investorMode: z.boolean().nullish(),
  currency: z.string().nullish(),
  balance: z.number().finite().nullish(),
  equity: z.number().finite().nullish(),
  freeMargin: z.number().finite().nullish(),
  margin: z.number().finite().nullish(),
  leverage: z.number().finite().nullish()
}).passthrough();

const dealSchema = z.object({
  id: z.union([z.string(), z.number()]),
  positionId: z.union([z.string(), z.number()]).nullish(),
  type: z.string(),
  entryType: z.string().nullish(),
  time: z.union([z.string().datetime({ offset: true }), z.date()]),
  symbol: z.string().nullish(),
  volume: z.number().finite().nullish(),
  price: z.number().finite().nullish(),
  profit: z.number().finite().nullish(),
  commission: z.number().finite().nullish(),
  swap: z.number().finite().nullish(),
  fee: z.number().finite().nullish()
}).passthrough();

const dealsResponseSchema = z.union([
  z.array(dealSchema),
  z.object({ deals: z.array(dealSchema), synchronizing: z.boolean().optional() })
]);

const positionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  type: z.string(),
  time: z.string().datetime({ offset: true }),
  symbol: z.string(),
  volume: z.number().finite(),
  openPrice: z.number().finite(),
  currentPrice: z.number().finite().nullish(),
  profit: z.number().finite().nullish(),
  swap: z.number().finite().nullish(),
  stopLoss: z.number().finite().nullish(),
  takeProfit: z.number().finite().nullish()
}).passthrough();

export type MetaApiAccountInformation = z.infer<typeof accountInformationSchema>;
export type MetaApiDeal = z.infer<typeof dealSchema>;
export type MetaApiPosition = z.infer<typeof positionSchema>;

export class MetaApiRequestError extends Error {
  constructor(readonly statusCode: number, readonly providerCode: string) {
    super("MetaApi request failed.");
    this.name = "MetaApiRequestError";
  }
}

export class MetaApiConfigurationError extends Error {
  constructor() {
    super("MetaApi integration is not configured.");
    this.name = "MetaApiConfigurationError";
  }
}

function assertConfigured() {
  if (!isMetaApiConfigured()) throw new MetaApiConfigurationError();
}

function provisioningUrl(path: string) {
  const base = new URL(config.metaApiBaseUrl);
  return new URL(path.replace(/^\//, ""), `${base.href.replace(/\/+$/, "")}/`);
}

function clientUrl(path: string) {
  const base = `https://mt-client-api-v1.${config.metaApiRegion}.agiliumtrade.ai`;
  return new URL(path.replace(/^\//, ""), `${base}/`);
}

async function requestJson(url: URL, init: RequestInit = {}): Promise<unknown> {
  assertConfigured();
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "auth-token": config.metaApiToken,
        "Content-Type": "application/json",
        ...init.headers
      },
      signal: AbortSignal.timeout(25_000)
    });
  } catch {
    throw new MetaApiRequestError(0, "provider_unavailable");
  }

  if (!response.ok) {
    throw new MetaApiRequestError(response.status, "provider_request_failed");
  }

  if (response.status === 204) return null;
  try {
    return await response.json() as unknown;
  } catch {
    throw new MetaApiRequestError(response.status, "invalid_provider_response");
  }
}

export async function provisionMetaApiAccount(account: {
  platform: "MT4" | "MT5";
  login: string;
  password: string;
  server: string;
  brokerName: string;
}) {
  const response = await requestJson(provisioningUrl("/users/current/accounts"), {
    method: "POST",
    body: JSON.stringify({
      name: `${account.brokerName} ${account.login}`,
      type: "cloud",
      platform: account.platform.toLowerCase(),
      login: account.login,
      password: account.password,
      server: account.server,
      region: config.metaApiRegion,
      magic: 0,
      reliability: "regular"
    })
  });
  const parsed = provisionedAccountSchema.safeParse(response);
  if (!parsed.success) throw new MetaApiRequestError(502, "invalid_provider_response");
  return parsed.data.id;
}

export async function updateMetaApiCredentials(metaApiAccountId: string, password: string) {
  await requestJson(provisioningUrl(`/users/current/accounts/${encodeURIComponent(metaApiAccountId)}`), {
    method: "PUT",
    body: JSON.stringify({ password })
  });
}

export async function deployMetaApiAccount(metaApiAccountId: string) {
  await requestJson(provisioningUrl(`/users/current/accounts/${encodeURIComponent(metaApiAccountId)}/deploy`), {
    method: "POST"
  });
}

export async function removeMetaApiAccount(metaApiAccountId: string) {
  await requestJson(provisioningUrl(`/users/current/accounts/${encodeURIComponent(metaApiAccountId)}`), {
    method: "DELETE"
  });
}

export async function waitForMetaApiAccount(metaApiAccountId: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const raw = await requestJson(provisioningUrl(`/users/current/accounts/${encodeURIComponent(metaApiAccountId)}`));
    const account = provisionedAccountSchema.safeParse(raw);
    if (!account.success) throw new MetaApiRequestError(502, "invalid_provider_response");
    if (account.data.state?.toUpperCase() === "DEPLOYED" &&
        account.data.connectionStatus?.toUpperCase() === "CONNECTED") return;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new MetaApiRequestError(504, "connection_timeout");
}

export async function assertMetaApiAccountConnected(metaApiAccountId: string) {
  const raw = await requestJson(provisioningUrl(`/users/current/accounts/${encodeURIComponent(metaApiAccountId)}`));
  const account = provisionedAccountSchema.safeParse(raw);
  if (!account.success) throw new MetaApiRequestError(502, "invalid_provider_response");
  if (
    account.data.state?.toUpperCase() !== "DEPLOYED" ||
    account.data.connectionStatus?.toUpperCase() !== "CONNECTED"
  ) {
    throw new MetaApiRequestError(503, "account_disconnected");
  }
}

export async function retrieveMetaApiAccountInformation(metaApiAccountId: string) {
  const response = await requestJson(clientUrl(
    `/users/current/accounts/${encodeURIComponent(metaApiAccountId)}/accountInformation`
  ));
  const parsed = accountInformationSchema.safeParse(response);
  if (!parsed.success) throw new MetaApiRequestError(502, "invalid_provider_response");
  return parsed.data;
}

export async function retrieveMetaApiDeals(
  metaApiAccountId: string,
  startTime: Date,
  endTime: Date
): Promise<MetaApiDeal[]> {
  const deals: MetaApiDeal[] = [];
  const pageSize = 1000;
  const maxPages = 100;
  for (let page = 0; page < maxPages; page += 1) {
    const url = clientUrl(
      `/users/current/accounts/${encodeURIComponent(metaApiAccountId)}/history-deals/time/` +
      `${encodeURIComponent(startTime.toISOString())}/${encodeURIComponent(endTime.toISOString())}`
    );
    url.searchParams.set("offset", String(page * pageSize));
    url.searchParams.set("limit", String(pageSize));
    const parsed = dealsResponseSchema.safeParse(await requestJson(url));
    if (!parsed.success) throw new MetaApiRequestError(502, "invalid_provider_response");
    if (!Array.isArray(parsed.data) && parsed.data.synchronizing) {
      throw new MetaApiRequestError(503, "history_synchronizing");
    }
    const batch = Array.isArray(parsed.data) ? parsed.data : parsed.data.deals;
    deals.push(...batch);
    if (batch.length < pageSize) return deals;
  }
  throw new MetaApiRequestError(413, "history_limit_exceeded");
}

export async function retrieveMetaApiPositions(metaApiAccountId: string): Promise<MetaApiPosition[]> {
  const parsed = z.array(positionSchema).safeParse(await requestJson(clientUrl(
    `/users/current/accounts/${encodeURIComponent(metaApiAccountId)}/positions`
  )));
  if (!parsed.success) throw new MetaApiRequestError(502, "invalid_provider_response");
  return parsed.data;
}
