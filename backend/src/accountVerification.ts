export type ProviderAccountType = "REAL" | "DEMO" | "CONTEST" | "UNKNOWN";
export type VerificationStatus =
  | "verified_real"
  | "demo_account"
  | "contest_account"
  | "pending_verification"
  | "connection_failed";

type ProviderAccount = {
  login?: string | number | null;
  server?: string | null;
  platform?: string | null;
  tradeMode?: string | null;
  investorMode?: boolean | null;
};

type RegisteredAccount = {
  accountNumber: string;
  server: string;
  platform: string;
};

export function providerAccountType(value: string | null | undefined): ProviderAccountType {
  const normalized = value?.toUpperCase();
  if (normalized === "ACCOUNT_TRADE_MODE_REAL" || normalized === "REAL") return "REAL";
  if (normalized === "ACCOUNT_TRADE_MODE_DEMO" || normalized === "DEMO") return "DEMO";
  if (normalized === "ACCOUNT_TRADE_MODE_CONTEST" || normalized === "CONTEST") return "CONTEST";
  return "UNKNOWN";
}

function normalized(value: string | number | null | undefined) {
  return value == null ? "" : String(value).trim().toLocaleLowerCase("en-US");
}

export function evaluateAccountVerification(
  provider: ProviderAccount,
  registered: RegisteredAccount,
  ownershipVerified: boolean
): { accountType: ProviderAccountType; status: VerificationStatus; reason: string } {
  const accountType = providerAccountType(provider.tradeMode);
  if (accountType === "DEMO") return { accountType, status: "demo_account", reason: "demo_account_rejected" };
  if (accountType === "CONTEST") return { accountType, status: "contest_account", reason: "contest_account_rejected" };
  if (accountType === "UNKNOWN") return { accountType, status: "pending_verification", reason: "account_type_unavailable" };
  if (provider.investorMode !== true) {
    return { accountType, status: "connection_failed", reason: "investor_mode_not_confirmed" };
  }

  const identityMatches =
    normalized(provider.login) === normalized(registered.accountNumber) &&
    normalized(provider.server) === normalized(registered.server) &&
    normalized(provider.platform) === normalized(registered.platform);
  if (!identityMatches) {
    return { accountType, status: "pending_verification", reason: "provider_identity_unconfirmed" };
  }
  if (!ownershipVerified) {
    return { accountType, status: "pending_verification", reason: "account_ownership_unconfirmed" };
  }
  return { accountType, status: "verified_real", reason: "provider_confirmed_real_read_only_account" };
}
