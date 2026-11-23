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
