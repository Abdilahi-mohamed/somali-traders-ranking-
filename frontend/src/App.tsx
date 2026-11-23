import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import type { Trader } from "./types";
import "./register.css";

type RegistrationProfile = {
  fullName: string;
  alias: string;
  email: string;
  phone: string;
  region: string;
  social: string;
};

type RegistrationAccount =
  | { type: "forex"; category: "live" | "prop"; propFirm?: string; platform: "MT4" | "MT5"; brokerName: string; server: string; accountNumber: string; showBalance: boolean }
  | { type: "crypto"; exchange: "Binance" | "Bybit" | "OKX" | "Other"; accountLabel: string; showBalance: boolean };

const api = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
};

function Icon({ children }: { children: string }) {
  return <span className="material-symbols-outlined icon" aria-hidden="true">{children}</span>;
}

function Header() {
  return <header className="topbar">
    <Link className="brand" to="/"><span className="brand-mark">ST</span><span>SomaliTraders<span className="green">Rank</span></span></Link>
    <nav className="topnav">
      <NavLink to="/">Leaderboard</NavLink><a href="#awards">Annual Awards</a><a href="#method">How Verification Works</a>
    </nav>
    <div className="top-actions"><span className="live-pill"><i /> Live Sync 99.98%</span><Link className="text-link" to="/dashboard">Login</Link><Link className="button button-primary small" to="/register">Register <Icon>arrow_forward</Icon></Link></div>
  </header>;
}

function App() {
  const location = useLocation();
  const isDashboard = location.pathname === "/dashboard" || location.pathname === "/admin";
  return <>{isDashboard ? <PortalHeader /> : <Header />}<Routes>
    <Route path="/" element={<Leaderboard />} />
    <Route path="/register" element={<Register />} />
    <Route path="/dashboard" element={<TraderDashboard />} />
    <Route path="/admin" element={<AdminConsole />} />
    <Route path="*" element={<Leaderboard />} />
  </Routes></>;
}

function PortalHeader() {
  return <header className="portal-header"><Link className="brand" to="/"><span className="brand-mark">ST</span><span>Trader<span className="green">Hub</span></span></Link><nav className="portal-nav"><NavLink to="/dashboard">Overview</NavLink><a href="#accounts">Trading accounts</a><a href="#awards">Awards status</a><NavLink to="/admin">Admin console</NavLink></nav><div className="top-actions"><span className="live-pill"><i /> MT5 · Active Sync</span><Link className="button button-light small" to="/">Public leaderboard</Link></div></header>;
}

function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<T>(path).then(setData).catch((cause: Error) => setError(cause.message)); }, [path]);
  return { data, error };
}

function LoadError({ message }: { message: string }) {
  return <div className="notice error-notice">Could not load live data: {message}. Start the backend API and refresh.</div>;
}

