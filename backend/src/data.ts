export type Trader = {
  id: string;
  name: string;
  initials: string;
  city: string;
  account: string;
  platform: string;
  roi: number;
  drawdown: number;
  profitFactor: number;
  winRate: number;
  equity: number | null;
  score: number;
};

export const traders: Trader[] = [
  { id: "mustafa", name: "Mustafa Abdi", initials: "MA", city: "Hargeisa", account: "FTMO 200k Funded", platform: "MT5", roi: 142.8, drawdown: 3.4, profitFactor: 2.84, winRate: 68.5, equity: 248320, score: 98.6 },
  { id: "khadar", name: "Khadar Xasan", initials: "KX", city: "Mogadishu", account: "Exness Pro Real", platform: "MT5", roi: 118.2, drawdown: 4.8, profitFactor: 2.51, winRate: 64, equity: 84150, score: 96.2 },
  { id: "ayan", name: "Ayan Warsame", initials: "AW", city: "Borama", account: "MFF Prop Account", platform: "MT4", roi: 94.5, drawdown: 5.1, profitFactor: 2.32, winRate: 61.8, equity: 100000, score: 94.8 },
  { id: "guled", name: "Guled Farah", initials: "GF", city: "Diaspora (London)", account: "Binance Futures", platform: "API Sync", roi: 78.6, drawdown: 6.2, profitFactor: 2.15, winRate: 59.2, equity: null, score: 92.4 },
  { id: "yasmin", name: "Yasmin Nour", initials: "YN", city: "Garowe", account: "IC Markets Raw ECN", platform: "cTrader", roi: 68.4, drawdown: 4.2, profitFactor: 2.08, winRate: 62.1, equity: 32400, score: 91 },
  { id: "ahmed", name: "Ahmed Bile", initials: "AB", city: "Hargeisa", account: "FundedNext Stellar", platform: "MT5", roi: 54.3, drawdown: 7.8, profitFactor: 1.92, winRate: 57.4, equity: 50000, score: 87.5 },
  { id: "sahra", name: "Sahra Jama", initials: "SJ", city: "Mogadishu", account: "Tickmill Pro Live", platform: "MT4", roi: 49.1, drawdown: 3.9, profitFactor: 1.85, winRate: 65.3, equity: 18920, score: 86.2 },
  { id: "liban", name: "Liban Cisman", initials: "LC", city: "Borama", account: "Bybit Spot & Margin", platform: "API Sync", roi: 42, drawdown: 8.4, profitFactor: 1.74, winRate: 54, equity: null, score: 83.9 }
];

export const adminAccounts = [
  { name: "Guled A. Warsame", city: "Hargeisa", email: "g.warsame@example.com", broker: "Exness-Real14", id: "ST-88219", type: "Live Real", roi: 142.8, drawdown: 6.4, audit: "Clean · verified server log", status: "Verified" },
  { name: "Abdirashid K. Noor", city: "Mogadishu", email: "a.noor@example.com", broker: "RawSpread-Demo2", id: "ST-40911", type: "Demo · Flagged", roi: 489.2, drawdown: 1.9, audit: "Demo account detected", status: "Pending" },
  { name: "Sahra M. Jama", city: "Garowe", email: "s.jama@example.com", broker: "FTMO Server EU-08", id: "ST-92044", type: "Prop Firm", roi: 64.3, drawdown: 4.1, audit: "Official API match", status: "Verified" },
  { name: "Khalid A. Cisse", city: "Borama", email: "k.cisse@example.com", broker: "Offshore-Direct", id: "ST-10842", type: "Flagged Audit", roi: 312, drawdown: 44.8, audit: "Abnormal activity alert", status: "Flagged" },
  { name: "Hassan O. Daud", city: "Diaspora (UK)", email: "h.daud@example.com", broker: "IC-Markets-Live03", id: "ST-77312", type: "Live Real", roi: 88.9, drawdown: 8.2, audit: "Clean · low slippage", status: "Verified" }
];

export const traderOverview = {
  name: "Guled Farah",
  rank: 4,
  roi: 68.4,
  pnl: 13140,
  drawdown: 4.2,
  equity: 32400,
  verifiedAccounts: 2,
  winRate: 59.2,
  profitFactor: 2.15,
  sharpeRatio: 2.42,
  totalTrades: 114,
  lastSynced: "4 minutes ago"
};
