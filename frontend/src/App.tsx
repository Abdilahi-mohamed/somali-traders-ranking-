import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
  | { type: "forex"; platform: "MT4" | "MT5"; brokerName: string; server: string; accountNumber: string; currency: string; showBalance: boolean }
  | { type: "crypto"; exchange: "Binance" | "Bybit" | "OKX" | "Other"; accountLabel: string; showBalance: boolean };

const api = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
};

function Icon({ children }: { children: string }) {
  return <span className="material-symbols-outlined icon" aria-hidden="true">{children}</span>;
}

function Header() {
  const { data: providerStatus } = useApi<{ configured: boolean }>("/api/metaapi/status");
  return <header className="topbar">
    <Link className="brand" to="/"><span className="brand-mark">ST</span><span>SomaliTraders<span className="green">Rank</span></span></Link>
    <nav className="topnav">
      <NavLink to="/">Leaderboard</NavLink><a href="#awards">Annual Awards</a><a href="#method">How Verification Works</a>
    </nav>
    <div className="top-actions"><span className="live-pill">{providerStatus ? providerStatus.configured ? "MetaApi configured" : "Integration unavailable" : "Checking integration"}</span><Link className="text-link" to="/admin/login">Admin login</Link><Link className="button button-primary small" to="/register">Register <Icon>arrow_forward</Icon></Link></div>
  </header>;
}

function App() {
  const location = useLocation();
  const isDashboard = location.pathname === "/dashboard" || location.pathname.startsWith("/admin");
  return <>{isDashboard ? <PortalHeader /> : <Header />}<Routes>
    <Route path="/" element={<Leaderboard />} />
    <Route path="/register" element={<Register />} />
    <Route path="/dashboard" element={<TraderDashboard />} />
    <Route path="/admin/login" element={<AdminLogin />} />
    <Route path="/admin" element={<AdminGate />} />
    <Route path="*" element={<Leaderboard />} />
  </Routes></>;
}

function PortalHeader() {
  return <header className="portal-header"><Link className="brand" to="/"><span className="brand-mark">ST</span><span>Trader<span className="green">Hub</span></span></Link><nav className="portal-nav"><NavLink to="/dashboard">Overview</NavLink><a href="#accounts">Trading accounts</a><Link to="/#awards">Awards status</Link><NavLink to="/admin">Admin console</NavLink></nav><div className="top-actions"><span className="live-pill">Read-only account data</span><Link className="button button-light small" to="/">Public leaderboard</Link></div></header>;
}

function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api<T>(path).then((result) => {
      if (active) setData(result);
    }).catch((cause: Error) => {
      if (active) setError(cause.message);
    });
    return () => { active = false; };
  }, [path]);
  return { data, error };
}

function LoadError({ message }: { message: string }) {
  return <div className="notice error-notice">Could not load live data: {message}. Start the backend API and refresh.</div>;
}