function Leaderboard() {
  const { data, error } = useApi<{ traders: Trader[]; total: number; verifiedOnline: number }>("/api/leaderboard");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [activeTrader, setActiveTrader] = useState("mustafa");
  const [timeframe, setTimeframe] = useState("2026");
  const rows = (data?.traders ?? []).filter((trader) => `${trader.name} ${trader.city} ${trader.account} ${trader.platform}`.toLowerCase().includes(query.toLowerCase()))
    .filter((trader) => region === "all" || trader.city.toLowerCase().includes(region));
  const selected = rows.find((trader) => trader.id === activeTrader) ?? rows[0];
  return <main className="public-page">
    <section className="ranking-intro">
      <div><p className="eyebrow">Somalia &amp; global diaspora · 2026</p><h1>Somali Trader Rankings</h1><p>Verified performance, ranked by audited account metrics.</p></div>
      <Link className="button button-primary" to="/register"><Icon>person_add</Icon> Register as a trader</Link>
    </section>
    {error && <LoadError message={error} />}
    <section className="filter-panel">
      <div className="filter-main"><label className="searchbox"><Icon>search</Icon><input aria-label="Search traders" placeholder="Search trader, broker, or city..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="segmented">{[["month", "This month"], ["2026", "2026 full year"], ["alltime", "All time"]].map(([key, label]) => <button key={key} className={timeframe === key ? "selected" : ""} onClick={() => setTimeframe(key)}>{label}</button>)}</div><select aria-label="Filter by region" value={region} onChange={(event) => setRegion(event.target.value)}><option value="all">All regions</option><option value="hargeisa">Hargeisa</option><option value="mogadishu">Mogadishu</option><option value="borama">Borama</option><option value="garowe">Garowe</option><option value="diaspora">Diaspora</option></select></div>
      <div className="tag-row"><span className="eyebrow">Account type</span><button className="chip active-chip">All accounts · 142</button><button className="chip">Live real · 84</button><button className="chip">Prop funded · 42</button><button className="chip">Crypto · 16</button><span className="risk-filter"><span className="eyebrow">Risk filter</span><button className="chip">Max DD &lt; 10%</button><button className="chip">Sharpe &gt; 2.0</button></span></div>
    </section>
    <section className="leader-layout">
      <div className="table-card">
        <div className="table-heading"><div><h2>Verified Somali Performance Registry</h2><span className="status-tag">● {data?.verifiedOnline ?? "—"} verified online</span></div><span className="sync-status"><Icon>sync</Icon> Sync latency: 14s</span></div>
        <div className="table-scroll"><table className="leader-table"><thead><tr><th>Rank</th><th>Trader &amp; origin</th><th>Broker architecture</th><th className="right">ROI</th><th className="right">Max DD</th><th className="right">PF</th><th className="right">Win rate</th><th className="right">Audited equity</th><th className="right">Score</th></tr></thead><tbody>
          {rows.map((trader) => <tr key={trader.id} onClick={() => setActiveTrader(trader.id)} className={activeTrader === trader.id ? "row-selected" : ""}><td><span className={`rank rank-${trader.id}`}>{data!.traders.indexOf(trader) + 1}</span></td><td><div className="person-cell"><span className="avatar">{trader.initials}</span><span><b>{trader.name} <Icon>verified</Icon></b><small>{trader.city}</small></span></div></td><td><b>{trader.account}</b><small>{trader.platform} · Read-only</small></td><td className="right positive">+{trader.roi}%</td><td className="right">{trader.drawdown}%</td><td className="right">{trader.profitFactor}</td><td className="right">{trader.winRate}%</td><td className="right">{trader.equity ? `$${trader.equity.toLocaleString()}` : <span className="hidden-balance"><Icon>lock</Icon> Hidden</span>}</td><td className="right"><span className="score">{trader.score}</span></td></tr>)}
          {!rows.length && <tr><td className="empty-row" colSpan={9}>No traders match your search.</td></tr>}
        </tbody></table></div>
        <div className="table-footer"><span>Showing {rows.length} of {data?.total ?? "—"} verified operators</span><div><button aria-label="Previous page" disabled>‹</button><span>Page 1 of 18</span><button aria-label="Next page">›</button></div></div>
      </div>
      {selected && <Spotlight trader={selected} />}
    </section>
    <section className="trust-strip" id="method"><span className="trust-icon"><Icon>shield</Icon></span><div><h2>Institutional anti-fraud standard</h2><p>Read-only broker telemetry, with no screenshots or manual performance claims.</p></div><div className="broker-list"><b>FTMO</b><b>Exness</b><b>IC Markets</b><b>FundedNext</b><b>Binance</b></div></section>
    <footer className="footer"><span>© 2026 SomaliTraders Rank</span><span>Demo interface · Sample data, not financial advice</span><Link to="/admin">Admin console</Link><Link to="/dashboard">Trader portal</Link></footer>
  </main>;
}

