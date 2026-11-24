export type Trader = {
  id: string;
  name: string;
  initials: string;
  city: string;
  account: string;
  platform: string;
  roi: number;
  drawdown: number | null;
  winRate: number | null;
  equity: number | null;
  pnl: number | null;
  currency: string | null;
};