function Leaderboard() {
  const { data, error } = useApi<{ traders: Trader[]; total: number }>("/api/leaderboard");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const rows = (data?.traders ?? []).filter((trader) => `${trader.name} ${trader.city} ${trader.account} ${trader.platform}`.toLowerCase().includes(query.toLowerCase()))
    .filter((trader) => region === "all" || trader.city.toLowerCase() === region.toLowerCase());
  return <main className="public-page">
    <section className="ranking-intro">
      <div><p className="eyebrow">Somalia &amp; global diaspora</p><h1>Somali Trader Rankings</h1><p>Only independently verified Live/Real accounts are ranked by provider-synchronized ROI.</p></div>
      <Link className="button button-primary" to="/register"><Icon>person_add</Icon> Register as a trader</Link>
    </section>
    {error && <LoadError message={error} />}
    <section className="filter-panel">
      <div className="filter-main"><label className="searchbox"><Icon>search</Icon><input aria-label="Search traders" placeholder="Search trader, broker, or city..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Filter by region" value={region} onChange={(event) => setRegion(event.target.value)}><option value="all">All regions</option><option value="boorama">Boorama</option><option value="hargeysa">Hargeysa</option><option value="muqdisho">Muqdisho</option><option value="garoowe">Garoowe</option><option value="qurbaha / diaspora">Qurbaha / Diaspora</option></select></div>
      <div className="tag-row"><span className="eyebrow">Eligibility</span><span className="chip active-chip">Verified Live/Real · {data?.total ?? "—"}</span></div>
    </section>
    <section className="leader-layout single-leader">
      <div className="table-card">
        <div className="table-heading"><div><h2>Verified Real Trader Ranking</h2><span className="status-tag">{data?.total ?? "—"} accounts</span></div><span className="sync-status">MetaApi data only</span></div>
        <div className="table-scroll"><table className="leader-table"><thead><tr><th>Rank</th><th>Trader &amp; origin</th><th>Broker / platform</th><th className="right">ROI</th><th className="right">Total PNL</th><th className="right">Observed Max DD</th><th className="right">Win rate</th><th className="right">Equity</th></tr></thead><tbody>
          {rows.map((trader, index) => <tr key={trader.id}><td><span className="rank">{index + 1}</span></td><td><div className="person-cell"><span className="avatar">{trader.initials}</span><span><b>{trader.name}</b><small>{trader.city}</small></span></div></td><td><b>{trader.account}</b><small>{trader.platform} · Read-only</small></td><td className={`right ${trader.roi >= 0 ? "positive" : "negative"}`}>{trader.roi.toFixed(2)}%</td><td className="right">{trader.pnl == null ? "—" : `${trader.pnl.toLocaleString()} ${trader.currency ?? ""}`}</td><td className="right">{trader.drawdown == null ? "—" : `${trader.drawdown.toFixed(2)}%`}</td><td className="right">{trader.winRate == null ? "—" : `${trader.winRate.toFixed(2)}%`}</td><td className="right">{trader.equity == null ? "—" : `${trader.equity.toLocaleString()} ${trader.currency ?? ""}`}</td></tr>)}
          {!rows.length && <tr><td className="empty-row" colSpan={8}>No Verified Real accounts are available yet. Only accounts confirmed by MetaApi qualify.</td></tr>}
        </tbody></table></div>
        <div className="table-footer"><span>Showing {rows.length} of {data?.total ?? "—"} Verified Real accounts</span></div>
      </div>
    </section>
    <section className="trust-strip" id="method"><span className="trust-icon"><Icon>shield</Icon></span><div><h2>Read-only verification</h2><p>Only accounts confirmed by MetaApi as REAL are listed in the official ranking. Account screenshots and manual performance claims do not qualify.</p></div><div className="broker-list"><b>Provider integrations</b><b>MetaApi</b></div></section>
    <section className="trust-strip" id="awards"><span className="trust-icon"><Icon>emoji_events</Icon></span><div><h2>Annual Global Trader Awards</h2><p>Only Verified Real accounts are eligible. Demo and unverified accounts are excluded; award scoring will remain unavailable until formal criteria are configured.</p></div></section>
    <footer className="footer"><span>© 2026 SomaliTraders Rank</span><span>Provider-synchronized metrics · Not financial advice</span><Link to="/admin">Admin console</Link><Link to="/dashboard">Trader portal</Link></footer>
  </main>;
}