function Spotlight({ trader }: { trader: Trader }) {
  return <aside className="spotlight"><div className="accent-bar" /><div className="spotlight-person"><span className="avatar avatar-large">{trader.initials}</span><div><h2>{trader.name} <Icon>verified</Icon></h2><p>{trader.city} · Verified trader</p></div><span className="score">Score {trader.score}</span></div><div className="strategy-tags"><span>Consistent returns</span><span>{trader.platform}</span><span>Audited</span></div><div className="chart-box"><div className="chart-title"><b>Audited equity trajectory</b><strong>+{trader.roi}%</strong></div><svg viewBox="0 0 360 112" role="img" aria-label="Rising audited equity line chart"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0d805b" stopOpacity=".24" /><stop offset="1" stopColor="#0d805b" stopOpacity="0" /></linearGradient></defs><path d="M0 94 L35 83 L78 85 L120 61 L160 69 L205 44 L242 50 L280 24 L322 31 L360 9 L360 112 L0 112Z" fill="url(#chartFill)" /><path d="M0 94 L35 83 L78 85 L120 61 L160 69 L205 44 L242 50 L280 24 L322 31 L360 9" fill="none" stroke="#087550" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><circle cx="360" cy="9" r="4" fill="#087550" /></svg><div className="chart-axis"><span>Jan 2026</span><span>Mar 2026</span></div></div><div className="spotlight-metrics"><span><small>Drawdown</small><b>{trader.drawdown}%</b></span><span><small>Profit factor</small><b>{trader.profitFactor}</b></span><span><small>Win rate</small><b>{trader.winRate}%</b></span></div><div className="proof"><b><Icon>verified_user</Icon> Cryptographic proof stamp</b><p>Account telemetry is verified through read-only broker connections.</p></div><button className="button button-primary full-width">Inspect trading journal <Icon>arrow_forward</Icon></button></aside>;
}

