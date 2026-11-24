import "dotenv/config";

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

export const config = {
  port,
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  metaApiToken: process.env.METAAPI_TOKEN?.trim() ?? "",
  metaApiRegion: process.env.METAAPI_REGION?.trim() ?? "",
  metaApiBaseUrl: process.env.METAAPI_BASE_URL?.trim() ?? ""
};

export function isMetaApiConfigured() {
  if (!config.metaApiToken || !config.metaApiRegion || !config.metaApiBaseUrl) return false;
  if (!/^[a-z0-9-]{2,40}$/i.test(config.metaApiRegion)) return false;

  try {
    const url = new URL(config.metaApiBaseUrl);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}