function Register() {
  const { data: metaApiStatus } = useApi<{ configured: boolean; status: string; message: string }>("/api/metaapi/status");
  const [step, setStep] = useState(1);
  const [accountType, setAccountType] = useState<"forex" | "crypto">("forex");
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
  const [investorPassword, setInvestorPassword] = useState("");
  const [connectOnRegistration, setConnectOnRegistration] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("");

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
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    setConnectOnRegistration(submitter instanceof HTMLButtonElement && submitter.value === "connect");
    const visibleBalance = formData.get("showBalance") === "on";
    if (accountType === "forex") {
      const platform = formData.get("platform") === "MT4" ? "MT4" : "MT5";
      setAccountDetails({
        type: "forex",
        platform,
        brokerName: String(formData.get("brokerName") ?? ""),
        server: String(formData.get("server") ?? ""),
        accountNumber: String(formData.get("accountNumber") ?? ""),
        currency: String(formData.get("currency") ?? "").toUpperCase(),
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
        body: JSON.stringify({
          ...profile,
          password,
          consent: true,
          account: accountDetails.type === "forex" && connectOnRegistration && investorPassword && metaApiStatus?.configured
            ? { ...accountDetails, investorPassword }
            : accountDetails
        })
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
      setConnectionStatus(typeof result.connectionStatus === "string" ? result.connectionStatus : "not_connected");
      if (typeof result.accessToken === "string") sessionStorage.setItem("traderAccessToken", result.accessToken);
      if (typeof result.refreshToken === "string") sessionStorage.setItem("traderRefreshToken", result.refreshToken);
      setPassword("");
      setConfirmPassword("");
      setInvestorPassword("");
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
        {submitted ? <div className="registration-result" role="status"><span className="result-icon"><Icon>{connectionStatus === "connecting" ? "sync" : "check_circle"}</Icon></span><h2>Registration received</h2><p>Your profile is saved. {emailConfirmationRequired ? "Check your email to confirm your address. " : ""}Account connection status: <b>{connectionStatus.replace(/_/g, " ")}</b>. Registration was not blocked by connection availability. Keep your registration reference: <code>{registeredId}</code>.</p><Link className="button button-primary" to="/dashboard">Trading account settings</Link></div> : <>
          {step === 1 && <form className="registration-form" onSubmit={continueProfile}>
            <div className="form-section-title"><span>01</span><div><h2>Your public profile</h2><p>These details identify your trader profile.</p></div></div>
            <div className="form-grid"><label>Full name<input name="fullName" autoComplete="name" defaultValue={profile?.fullName ?? ""} required placeholder="Your full name" /></label><label>Trading alias<input name="alias" defaultValue={profile?.alias ?? ""} required placeholder="Name shown on leaderboard" /></label><label>Email address<input name="email" type="email" autoComplete="email" defaultValue={profile?.email ?? ""} required placeholder="you@example.com" /></label><label>Phone / WhatsApp<input name="phone" type="tel" autoComplete="tel" defaultValue={profile?.phone ?? ""} required placeholder="+252 63 000 0000" /></label><label>City / region<select name="region" defaultValue={profile?.region ?? ""} required><option value="" disabled>Select your region</option><option>Boorama</option><option>Hargeysa</option><option>Muqdisho</option><option>Garoowe</option><option>Qurbaha / Diaspora</option></select></label><label>Telegram or social profile <span className="optional">Optional</span><input name="social" defaultValue={profile?.social ?? ""} placeholder="@username or profile URL" /></label><label>Create website password<input name="password" type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 10 characters" /></label><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" /></label></div>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <label className="consent-row"><input type="checkbox" required /> I consent to saving my profile and selected account details in Supabase. Supabase Auth manages my website password.</label>
            <div className="form-actions"><span>Next: account details</span><button className="button button-primary" type="submit">Continue <Icon>arrow_forward</Icon></button></div>
          </form>}
          {step === 2 && <form className="registration-form" onSubmit={continueAccount}>
            <div className="form-section-title"><span>02</span><div><h2>Trading account information</h2><p>Enter your MT4/MT5 account details. Account type is determined by the broker, never selected here.</p></div></div>
            <div className="account-kind-tabs"><button type="button" onClick={() => setAccountType("forex")} className={accountType === "forex" ? "selected" : ""}><Icon>candlestick_chart</Icon> Forex / Prop firm</button><button type="button" onClick={() => setAccountType("crypto")} className={accountType === "crypto" ? "selected" : ""}><Icon>currency_bitcoin</Icon> Crypto</button></div>
            {accountType === "forex" ? <div className="form-grid"><label>Trading platform<select name="platform" defaultValue="MT5"><option>MT4</option><option>MT5</option></select></label><label>Broker name<input name="brokerName" required placeholder="e.g. Exness, IC Markets" /></label><label>Account Login ID<input name="accountNumber" required inputMode="numeric" pattern="[0-9]{4,20}" placeholder="4–20 digits" /></label><label>Broker server<input name="server" required placeholder="Exact server name" /></label><label>Account currency<input name="currency" required autoComplete="off" maxLength={3} pattern="[A-Za-z]{3}" placeholder="e.g. USD" /></label><label className="full-span">Investor Password (Optional – Read-Only Access)<input type="password" name="investorPassword" autoComplete="off" maxLength={256} value={investorPassword} onChange={(event) => setInvestorPassword(event.target.value)} aria-describedby="investor-password-help" /><small id="investor-password-help">Enter your MT4/MT5 Investor Password to securely connect your trading account and retrieve its available balance, equity, trading history, and performance statistics. This access is intended for read-only monitoring and does not authorize trading or withdrawals.</small></label><div className={`secure-connect full-span ${metaApiStatus && !metaApiStatus.configured ? "integration-unavailable" : ""}`} aria-live="polite"><Icon>{metaApiStatus?.configured ? "verified_user" : "info"}</Icon><div><b>{metaApiStatus ? metaApiStatus.configured ? "MetaApi integration configured" : "Integration Not Configured" : "Checking MetaApi integration status…"}</b><p>{metaApiStatus?.message ?? "Checking MetaApi integration status…"}</p></div></div></div> : <div className="form-grid"><label>Exchange<select name="exchange" defaultValue="" required><option value="" disabled>Select exchange</option><option>Binance</option><option>Bybit</option><option>OKX</option><option>Other</option></select></label><label>Account label<input name="accountLabel" placeholder="Optional label" /></label><div className="secure-connect full-span"><Icon>lock</Icon><div><b>API key connection is not available in this demo</b><p>Do not paste API keys or secrets here. A production integration should use an official authorization flow restricted to read-only access, with withdrawals and trading disabled.</p></div></div></div>}
            <label className="toggle-row"><input name="showBalance" type="checkbox" checked={showBalance} onChange={(event) => setShowBalance(event.target.checked)} /><span><b>Show balance publicly</b><small>When off, the public profile shows performance percentages only.</small></span><span className={`toggle ${showBalance ? "on" : ""}`} aria-hidden="true"><i /></span></label>
            {registrationError && <p className="form-error" role="alert">{registrationError}</p>}
            <div className="form-actions"><button className="button button-light" onClick={() => setStep(1)} type="button">Back</button><button className="button button-primary" type="submit" name="connectionIntent" value="connect">Connect Trading Account <Icon>link</Icon></button><button className="button button-light" type="submit" name="connectionIntent" value="later">Connect Later <Icon>arrow_forward</Icon></button></div>
          </form>}
          {step === 3 && <div className="registration-form">
            <div className="form-section-title"><span>03</span><div><h2>Review &amp; finish</h2><p>Review the profile and account details before saving.</p></div></div>
            <div className="review-list"><p><Icon>check_circle</Icon> Your profile and account metadata will be saved in Supabase.</p><p><Icon>lock</Icon> Supabase Auth manages your website password; this app does not store it in the profile database.</p><p><Icon>lock</Icon> The Investor Password is sent only to the backend when MetaApi is configured and you chose Connect Trading Account. It is not stored in this platform's database.</p></div>
            <div className="secure-connect"><Icon>{connectOnRegistration && investorPassword && metaApiStatus?.configured ? "sync" : "info"}</Icon><div><b>{connectOnRegistration && investorPassword && metaApiStatus?.configured ? "MetaApi will connect after registration" : "You can connect later"}</b><p>{connectOnRegistration && investorPassword && metaApiStatus?.configured ? "Registration completes independently; connection status will be reported separately." : metaApiStatus?.message ?? "You can finish registration without connecting a trading account."}</p></div></div>
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
  type Account = {
    id: string;
    platform: string | null;
    broker_name: string | null;
    server_name: string | null;
    account_number: string | null;
    account_currency: string | null;
    connection_status: string;
    connection_message: string | null;
    verified_account_type: string | null;
    ownership_verified: boolean | null;
    has_connection: boolean;
    balance: number | null;
    equity: number | null;
    total_pnl: number | null;
    roi: number | null;
    win_rate: number | null;
    maximum_drawdown: number | null;
    last_successful_sync_at: string | null;
  };
  const [accessToken, setAccessToken] = useState(() => sessionStorage.getItem("traderAccessToken") ?? "");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [email, setEmail] = useState("");
  const [websitePassword, setWebsitePassword] = useState("");
  const [investorPassword, setInvestorPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyAccount, setBusyAccount] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadId, setReloadId] = useState(0);
  const { data: providerStatus } = useApi<{ configured: boolean; message: string }>("/api/metaapi/status");

  useEffect(() => {
    if (!accessToken) {
      setAccounts([]);
      return;
    }
    let active = true;
    let timer: number | undefined;
    async function loadAccounts() {
      setLoading(true);
      try {
        const response = await fetch("/api/trader/accounts", {
          credentials: "include",
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (response.status === 401) {
          sessionStorage.removeItem("traderAccessToken");
          sessionStorage.removeItem("traderRefreshToken");
          if (active) setAccessToken("");
          return;
        }
        const result = await response.json() as { accounts?: Account[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load trading accounts.");
        if (active) {
          setError("");
          const nextAccounts = result.accounts ?? [];
          setAccounts(nextAccounts);
          if (nextAccounts.some((account) => account.connection_status === "connecting")) {
            timer = window.setTimeout(loadAccounts, 3000);
          }
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load trading accounts.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadAccounts();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [accessToken, reloadId]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch("/api/trader/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: websitePassword })
      });
      const result = await response.json() as { accessToken?: string; refreshToken?: string; error?: string };
      if (!response.ok || !result.accessToken) throw new Error(result.error ?? "Sign-in failed.");
      sessionStorage.setItem("traderAccessToken", result.accessToken);
      if (result.refreshToken) sessionStorage.setItem("traderRefreshToken", result.refreshToken);
      setWebsitePassword("");
      setAccessToken(result.accessToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    }
  }

  async function accountAction(accountId: string, action: "connect" | "refresh" | "disconnect") {
    if (action === "disconnect" && !window.confirm("Disconnect this trading account and remove its MetaApi connection?")) return;
    setError("");
    setNotice("");
    setBusyAccount(accountId);
    try {
      const response = await fetch(`/api/trader/accounts/${encodeURIComponent(accountId)}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: action === "connect" ? JSON.stringify({ investorPassword }) : undefined
      });
      const result = await response.json() as { status?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Account action failed.");
      setNotice(result.status ? `Account status: ${result.status.replace(/_/g, " ")}.` : "Account updated.");
      setInvestorPassword("");
      setReloadId((current) => current + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Account action failed.");
    } finally {
      setBusyAccount("");
    }
  }

  function signOut() {
    sessionStorage.removeItem("traderAccessToken");
    sessionStorage.removeItem("traderRefreshToken");
    setAccessToken("");
  }

  const statusLabel = (status: string) => {
    if (status === "demo_account") return "Demo Account — Rejected";
    if (status === "contest_account") return "Contest Account — Rejected";
    return status.replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
  };
  const canDisconnect = (account: Account) => account.has_connection && !["connecting", "disconnected"].includes(account.connection_status);
  const canRefresh = (account: Account) => providerStatus?.configured && account.has_connection &&
    ["connected", "verified_real", "demo_account", "contest_account", "pending_verification"].includes(account.connection_status);
  const formatMoney = (value: number | null, currency: string | null) => value === null ? "—" : `${value.toLocaleString()} ${currency ?? ""}`.trim();

  return <main className="portal-page">
    <div className="welcome-row"><div><div className="eyebrow">Trading account dashboard</div><h1>Your accounts</h1><p className="subtle">MetaApi investor-mode confirmation is required before an account can be ranked.</p></div>{accessToken && <button className="button button-light" onClick={signOut}><Icon>logout</Icon> Sign out</button>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {!accessToken ? <section className="panel admin-login-panel">
      <div className="form-section-title"><span><Icon>lock</Icon></span><div><h2>Trader sign-in</h2><p>Sign in to manage your own trading accounts.</p></div></div>
      <form className="admin-login-form" onSubmit={signIn}>
        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Website password<input type="password" autoComplete="current-password" required value={websitePassword} onChange={(event) => setWebsitePassword(event.target.value)} /></label>
        <button className="button button-primary" type="submit">Sign in</button>
      </form>
    </section> : loading && !accounts.length ? <div className="notice">Loading trading accounts…</div> : accounts.length ? accounts.map((account) => {
      const summary: Array<[string, string]> = [
        ["Account Type", account.verified_account_type ?? (account.connection_status === "demo_account" ? "DEMO" : account.connection_status === "contest_account" ? "CONTEST" : "Pending Verification")],
        ["Balance", formatMoney(account.balance, account.account_currency)],
        ["Equity", formatMoney(account.equity, account.account_currency)],
        ["Total PNL", formatMoney(account.total_pnl, account.account_currency)],
        ["ROI", account.roi === null ? "—" : `${account.roi.toFixed(2)}%`],
        ["Win Rate", account.win_rate === null ? "—" : `${account.win_rate.toFixed(2)}%`],
        ["Observed Maximum Drawdown", account.maximum_drawdown === null ? "—" : `${account.maximum_drawdown.toFixed(2)}%`],
        ["Last Successful Synchronization", account.last_successful_sync_at ? new Date(account.last_successful_sync_at).toLocaleString() : "—"]
      ];
      return <section className="panel accounts-panel" id="accounts" key={account.id}>
        <div className="panel-heading">
          <div><h2>{account.broker_name ?? "Trading account"} · {account.platform ?? "MT4/MT5"}</h2><p>Login {account.account_number ?? "—"} · {account.server_name ?? "—"}</p></div>
          <span className={`status-tag ${["connection_failed", "demo_account", "contest_account"].includes(account.connection_status) ? "flagged" : account.connection_status === "pending_verification" ? "pending" : ""}`}>{statusLabel(account.connection_status)}</span>
        </div>
        <div className="account-summary-grid">{summary.map(([label, value]) => <div key={label}><small>{label}</small><b>{value}</b></div>)}</div>
        <div className="account-settings">
          {account.connection_message && <p className="form-error" role="status">{account.connection_message}</p>}
          {account.connection_status === "pending_verification" && account.ownership_verified !== true && <p className="secure-connect"><Icon>info</Icon><span>{account.ownership_verified === false ? "The provider account holder name could not be matched to your profile." : "Account ownership has not been verified."} This account remains Pending Verification and is excluded from rankings. Contact support if your broker's name format differs.</span></p>}
          {account.connection_status === "pending_verification" && account.ownership_verified === true && !account.verified_account_type && <p className="secure-connect"><Icon>info</Icon><span>MetaApi did not provide an authoritative account mode. This account remains Pending Verification and is excluded from rankings.</span></p>}
          <label>Investor Password (Optional – Read-Only Access)
            <input type="password" autoComplete="off" maxLength={256} value={investorPassword} onChange={(event) => setInvestorPassword(event.target.value)} />
            <small>Enter your MT4/MT5 Investor Password to securely connect your trading account and retrieve its available balance, equity, trading history, and performance statistics. This access is intended for read-only monitoring and does not authorize trading or withdrawals.</small>
          </label>
          {providerStatus && !providerStatus.configured && <div className="secure-connect integration-unavailable"><Icon>info</Icon><div><b>Integration Not Configured</b><p>{providerStatus.message}</p></div></div>}
          {!account.has_connection && <p className="subtle">Credentials are sent to MetaApi by the backend and are not stored in this platform's database.</p>}
          <div className="account-actions">
            <button className="button button-primary" disabled={!providerStatus?.configured || busyAccount === account.id || account.connection_status === "connecting" || !investorPassword} onClick={() => accountAction(account.id, "connect")}><Icon>link</Icon> {account.has_connection ? "Replace Credentials" : "Connect Trading Account"}</button>
            <button className="button button-light" disabled={busyAccount === account.id || !canRefresh(account)} onClick={() => accountAction(account.id, "refresh")}><Icon>sync</Icon> Refresh Account Data</button>
            <button className="button button-light" disabled={busyAccount === account.id || !canDisconnect(account)} onClick={() => accountAction(account.id, "disconnect")}><Icon>link_off</Icon> Disconnect Account</button>
          </div>
          {busyAccount === account.id && <p className="subtle" role="status"><span className="loading-spinner" /> Connecting…</p>}
        </div>
        {canRefresh(account) && <OpenPositions accountId={account.id} accessToken={accessToken} />}
      </section>;
    }) : <section className="panel accounts-panel"><div className="panel-heading"><div><h2>No trading accounts found</h2><p>Complete registration to add your MT4/MT5 account metadata.</p></div><Link className="button button-primary" to="/register">Register as a trader</Link></div></section>}
  </main>;
}

function OpenPositions({ accountId, accessToken }: { accountId: string; accessToken: string }) {
  type Position = {
    position_id: string;
    position_type: string;
    symbol: string;
    volume: number;
    opened_at: string;
    open_price: number;
    current_price: number | null;
    profit: number | null;
    swap: number | null;
  };
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function togglePositions() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (!positions) {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/trader/accounts/${encodeURIComponent(accountId)}/positions`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const result = await response.json() as { positions?: Position[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load open positions.");
        setPositions(result.positions ?? []);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load open positions.");
      } finally {
        setLoading(false);
      }
    }
    setExpanded(true);
  }

  return <div className="open-positions">
    <button className="button button-light" onClick={togglePositions} disabled={loading}>
      <Icon>list_alt</Icon> {loading ? "Loading…" : expanded ? "Hide Open Positions" : "View Open Positions"}
    </button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {expanded && positions && (positions.length ? <div className="table-scroll"><table className="admin-table"><thead><tr><th>Symbol</th><th>Side</th><th>Volume</th><th>Open Price</th><th>Current Price</th><th>Profit</th><th>Opened</th></tr></thead><tbody>{positions.map((position) => <tr key={position.position_id}><td>{position.symbol}</td><td>{position.position_type.replace(/^POSITION_TYPE_/, "")}</td><td>{position.volume}</td><td>{position.open_price}</td><td>{position.current_price ?? "—"}</td><td>{position.profit == null ? "—" : `${position.profit.toLocaleString()}${position.swap == null ? "" : ` · swap ${position.swap.toLocaleString()}`}`}</td><td>{new Date(position.opened_at).toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="subtle">No open positions were returned for this account.</p>)}
  </div>;
}

function Metric({ title, value, note, icon, green = false }: { title: string; value: string; note: string; icon: string; green?: boolean }) {
  return <div className="metric-card"><div className="metric-title">{title}<span className="metric-icon"><Icon>{icon}</Icon></span></div><b className={green ? "positive" : ""}>{value}</b><small>{note}</small></div>;
}

function MetricMini({ label, value }: { label: string; value: string | number }) {
  return <div><small>{label}</small><b>{value}</b></div>;
}

function AdminConsole() {
  const navigate = useNavigate();
  const { data, error } = useApi<{
    registeredTraders: number;
    verifiedTraders: number;
    pendingVerifications: number;
    flaggedAccounts: number;
    synchronizationEnabled: boolean;
    accounts: Array<{ name: string; city: string; email: string; broker: string; id: string; type: string; roi: number | null; drawdown: number | null; audit: string; status: string }>;
  }>("/api/admin/overview");
  const [filter, setFilter] = useState("All");
  const [logoutError, setLogoutError] = useState("");
  const accounts = (data?.accounts ?? []).filter((account) => filter === "All" || account.status === filter);
  async function logout() {
    setLogoutError("");
    try {
      const response = await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
      if (!response.ok) {
        setLogoutError("Could not sign out. Please try again.");
        return;
      }
      navigate("/admin/login", { replace: true });
    } catch {
      setLogoutError("Could not reach the server. Please try again.");
    }
  }
  return <main className="portal-page admin-page">
    {error && <LoadError message={error} />}
    <div className="welcome-row admin-title"><div><div className="eyebrow"><span className="secure-label"><Icon>shield</Icon> Authenticated console · Live database</span> Federation engine</div><h1>Super Admin Control Center</h1></div><button className="button button-light" onClick={logout}><Icon>logout</Icon> Sign out</button></div>
    {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
    <section className="metric-grid"><Metric title="Registered traders" value={`${data?.registeredTraders ?? "—"}`} note={`${data?.verifiedTraders ?? "—"} with Verified Real accounts`} icon="groups" /><Metric title="Pending connections" value={`${data?.pendingVerifications ?? "—"}`} note="No account type assumed" icon="hourglass_top" /><Metric title="Connection failures" value={`${data?.flaggedAccounts ?? "—"}`} note="Provider-reported failures" icon="warning" /><Metric title="Scheduled synchronization" value={data ? data.synchronizationEnabled ? "Configured" : "Unavailable" : "—"} note="15-minute in-process schedule" icon="bolt" green={data?.synchronizationEnabled} /></section>
    <section className="season-banner" id="awards"><div><span className="season-chip">Awards eligibility</span><h2>Annual Global Trader Awards</h2><p>Only Verified Real accounts are eligible. Demo and unverified accounts are excluded; award scoring is not available until ranking criteria are configured.</p></div><div className="season-kpis"><span>Verified Real required <b>Yes</b></span><span>Demo eligibility <b>No</b></span></div></section>
    <section className="panel moderation-panel"><div className="panel-heading"><div><h2>Accounts &amp; trader moderation</h2><p>Provider-derived account status and synchronized metrics.</p></div><div className="filter-tabs">{["All", "Not Connected", "Connecting", "Connected", "Verified Real", "Demo Account", "Pending Verification", "Connection Failed", "Integration Not Configured", "Disconnected"].map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div></div><div className="table-scroll"><table className="admin-table"><thead><tr><th>Trader</th><th>Platform &amp; server</th><th>Class</th><th className="right">ROI</th><th className="right">Max DD</th><th>Synchronization</th><th>Status</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td><b>{account.name}</b><small>{account.city} · {account.email}</small></td><td><b>{account.broker}</b><small>{account.id}</small></td><td>{account.type}</td><td className="right">{account.roi == null ? "—" : `${account.roi.toFixed(2)}%`}</td><td className="right">{account.drawdown == null ? "—" : `${account.drawdown.toFixed(2)}%`}</td><td>{account.audit}</td><td><span className={`status-tag ${account.status.toLowerCase().replace(/ /g, "-")}`}>{account.status}</span></td></tr>)}</tbody></table>{!accounts.length && <p className="notice">No accounts match this status.</p>}</div></section>
    <p className="demo-caption">All listed statuses and metrics are read from the database. No verification or performance data is manually generated.</p>
  </main>;
}

function AdminGate() {
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/session", { credentials: "include" })
      .then((response) => {
        if (active) {
          setAuthorized(response.ok);
          setChecking(false);
        }
      })
      .catch(() => {
        if (active) {
          setAuthorized(false);
          setChecking(false);
        }
      });
    return () => { active = false; };
  }, []);

  if (checking) return <main className="portal-page"><p className="subtle">Checking administrator access…</p></main>;
  return authorized ? <AdminConsole /> : <Navigate to="/admin/login" replace />;
}

function AdminLogin() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: formData.get("username"), password: formData.get("password") })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Sign-in failed.");
      navigate("/admin", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <main className="register-page admin-login-page">
    <section className="panel admin-login-panel">
      <div className="form-section-title"><span><Icon>shield_lock</Icon></span><div><h1>Super Admin Login</h1><p>Sign in with your administrator username and password.</p></div></div>
      <form className="admin-login-form" onSubmit={submitLogin}>
        <label>Username<input name="username" autoComplete="username" required minLength={3} maxLength={32} /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={128} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"} <Icon>arrow_forward</Icon></button>
      </form>
      <p className="admin-login-note">Administrator accounts are provisioned privately by the project owner. Public registration cannot create admin access.</p>
      <Link className="text-link" to="/">← Return to public leaderboard</Link>
    </section>
  </main>;
}

export default App;