function Register() {
  const [step, setStep] = useState(1);
  const [accountType, setAccountType] = useState<"forex" | "crypto">("forex");
  const [accountCategory, setAccountCategory] = useState<"live" | "prop">("live");
  const [showBalance, setShowBalance] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [profile, setProfile] = useState<RegistrationProfile | null>(null);
  const [accountDetails, setAccountDetails] = useState<RegistrationAccount | null>(null);
  const [registrationError, setRegistrationError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredId, setRegisteredId] = useState("");
  const [emailConfirmationRequired, setEmailConfirmationRequired] = useState(false);

  function continueProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }
    setFormError("");
    const formData = new FormData(event.currentTarget);
    setProfile({
      fullName: String(formData.get("fullName") ?? ""),
      alias: String(formData.get("alias") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      region: String(formData.get("region") ?? ""),
      social: String(formData.get("social") ?? "")
    });
    setStep(2);
  }

  function continueAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const visibleBalance = formData.get("showBalance") === "on";
    if (accountType === "forex") {
      const platform = formData.get("platform") === "MT4" ? "MT4" : "MT5";
      setAccountDetails({
        type: "forex",
        category: accountCategory,
        propFirm: String(formData.get("propFirm") ?? ""),
        platform,
        brokerName: String(formData.get("brokerName") ?? ""),
        server: String(formData.get("server") ?? ""),
        accountNumber: String(formData.get("accountNumber") ?? ""),
        showBalance: visibleBalance
      });
    } else {
      const exchangeValue = String(formData.get("exchange") ?? "");
      const exchange = exchangeValue === "Binance" || exchangeValue === "Bybit" || exchangeValue === "OKX" || exchangeValue === "Other"
        ? exchangeValue
        : "Other";
      setAccountDetails({
        type: "crypto",
        exchange,
        accountLabel: String(formData.get("accountLabel") ?? ""),
        showBalance: visibleBalance
      });
    }
    setRegistrationError("");
    setStep(3);
  }

  async function finishRegistration() {
    if (!profile || !accountDetails) {
      setRegistrationError("Complete the profile and account steps first.");
      return;
    }
    setIsSubmitting(true);
    setRegistrationError("");
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, password, consent: true, account: accountDetails })
      });
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "Registration could not be completed.");
      }
      if (typeof result.id !== "string") {
        throw new Error("The server returned an invalid registration response.");
      }
      setRegisteredId(result.id);
      setEmailConfirmationRequired(result.emailConfirmationRequired === true);
      setPassword("");
      setConfirmPassword("");
      setSubmitted(true);
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : "Registration could not be completed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <main className="register-page">
    <div className="register-heading"><div><p className="eyebrow">Trader onboarding · Demo</p><h1>Create your trader profile</h1><p>Set up your public ranking profile. You can connect verified performance after registration.</p></div><Link className="text-link" to="/">← Back to rankings</Link></div>
    <div className="registration-layout">
      <section className="panel registration-panel">
        <div className="registration-steps" aria-label="Registration steps">
          {[["1", "Profile"], ["2", "Trading account"], ["3", "Review"]].map(([number, label], index) => <div className={`registration-step ${step === index + 1 ? "current" : ""} ${step > index + 1 ? "complete" : ""}`} key={number}><span>{step > index + 1 ? "✓" : number}</span>{label}</div>)}
        </div>
        {submitted ? <div className="registration-result" role="status"><span className="result-icon"><Icon>check_circle</Icon></span><h2>Registration received</h2><p>Your profile is saved and pending review. {emailConfirmationRequired ? "Check your email to confirm your address." : ""} Keep your registration reference: <code>{registeredId}</code>.</p><Link className="button button-primary" to="/">View leaderboard</Link></div> : <>
          {step === 1 && <form className="registration-form" onSubmit={continueProfile}>
            <div className="form-section-title"><span>01</span><div><h2>Your public profile</h2><p>These details identify your trader profile.</p></div></div>
            <div className="form-grid"><label>Full name<input name="fullName" autoComplete="name" defaultValue={profile?.fullName ?? ""} required placeholder="Your full name" /></label><label>Trading alias<input name="alias" defaultValue={profile?.alias ?? ""} required placeholder="Name shown on leaderboard" /></label><label>Email address<input name="email" type="email" autoComplete="email" defaultValue={profile?.email ?? ""} required placeholder="you@example.com" /></label><label>Phone / WhatsApp<input name="phone" type="tel" autoComplete="tel" defaultValue={profile?.phone ?? ""} required placeholder="+252 63 000 0000" /></label><label>City / region<select name="region" defaultValue={profile?.region ?? ""} required><option value="" disabled>Select your region</option><option>Boorama</option><option>Hargeysa</option><option>Muqdisho</option><option>Garoowe</option><option>Qurbaha / Diaspora</option></select></label><label>Telegram or social profile <span className="optional">Optional</span><input name="social" defaultValue={profile?.social ?? ""} placeholder="@username or profile URL" /></label><label>Create website password<input name="password" type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 10 characters" /></label><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" /></label></div>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <label className="consent-row"><input type="checkbox" required /> I consent to saving my profile and selected account details in Supabase. Supabase Auth manages my website password.</label>
            <div className="form-actions"><span>Next: account details</span><button className="button button-primary" type="submit">Continue <Icon>arrow_forward</Icon></button></div>
          </form>}
          {step === 2 && <form className="registration-form" onSubmit={continueAccount}>
            <div className="form-section-title"><span>02</span><div><h2>Connect a trading account</h2><p>Choose your account type and add non-secret account details.</p></div></div>
            <div className="account-kind-tabs"><button type="button" onClick={() => setAccountType("forex")} className={accountType === "forex" ? "selected" : ""}><Icon>candlestick_chart</Icon> Forex / Prop firm</button><button type="button" onClick={() => setAccountType("crypto")} className={accountType === "crypto" ? "selected" : ""}><Icon>currency_bitcoin</Icon> Crypto</button></div>
            {accountType === "forex" ? <div className="form-grid"><fieldset className="form-field full-span"><legend>Account category</legend><label className="radio-option"><input type="radio" name="category" checked={accountCategory === "live"} onChange={() => setAccountCategory("live")} /> Live real account</label><label className="radio-option"><input type="radio" name="category" checked={accountCategory === "prop"} onChange={() => setAccountCategory("prop")} /> Prop firm funded account</label></fieldset>{accountCategory === "prop" && <label>Prop firm<select name="propFirm" defaultValue="" required><option value="" disabled>Select firm</option><option>FTMO</option><option>FundedNext</option><option>The5ers</option><option>Other</option></select></label>}<label>Trading platform<select name="platform" defaultValue="MT5"><option>MT4</option><option>MT5</option></select></label><label>Broker name<input name="brokerName" required placeholder="e.g. Exness, IC Markets" /></label><label>Broker server<input name="server" required placeholder="Exact server name" /></label><label>Account number / login ID<input name="accountNumber" required inputMode="numeric" pattern="[0-9]{4,20}" placeholder="4–20 digits" /></label></div> : <div className="form-grid"><label>Exchange<select name="exchange" defaultValue="" required><option value="" disabled>Select exchange</option><option>Binance</option><option>Bybit</option><option>OKX</option><option>Other</option></select></label><label>Account label<input name="accountLabel" placeholder="Optional label" /></label><div className="secure-connect full-span"><Icon>lock</Icon><div><b>API key connection is not available in this demo</b><p>Do not paste API keys or secrets here. A production integration should use an official authorization flow restricted to read-only access, with withdrawals and trading disabled.</p></div></div></div>}
            <label className="toggle-row"><input name="showBalance" type="checkbox" checked={showBalance} onChange={(event) => setShowBalance(event.target.checked)} /><span><b>Show balance publicly</b><small>When off, the public profile shows performance percentages only.</small></span><span className={`toggle ${showBalance ? "on" : ""}`} aria-hidden="true"><i /></span></label>
            <div className="secure-connect"><Icon>verified_user</Icon><div><b>Broker credential connection is not enabled</b><p>Never enter an investor password or master password into this prototype. Secure broker authorization must be configured before account verification can work.</p></div></div>
            {registrationError && <p className="form-error" role="alert">{registrationError}</p>}
            <div className="form-actions"><button className="button button-light" onClick={() => setStep(1)} type="button">Back</button><button className="button button-primary" type="submit">Review registration <Icon>arrow_forward</Icon></button></div>
          </form>}
          {step === 3 && <div className="registration-form">
            <div className="form-section-title"><span>03</span><div><h2>Review &amp; finish</h2><p>Check what this demo will and will not do.</p></div></div>
            <div className="review-list"><p><Icon>check_circle</Icon> Your profile and account metadata will be saved in Supabase.</p><p><Icon>lock</Icon> Supabase Auth manages your website password; this app does not store it in the profile database.</p><p><Icon>lock</Icon> No investor password, API secret, or exchange key is collected.</p></div>
            <div className="secure-connect"><Icon>badge</Icon><div><b>Awards identity review</b><p>Government ID and payout certificates are not uploaded here. A verified, access-controlled review flow must be in place before collecting identity documents.</p></div></div>
            {registrationError && <p className="form-error" role="alert">{registrationError}</p>}
            <div className="form-actions"><button className="button button-light" onClick={() => setStep(2)} type="button">Back</button><button className="button button-primary" disabled={isSubmitting} onClick={finishRegistration} type="button">{isSubmitting ? "Saving…" : "Create account"} <Icon>check</Icon></button></div>
          </div>}
        </>}
      </section>
      <aside className="registration-aside"><div className="aside-icon"><Icon>shield_lock</Icon></div><h2>Your account security comes first</h2><p>We only show audited rankings. Never share your main trading password or enable API trading/withdrawal permissions.</p><ul><li><Icon>check</Icon> Website passwords handled by Supabase Auth</li><li><Icon>check</Icon> Optional balance privacy</li><li><Icon>lock</Icon> Broker secrets and ID documents are not collected</li></ul><div className="aside-note">Keep the Supabase service role key on the server only.</div></aside>
    </div>
  </main>;
}

function TraderDashboard() {
  const { data, error } = useApi<{ name: string; rank: number; roi: number; pnl: number; drawdown: number; equity: number; verifiedAccounts: number; winRate: number; profitFactor: number; sharpeRatio: number; totalTrades: number; lastSynced: string }>("/api/trader/overview");
  return <main className="portal-page">
    {error && <LoadError message={error} />}
    <div className="welcome-row"><div><div className="eyebrow">Trader terminal <span className="status-tag">Level 3 verified</span></div><h1>Welcome back, {data?.name ?? "Trader"} <span className="wave">👋</span></h1><p className="subtle"><span className="pulse-dot" /> Last synced {data?.lastSynced ?? "—"} · MT5 investor relay</p></div><button className="button button-light" onClick={(event) => { const button = event.currentTarget; button.disabled = true; button.innerText = "Syncing…"; window.setTimeout(() => { button.disabled = false; button.innerText = "Sync now"; }, 900); }}><Icon>sync</Icon> Sync now</button></div>
    <section className="metric-grid"><Metric title="National standings" value={`#${data?.rank ?? "—"}`} note="Overall · Top 2.8%" icon="leaderboard" /><Metric title="Verified net ROI · 2026" value={`+${data?.roi ?? "—"}%`} note={`+$${data?.pnl?.toLocaleString() ?? "—"} PnL`} icon="trending_up" green /><Metric title="Risk · max drawdown" value={`${data?.drawdown ?? "—"}%`} note="Low risk tier · safe margin" icon="security" /><Metric title="Tracked equity" value={`$${data?.equity?.toLocaleString() ?? "—"}`} note={`${data?.verifiedAccounts ?? "—"} verified accounts`} icon="account_balance_wallet" /></section>
    <section className="dashboard-columns"><div className="panel growth-panel"><div className="panel-heading"><div><h2>Equity &amp; balance growth</h2><p>Audited account performance over time</p></div><div className="segmented compact"><button>1M</button><button>3M</button><button className="selected">YTD</button><button>All</button></div></div><div className="big-chart"><svg viewBox="0 0 760 240" preserveAspectRatio="none" role="img" aria-label="Equity and balance growth chart"><defs><linearGradient id="growthFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0d805b" stopOpacity=".24"/><stop offset="1" stopColor="#0d805b" stopOpacity="0"/></linearGradient></defs><path className="gridline" d="M0 35H760M0 90H760M0 145H760M0 200H760"/><path d="M0 205 C90 196 150 178 230 150 S350 158 410 120 S510 114 575 76 S660 41 760 15 L760 240 L0 240Z" fill="url(#growthFill)"/><path d="M0 205 C90 196 150 178 230 150 S350 158 410 120 S510 114 575 76 S660 41 760 15" fill="none" stroke="#087550" strokeWidth="4" strokeLinecap="round"/></svg><span className="chart-pin">+{data?.roi ?? "—"}% net ROI</span><div className="chart-axis"><span>Jan 01</span><span>Feb 01</span><span>Mar 01</span><span>Today</span></div></div><div className="telemetry"><MetricMini label="Sharpe ratio" value={data?.sharpeRatio ?? "—"} /><MetricMini label="Profit factor" value={data?.profitFactor ?? "—"} /><MetricMini label="Win rate" value={`${data?.winRate ?? "—"}%`} /><MetricMini label="Total trades" value={data?.totalTrades ?? "—"} /></div></div><div className="panel award-panel" id="awards"><div className="eyebrow green">Verified nomination</div><h2>Somali Trader of the Year 2026</h2><div className="progress-title"><span>Criteria fulfilled</span><b>4 / 4 · 100%</b></div><div className="progress"><i /></div><ul className="check-list"><li><Icon>check_circle</Icon><span>Verified read-only accounts<small>2 accounts active</small></span></li><li><Icon>check_circle</Icon><span>30+ closed trades<small>{data?.totalTrades ?? "—"} trades passed</small></span></li><li><Icon>check_circle</Icon><span>Drawdown under 15%<small>{data?.drawdown ?? "—"}% recorded</small></span></li></ul><div className="certified"><Icon>verified_user</Icon> Nomination certified · Gala 2026</div></div></section>
    <section className="panel accounts-panel" id="accounts"><div className="panel-heading"><div><h2>Connected trading accounts</h2><p>Read-only accounts · sample dashboard data</p></div><button className="button button-primary"><Icon>add</Icon> Connect account</button></div><div className="account-row"><div><span className="platform-square">MT5</span><span><b>Exness Real</b><small>Live personal · verified</small></span></div><b>$12,400.00</b><span className="status-tag">Verified &amp; active</span></div><div className="account-row"><div><span className="platform-square">MT5</span><span><b>FTMO Server</b><small>Prop firm · verified</small></span></div><b>$20,000.00</b><span className="status-tag">Verified &amp; active</span></div></section>
    <p className="demo-caption">This portal is a UI prototype backed by sample data. No trading account credentials are requested or stored.</p>
  </main>;
}

function Metric({ title, value, note, icon, green = false }: { title: string; value: string; note: string; icon: string; green?: boolean }) {
  return <div className="metric-card"><div className="metric-title">{title}<span className="metric-icon"><Icon>{icon}</Icon></span></div><b className={green ? "positive" : ""}>{value}</b><small>{note}</small></div>;
}

function MetricMini({ label, value }: { label: string; value: string | number }) {
  return <div><small>{label}</small><b>{value}</b></div>;
}

function AdminConsole() {
  const { data, error } = useApi<{ registeredTraders: number; verifiedTraders: number; pendingVerifications: number; flaggedAccounts: number; workerUptime: number; accounts: Array<{ name: string; city: string; email: string; broker: string; id: string; type: string; roi: number; drawdown: number; audit: string; status: string }> }>("/api/admin/overview");
  const [filter, setFilter] = useState("All");
  const accounts = (data?.accounts ?? []).filter((account) => filter === "All" || account.status === filter);
  return <main className="portal-page admin-page">
    {error && <LoadError message={error} />}
    <div className="welcome-row admin-title"><div><div className="eyebrow"><span className="secure-label"><Icon>shield</Icon> Secure console · Demo</span> Federation engine</div><h1>Super Admin Control Center</h1></div><span className="auth-badge"><Icon>verified_user</Icon> Demo session · no admin actions enabled</span></div>
    <section className="metric-grid"><Metric title="Registered traders" value={`${data?.registeredTraders ?? "—"}`} note={`${data?.verifiedTraders ?? "—"} verified`} icon="groups" /><Metric title="Pending verifications" value={`${data?.pendingVerifications ?? "—"}`} note="Requires staff review" icon="hourglass_top" /><Metric title="Flagged accounts" value={`${data?.flaggedAccounts ?? "—"}`} note="Requires audit" icon="warning" /><Metric title="Background sync worker" value="Healthy" note={`${data?.workerUptime ?? "—"}% uptime · demo status`} icon="bolt" green /></section>
    <section className="season-banner" id="awards"><div><span className="season-chip">Governance · Demo</span><h2>Annual Awards 2026 season</h2><p>View sample season criteria and moderation status. Administrative actions are intentionally disabled in this prototype.</p></div><div className="season-kpis"><span>Min closed trades <b>30</b></span><span>Max drawdown <b>15%</b></span><span>Account age <b>60 days</b></span><span>Finalist cutoff <b>Nov 15</b></span></div></section>
    <section className="panel moderation-panel"><div className="panel-heading"><div><h2>Accounts &amp; trader moderation</h2><p>Review sample audit records and verification status.</p></div><div className="filter-tabs">{["All", "Pending", "Verified", "Flagged"].map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div></div><div className="table-scroll"><table className="admin-table"><thead><tr><th>Trader</th><th>Platform &amp; server</th><th>Class</th><th className="right">ROI</th><th className="right">Max DD</th><th>Risk analysis</th><th>Status</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td><b>{account.name}</b><small>{account.city} · {account.email}</small></td><td><b>{account.broker}</b><small>{account.id}</small></td><td>{account.type}</td><td className="right positive">+{account.roi}%</td><td className="right">{account.drawdown}%</td><td>{account.audit}</td><td><span className={`status-tag ${account.status.toLowerCase()}`}>{account.status}</span></td></tr>)}</tbody></table></div></section>
    <p className="demo-caption">Admin data is illustrative only. Connect authentication, authorization, and audited server-side actions before production use.</p>
  </main>;
}

export default App;
