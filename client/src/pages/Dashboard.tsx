import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RefreshCw, CheckCircle, ShieldCheck, Gift, Star, ExternalLink,
  MessageSquare, TrendingUp, TrendingDown, Zap, Layers, BookOpen,
  Calculator, Clock, AlertCircle, Bell, Info,
  FlaskConical, Banknote, Home, Wrench,
} from "lucide-react";
import { BettingChatBox } from "@/components/BettingChatBox";
import { BettingCalculators } from "@/components/BettingCalculators";
import { OnboardingModal, useOnboarding } from "@/components/OnboardingModal";
import type { Opportunity } from "../../../drizzle/schema";

const SICKPUNT_LOGO_URL = "https://i.imgur.com/4k1Ov7i.png";

// ── Paper trading helpers ─────────────────────────────────────────────────────
const PAPER_KEY = "sp_paper_bets";
type PaperBet = {
  id: string; event: string; bookmaker: string; odds: number;
  stake: number; outcome: string; status: "pending" | "won" | "lost";
  loggedAt: string;
};
function getPaperBets(): PaperBet[] {
  try { return JSON.parse(localStorage.getItem(PAPER_KEY) || "[]"); } catch { return []; }
}
function savePaperBets(bets: PaperBet[]) {
  localStorage.setItem(PAPER_KEY, JSON.stringify(bets));
}
function addPaperBet(bet: Omit<PaperBet, "id" | "loggedAt">) {
  const bets = getPaperBets();
  bets.unshift({ ...bet, id: `paper_${Date.now()}`, loggedAt: new Date().toISOString() });
  savePaperBets(bets);
}
function settlePaperBet(id: string, status: "won" | "lost") {
  const bets = getPaperBets().map(b => b.id === id ? { ...b, status } : b);
  savePaperBets(bets);
}

// ── Arbitrage stake calculation ───────────────────────────────────────────────
function calcArbStakes(odds1: number, odds2: number, totalStake: number) {
  const imp1 = 1 / odds1;
  const imp2 = 1 / odds2;
  const total = imp1 + imp2;
  const stake1 = (imp1 / total) * totalStake;
  const stake2 = (imp2 / total) * totalStake;
  const profit = Math.min(stake1 * odds1, stake2 * odds2) - totalStake;
  return {
    stake1: stake1.toFixed(2),
    stake2: stake2.toFixed(2),
    roi: ((profit / totalStake) * 100).toFixed(2),
    profit: profit.toFixed(2),
  };
}

// ── Bookmaker URL map ─────────────────────────────────────────────────────────
function getBookmakerUrl(name: string): string {
  const map: Record<string, string> = {
    sportsbet: "https://www.sportsbet.com.au",
    ladbrokes: "https://www.ladbrokes.com.au",
    tab: "https://www.tab.com.au",
    neds: "https://www.neds.com.au",
    bet365: "https://www.bet365.com.au",
    betfair: "https://www.betfair.com.au",
    unibet: "https://www.unibet.com.au",
    pointsbet: "https://www.pointsbet.com.au",
    bluebet: "https://www.bluebet.com.au",
    palmerbet: "https://www.palmerbet.com.au",
    betr: "https://www.betr.com.au",
    bookmaker: "https://www.bookmaker.com.au",
    topsport: "https://www.topsport.com.au",
    betright: "https://www.betright.com.au",
    swiftbet: "https://www.swiftbet.com.au",
    playup: "https://www.playup.com.au",
  };
  const key = name.toLowerCase().replace(/[\s.]/g, "");
  return map[key] || `https://www.google.com/search?q=${encodeURIComponent(name + " australia betting")}`;
}

type ConfirmBet = {
  type: "standard" | "promo";
  eventName: string;
  legs: { bookmaker: string; odds: number; outcome: string; url: string }[];
  promo?: { name: string; terms: string; bookmaker: string; url: string };
};

function tierColour(tier: string | null | undefined) {
  const t = (tier || "").toLowerCase();
  if (t === "tier 1" || t === "1") return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (t === "tier 2" || t === "2") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return "bg-slate-700/40 text-slate-400 border-slate-600/30";
}

// ── Shared glass card style ───────────────────────────────────────────────────
const glass = "bg-[rgba(30,41,59,0.4)] backdrop-blur-xl border border-white/5 rounded-2xl";
const goldText = "text-[#D4AF37]";
const goldBorder = "border-[#D4AF37]/30";
const goldBg = "bg-[#D4AF37]";

// ── Odds pill ─────────────────────────────────────────────────────────────────
function OddsPill({ odds }: { odds: number }) {
  return (
    <span className="inline-block bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] font-black text-sm px-2.5 py-0.5 rounded-lg">
      {odds.toFixed(2)}
    </span>
  );
}

// ── ROI badge ─────────────────────────────────────────────────────────────────
function RoiBadge({ roi }: { roi: number }) {
  const cls = roi >= 5 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    : roi >= 2 ? "bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/30"
    : "bg-slate-700/40 text-slate-400 border-slate-600/30";
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {roi.toFixed(2)}% ROI
    </span>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────
function SectionHeading({ title, count, unit }: { title: string; count?: number; unit?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-bold text-base text-white">{title}</h2>
      {count !== undefined && (
        <span className="text-xs text-slate-500">{count} {unit || ""}</span>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, message, sub }: { icon: React.ElementType; message: string; sub?: string }) {
  return (
    <div className={`${glass} p-8 text-center`}>
      <Icon className="h-10 w-10 text-slate-600 mx-auto mb-3" />
      <p className="text-slate-400 text-sm font-medium">{message}</p>
      {sub && <p className="text-slate-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Onboarding
  const { open: showOnboarding, dismiss: dismissOnboarding } = useOnboarding();

  // Paper trading mode
  const [paperMode, setPaperMode] = useState(() => localStorage.getItem("sp_paper_mode") === "true");
  const [paperBets, setPaperBets] = useState<ReturnType<typeof getPaperBets>>(getPaperBets);
  const togglePaperMode = () => {
    const next = !paperMode;
    setPaperMode(next);
    localStorage.setItem("sp_paper_mode", String(next));
  };
  const refreshPaperBets = () => setPaperBets(getPaperBets());

  // How it works info dialog
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // Navigation
  const [activeNav, setActiveNav] = useState<"home" | "tools" | "consult" | "history">("home");
  const [activeTool, setActiveTool] = useState<"sports" | "middles" | "promos" | "books" | "calc">("sports");

  // Bet dialogs
  const [placeBetOpp, setPlaceBetOpp] = useState<Opportunity | null>(null);
  const [betStake, setBetStake] = useState("");
  const [betPlaced, setBetPlaced] = useState(false);
  const [confirmBet, setConfirmBet] = useState<ConfirmBet | null>(null);

  // Data
  const { data: opportunities, isLoading: opportunitiesLoading } = trpc.opportunities.list.useQuery();
  const { data: bets } = trpc.bets.list.useQuery();
  const { data: stats } = trpc.bets.stats.useQuery();
  const { data: notifications } = trpc.notifications.unread.useQuery();
  const { data: userBookmakers } = trpc.bookmakers.list.useQuery();
  const { data: imperialStatus, refetch: refetchImperialStatus } = trpc.imperial.status.useQuery();
  const { data: imperialBookmakers } = trpc.imperial.bookmakerIntel.useQuery();
  const { data: imperialPromos } = trpc.imperial.promotions.useQuery();
  const { data: sportsMax, refetch: refetchSportsMax } = trpc.imperial.sportsMax.useQuery();
  const { data: middleMax, refetch: refetchMiddleMax } = trpc.imperial.middleMax.useQuery();

  const triggerImperialIngestion = trpc.imperial.trigger.useMutation();
  const createBetMutation = trpc.bets.create.useMutation();

  const userAccountSet = new Set(
    (userBookmakers || []).map((a) => a.bookmaker.toLowerCase().trim())
  );

  const handlePlaceBets = async () => {
    if (!placeBetOpp || !betStake) return;
    const totalStake = parseFloat(betStake);
    if (isNaN(totalStake) || totalStake <= 0) return;
    const odds1 = parseFloat(placeBetOpp.odds1);
    const odds2 = parseFloat(placeBetOpp.odds2);
    const { stake1, stake2 } = calcArbStakes(odds1, odds2, totalStake);

    if (paperMode) {
      addPaperBet({ event: String(placeBetOpp.event), bookmaker: placeBetOpp.bookmaker1, odds: odds1, stake: parseFloat(stake1), outcome: String(placeBetOpp.outcome1), status: "pending" });
      addPaperBet({ event: String(placeBetOpp.event), bookmaker: placeBetOpp.bookmaker2, odds: odds2, stake: parseFloat(stake2), outcome: String(placeBetOpp.outcome2), status: "pending" });
      refreshPaperBets();
    } else {
      await createBetMutation.mutateAsync({
        opportunityId: placeBetOpp.id, bookmaker: placeBetOpp.bookmaker1,
        sport: placeBetOpp.sport, event: String(placeBetOpp.event),
        market: placeBetOpp.market, outcome: String(placeBetOpp.outcome1),
        odds: placeBetOpp.odds1, stake: stake1,
      });
      await createBetMutation.mutateAsync({
        opportunityId: placeBetOpp.id, bookmaker: placeBetOpp.bookmaker2,
        sport: placeBetOpp.sport, event: String(placeBetOpp.event),
        market: placeBetOpp.market, outcome: String(placeBetOpp.outcome2),
        odds: placeBetOpp.odds2, stake: stake2,
      });
    }
    setBetPlaced(true);
    // Open both bookmaker sites so the user can place immediately
    if (!paperMode) {
      window.open(getBookmakerUrl(placeBetOpp.bookmaker1), "_blank", "noopener");
      setTimeout(() => window.open(getBookmakerUrl(placeBetOpp.bookmaker2), "_blank", "noopener"), 400);
    }
    setTimeout(() => { setPlaceBetOpp(null); setBetPlaced(false); setBetStake(""); }, 3000);
  };

  const handleRefreshData = async () => {
    await triggerImperialIngestion.mutateAsync({ mode: "all", pages: 3 });
    await Promise.all([refetchImperialStatus(), refetchSportsMax(), refetchMiddleMax()]);
  };

  const [showAllPromos, setShowAllPromos] = useState(false);

  const promosByBookmaker: Record<string, typeof imperialPromos> = {};
  for (const promo of imperialPromos || []) {
    const bk = (promo.bookmaker || "Unknown").toLowerCase().trim();
    if (!promosByBookmaker[bk]) promosByBookmaker[bk] = [];
    promosByBookmaker[bk]!.push(promo);
  }
  const getPromoForBookmaker = (name: string) =>
    promosByBookmaker[(name || "").toLowerCase().trim()] ?? [];

  // Split promos into eligible (user has account) vs others
  const eligiblePromoEntries = Object.entries(promosByBookmaker).filter(([bk]) => userAccountSet.has(bk));
  const otherPromoEntries = Object.entries(promosByBookmaker).filter(([bk]) => !userAccountSet.has(bk));

  const totalPL = parseFloat(stats?.totalProfit || "0");
  const isPositive = totalPL >= 0;

  // ── Bottom nav items ──
  const navItems = [
    { id: "home" as const,    label: "Home",    icon: Home         },
    { id: "tools" as const,   label: "Tools",   icon: Wrench       },
    { id: "consult" as const, label: "Consult", icon: MessageSquare },
    { id: "history" as const, label: "History", icon: Clock        },
  ];

  const toolTabs = [
    { id: "sports" as const,  label: "Sports Max", icon: Zap       },
    { id: "middles" as const, label: "Middles",    icon: Layers    },
    { id: "promos" as const,  label: "Promos",     icon: Gift      },
    { id: "books" as const,   label: "Books",      icon: BookOpen  },
    { id: "calc" as const,    label: "Calc",       icon: Calculator },
  ];

  return (
    <div className="-m-4 min-h-screen bg-[#020617] text-white pb-20">

      {/* ── Onboarding ── */}
      <OnboardingModal open={showOnboarding} onDone={dismissOnboarding} />

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 pt-5 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <img src={SICKPUNT_LOGO_URL} alt="Sick Punt" className="h-9 w-9 rounded-xl object-cover shadow-lg" />
          <div>
            <p className="text-[11px] text-slate-500">Welcome back</p>
            <p className="text-sm font-bold text-white">{user?.name?.split(" ")[0] || "Punter"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Paper mode toggle */}
          <button
            onClick={togglePaperMode}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${
              paperMode
                ? `bg-[#D4AF37]/15 border-[#D4AF37]/40 ${goldText}`
                : "bg-slate-800/60 border-white/5 text-slate-400 hover:text-slate-200"
            }`}
            title={paperMode ? "Switch to live mode" : "Switch to paper mode"}
          >
            {paperMode ? <FlaskConical className="h-3.5 w-3.5" /> : <Banknote className="h-3.5 w-3.5" />}
            <span>{paperMode ? "Paper" : "Live"}</span>
          </button>

          {/* Notifications */}
          <div className="relative">
            <button className="p-2 rounded-xl bg-slate-800/60 border border-white/5">
              <Bell className="h-4 w-4 text-slate-400" />
            </button>
            {notifications && notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#D4AF37] text-[10px] font-bold flex items-center justify-center text-black">
                {notifications.length}
              </span>
            )}
          </div>

          {/* Admin refresh */}
          {isAdmin && (
            <button
              onClick={handleRefreshData}
              disabled={triggerImperialIngestion.isPending}
              className="p-2 rounded-xl bg-slate-800/60 border border-white/5 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${triggerImperialIngestion.isPending ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      </header>

      {/* ── Paper mode banner ── */}
      {paperMode && (
        <div className={`bg-[#D4AF37]/8 border-b border-[#D4AF37]/20 px-4 py-2.5 flex items-center gap-2`}>
          <FlaskConical className={`h-4 w-4 ${goldText} shrink-0`} />
          <p className={`text-xs ${goldText} font-medium flex-1`}>
            <strong>Paper Mode</strong> — tracking bets virtually. No real money.
          </p>
          <button onClick={togglePaperMode} className={`text-[11px] ${goldText}/70 underline`}>Go Live</button>
        </div>
      )}

      {/* ════════════════════════════════════════
          HOME
      ════════════════════════════════════════ */}
      {activeNav === "home" && (
        <div className="px-4 pt-5 space-y-5">

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`${glass} p-4`}>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-medium">Total P&L</p>
              <p className={`text-2xl font-black mt-1.5 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                {isPositive ? "+" : ""}${stats?.totalProfit || "0.00"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                {isPositive ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                ROI {stats?.roi || "0"}%
              </p>
            </div>
            <div className={`${glass} p-4`}>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-medium">Active Bets</p>
              <p className="text-2xl font-black mt-1.5 text-white">{stats?.pendingBets || 0}</p>
              <p className="text-xs text-slate-500 mt-0.5">Win rate {stats?.winRate || "0"}%</p>
            </div>
            <div className={`${glass} p-4`}>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-medium">Sports Max</p>
              <p className={`text-2xl font-black mt-1.5 ${goldText}`}>{sportsMax?.length || 0}</p>
              <p className="text-xs text-slate-500 mt-0.5">Matched betting opps</p>
            </div>
            <div className={`${glass} p-4`}>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest font-medium">Live Promos</p>
              <p className={`text-2xl font-black mt-1.5 ${goldText}`}>{imperialPromos?.length || 0}</p>
              <p className="text-xs text-slate-500 mt-0.5">Bookmaker offers</p>
            </div>
          </div>

          {/* Data sync status */}
          <div className={`${glass} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-white">Data Sync</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                imperialStatus?.isRunning
                  ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                  : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              }`}>
                {imperialStatus?.isRunning ? "Syncing…" : "Live"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              {[
                ["Sports Max", imperialStatus?.counts?.sportsMaximiser],
                ["Middles", imperialStatus?.counts?.middleMaximiser],
                ["Promos", imperialStatus?.counts?.promotions],
              ].map(([label, count]) => (
                <div key={String(label)} className="bg-slate-800/50 rounded-xl p-2.5">
                  <p className="text-[10px] text-slate-500">{label}</p>
                  <p className="text-lg font-black text-white">{count ?? "—"}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-600">
              Last sync: {imperialStatus?.lastSuccessAt
                ? new Date(imperialStatus.lastSuccessAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "Never"} · Auto-syncs every 15 min
            </p>
            {imperialStatus?.lastError && (
              <div className="mt-2 p-2 rounded-xl border border-red-500/20 bg-red-500/5">
                <p className="text-xs text-red-400 font-semibold">⚠ Last sync failed — tap Refresh to retry</p>
              </div>
            )}
          </div>

          {/* Arbitrage opportunities */}
          <div>
            <SectionHeading title="Arbitrage Opportunities" count={opportunities?.length} unit="found" />
            {opportunitiesLoading ? (
              <div className="text-center py-8 text-slate-500 text-sm">Scanning…</div>
            ) : opportunities && opportunities.length > 0 ? (
              <div className="space-y-3">
                {opportunities.slice(0, 5).map((opp) => {
                  const odds1 = parseFloat(opp.odds1);
                  const odds2 = parseFloat(opp.odds2);
                  const stakes = odds1 > 1 && odds2 > 1
                    ? calcArbStakes(odds1, odds2, parseFloat(opp.recommendedStake) || 100)
                    : null;
                  const roi = parseFloat(opp.roi);
                  return (
                    <div key={opp.id} className={`${glass} p-4`}>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-white truncate">{opp.event}</p>
                          <p className="text-xs text-slate-500">{opp.sport} · {opp.market}</p>
                        </div>
                        <RoiBadge roi={roi} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-slate-800/50 rounded-xl p-3">
                          <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">{opp.bookmaker1}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{opp.outcome1}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <OddsPill odds={odds1} />
                            {stakes && <span className="text-xs text-slate-400">→ ${stakes.stake1}</span>}
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-3">
                          <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">{opp.bookmaker2}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{opp.outcome2}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <OddsPill odds={odds2} />
                            {stakes && <span className="text-xs text-slate-400">→ ${stakes.stake2}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-white/5">
                        {stakes && (
                          <p className="text-sm font-bold text-emerald-400">+${stakes.profit} guaranteed</p>
                        )}
                        <button
                          className={`ml-auto ${goldBg} text-black text-xs font-bold px-4 py-2 rounded-xl shadow-[0_0_16px_rgba(212,175,55,0.3)] hover:opacity-90 transition-opacity`}
                          onClick={() => { setPlaceBetOpp(opp); setBetStake(opp.recommendedStake); }}
                        >
                          Place Bets
                        </button>
                      </div>
                    </div>
                  );
                })}
                {opportunities.length > 5 && (
                  <p className="text-center text-xs text-slate-500">{opportunities.length - 5} more opportunities</p>
                )}
              </div>
            ) : (
              <EmptyState icon={AlertCircle} message="No arbitrage opportunities found" sub="Check Sports Max in Tools for matched betting opps" />
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          TOOLS
      ════════════════════════════════════════ */}
      {activeNav === "tools" && (
        <div className="flex flex-col">
          {/* Tool sub-nav */}
          <div className="overflow-x-auto border-b border-white/5 bg-[#020617] sticky top-0 z-10">
            <div className="flex px-4 pt-3 pb-0 gap-1 w-max min-w-full">
              {toolTabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTool(id)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    activeTool === id
                      ? `${goldText} border-[#D4AF37]`
                      : "text-slate-500 border-transparent hover:text-slate-300"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Sports Max ── */}
          {activeTool === "sports" && (
            <div className="px-4 pt-5">
              <SectionHeading title="Sports Maximiser" count={sportsMax?.length} unit="opportunities" />
              {!sportsMax || sportsMax.length === 0 ? (
                <EmptyState icon={Zap} message="No data yet" sub="Admin can tap Refresh to sync data" />
              ) : (
                <div className="space-y-3 pb-4">
                  {sportsMax.map((row) => {
                    const odds1 = Number(row.bet1_odds) || 0;
                    const odds2 = Number(row.bet2_odds) || 0;
                    const stakes = odds1 > 1 && odds2 > 1 ? calcArbStakes(odds1, odds2, 100) : null;
                    const roi = Number(row.roi) || 0;
                    return (
                      <div key={row.id} className={`${glass} p-4`}>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-white truncate">{row.event_name}</p>
                            <p className="text-xs text-slate-500">
                              {row.sport}{row.league ? ` · ${row.league}` : ""}{row.market ? ` · ${row.market}` : ""}
                            </p>
                          </div>
                          <RoiBadge roi={roi} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {[
                            { bk: row.bet1_bookmaker, name: row.bet1_name, odds: odds1, stake: stakes?.stake1 },
                            { bk: row.bet2_bookmaker, name: row.bet2_name, odds: odds2, stake: stakes?.stake2 },
                          ].map(({ bk, name, odds, stake }) => {
                            const has = userAccountSet.has((bk ?? "").toLowerCase().trim());
                            const url = getBookmakerUrl(bk || "");
                            return (
                              <a key={bk} href={url} target="_blank" rel="noopener noreferrer"
                                className="bg-slate-800/50 hover:bg-slate-700/60 rounded-xl p-3 block transition-colors group">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">{bk}</p>
                                  <ExternalLink className="h-3 w-3 text-slate-600 group-hover:text-[#D4AF37] transition-colors" />
                                </div>
                                <p className="text-xs text-slate-500">{name}</p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <OddsPill odds={odds} />
                                  {stake && <span className="text-xs text-slate-400">→ ${stake}</span>}
                                </div>
                                <p className={`text-[10px] mt-1.5 font-semibold ${has ? "text-emerald-400" : "text-slate-600"}`}>
                                  {has ? "✓ You have an account" : "No account yet"}
                                </p>
                              </a>
                            );
                          })}
                        </div>
                        {stakes && (
                          <p className="text-xs text-emerald-400 font-semibold mb-2">Guaranteed profit on $100: +${stakes.profit}</p>
                        )}
                        <div className="flex items-center justify-end pt-2 border-t border-white/5">
                          <button
                            className={`${goldBg} text-black text-xs font-bold px-4 py-2 rounded-xl shadow-[0_0_12px_rgba(212,175,55,0.25)] hover:opacity-90 transition-opacity`}
                            onClick={() => setConfirmBet({
                              type: "standard", eventName: row.event_name || "",
                              legs: [
                                { bookmaker: row.bet1_bookmaker || "", odds: odds1, outcome: row.bet1_name || "", url: getBookmakerUrl(row.bet1_bookmaker || "") },
                                { bookmaker: row.bet2_bookmaker || "", odds: odds2, outcome: row.bet2_name || "", url: getBookmakerUrl(row.bet2_bookmaker || "") },
                              ],
                            })}
                          >
                            {paperMode ? "Track Bet" : "Place Bets"}
                          </button>
                        </div>
                        {row.updated_ago && <p className="text-[11px] text-slate-600 mt-2">Updated: {row.updated_ago}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Middles ── */}
          {activeTool === "middles" && (
            <div className="px-4 pt-5">
              <SectionHeading title="Middle Maximiser" count={middleMax?.length} unit="opportunities" />
              {!middleMax || middleMax.length === 0 ? (
                <EmptyState icon={Layers} message="No data yet" sub="Admin can tap Refresh to sync data" />
              ) : (
                <div className="space-y-3 pb-4">
                  {middleMax.map((row) => {
                    const odds1 = Number(row.bet1_odds) || 0;
                    const odds2 = Number(row.bet2_odds) || 0;
                    const risk = Number(row.risk_pct) || 0;
                    return (
                      <div key={row.id} className={`${glass} p-4`}>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-white truncate">{row.event_name}</p>
                            <p className="text-xs text-slate-500">
                              {row.sport}{row.league ? ` · ${row.league}` : ""}{row.market ? ` · ${row.market}` : ""}
                            </p>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                            risk <= 5 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : risk <= 15 ? "bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/30"
                            : "bg-slate-700/40 text-slate-400 border-slate-600/30"
                          }`}>{risk.toFixed(1)}% risk</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {[
                            { bk: row.bet1_bookmaker, name: row.bet1_name, odds: odds1 },
                            { bk: row.bet2_bookmaker, name: row.bet2_name, odds: odds2 },
                          ].map(({ bk, name, odds }) => {
                            const has = userAccountSet.has((bk ?? "").toLowerCase().trim());
                            const url = getBookmakerUrl(bk || "");
                            return (
                              <a key={bk} href={url} target="_blank" rel="noopener noreferrer"
                                className="bg-slate-800/50 hover:bg-slate-700/60 rounded-xl p-3 block transition-colors group">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">{bk}</p>
                                  <ExternalLink className="h-3 w-3 text-slate-600 group-hover:text-[#D4AF37] transition-colors" />
                                </div>
                                <p className="text-xs text-slate-500">{name}</p>
                                <OddsPill odds={odds} />
                                <p className={`text-[10px] mt-1.5 font-semibold ${has ? "text-emerald-400" : "text-slate-600"}`}>
                                  {has ? "✓ You have an account" : "No account yet"}
                                </p>
                              </a>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-end pt-2 border-t border-white/5">
                          <button
                            className={`${goldBg} text-black text-xs font-bold px-4 py-2 rounded-xl shadow-[0_0_12px_rgba(212,175,55,0.25)] hover:opacity-90 transition-opacity`}
                            onClick={() => setConfirmBet({
                              type: "standard", eventName: row.event_name || "",
                              legs: [
                                { bookmaker: row.bet1_bookmaker || "", odds: odds1, outcome: row.bet1_name || "", url: getBookmakerUrl(row.bet1_bookmaker || "") },
                                { bookmaker: row.bet2_bookmaker || "", odds: odds2, outcome: row.bet2_name || "", url: getBookmakerUrl(row.bet2_bookmaker || "") },
                              ],
                            })}
                          >
                            {paperMode ? "Track Bet" : "Place Bets"}
                          </button>
                        </div>
                        {row.updated_ago && <p className="text-[11px] text-slate-600 mt-2">Updated: {row.updated_ago}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Promos ── */}
          {activeTool === "promos" && (
            <div className="px-4 pt-5">
              {!imperialPromos || imperialPromos.length === 0 ? (
                <EmptyState icon={Gift} message="No promos yet" sub="Admin can tap Refresh to sync data" />
              ) : (
                <>
                  {/* Header + toggle */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-bold text-base text-white">
                        {showAllPromos ? "All Promotions" : "Your Eligible Promotions"}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {showAllPromos
                          ? `${imperialPromos.length} total across all bookmakers`
                          : eligiblePromoEntries.length > 0
                            ? `${eligiblePromoEntries.reduce((n, [, p]) => n + (p?.length || 0), 0)} promos for your ${eligiblePromoEntries.length} accounts`
                            : "Add bookmaker accounts to see eligible promos"}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowAllPromos(!showAllPromos)}
                      className="text-xs text-slate-400 border border-white/10 rounded-xl px-3 py-1.5 hover:text-white transition-colors shrink-0"
                    >
                      {showAllPromos ? "My promos" : "See all"}
                    </button>
                  </div>

                  {/* No eligible accounts message */}
                  {!showAllPromos && eligiblePromoEntries.length === 0 && (
                    <div className={`${glass} p-6 text-center mb-4`}>
                      <Gift className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-slate-400 text-sm font-medium">No eligible promos yet</p>
                      <p className="text-slate-600 text-xs mt-1">Add your bookmaker accounts in the Books tab to see personalised promos</p>
                      <button onClick={() => setShowAllPromos(true)} className={`mt-3 text-xs ${goldText} underline`}>
                        View all {imperialPromos.length} promos anyway
                      </button>
                    </div>
                  )}

                  {/* Promo groups */}
                  <div className="space-y-4 pb-4">
                    {(showAllPromos ? Object.entries(promosByBookmaker) : eligiblePromoEntries).map(([bookmakerKey, promos]) => {
                      const bookmaker = promos?.[0]?.bookmaker || bookmakerKey;
                      const hasAccount = userAccountSet.has(bookmakerKey);
                      const bkUrl = getBookmakerUrl(bookmaker);
                      const intelRow = (imperialBookmakers || []).find(
                        (b) => b.bookmaker_name.toLowerCase().trim() === bookmakerKey
                      );
                      return (
                        <div key={bookmaker} className={`${glass} ${hasAccount ? "border-emerald-500/10" : ""} p-4`}>
                          {/* Bookmaker header with direct link */}
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                              <h3 className="font-bold text-sm text-white">{bookmaker}</h3>
                              {hasAccount && (
                                <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
                                  ✓ Your account
                                </span>
                              )}
                              {intelRow?.tier && (
                                <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${tierColour(intelRow.tier)}`}>
                                  {intelRow.tier}
                                </span>
                              )}
                              {intelRow?.promo_ban_risk && (
                                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                  intelRow.promo_ban_risk.toLowerCase().includes("low")
                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                    : "bg-red-500/10 border-red-500/30 text-red-400"
                                }`}>
                                  Ban risk: {intelRow.promo_ban_risk}
                                </span>
                              )}
                            </div>
                            <a
                              href={bkUrl} target="_blank" rel="noopener noreferrer"
                              className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl ${
                                hasAccount
                                  ? `${goldBg} text-black shadow-[0_0_10px_rgba(212,175,55,0.2)]`
                                  : "bg-slate-700/60 border border-white/5 text-slate-300"
                              } hover:opacity-90 transition-opacity`}
                            >
                              Open <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>

                          {/* Individual promos */}
                          <div className="space-y-2">
                            {(promos || []).map((promo) => (
                              <div key={promo.id} className="bg-slate-800/50 rounded-xl p-3 flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  {promo.track && promo.track.length < 60 && (
                                    <p className="text-[11px] text-slate-500 mb-0.5">{promo.track}{promo.races ? ` · ${promo.races}` : ""}</p>
                                  )}
                                  <p className="text-sm font-medium text-white">{promo.promotion}</p>
                                  {promo.track && promo.track.length >= 60 && (
                                    <p className="text-xs text-slate-500 mt-1 italic">{promo.track}</p>
                                  )}
                                </div>
                                <a
                                  href={bkUrl} target="_blank" rel="noopener noreferrer"
                                  className="shrink-0 bg-slate-700/60 border border-white/5 text-slate-300 hover:text-white text-xs px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1"
                                >
                                  Claim <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Show other promos hint */}
                  {!showAllPromos && otherPromoEntries.length > 0 && (
                    <button onClick={() => setShowAllPromos(true)} className="w-full text-center text-xs text-slate-500 py-3 hover:text-slate-300 transition-colors">
                      + {otherPromoEntries.length} more bookmakers with promos (no account) — tap to see all
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Books ── */}
          {activeTool === "books" && (
            <div className="px-4 pt-5">
              <SectionHeading title="Bookmaker Intelligence" count={imperialBookmakers?.length} unit="bookmakers" />
              {!imperialBookmakers || imperialBookmakers.length === 0 ? (
                <EmptyState icon={ShieldCheck} message="No data yet" sub="Admin can tap Refresh to sync data" />
              ) : (
                <div className="space-y-3 pb-4">
                  {imperialBookmakers.map((bk) => {
                    const hasAccount = userAccountSet.has(bk.bookmaker_name.toLowerCase().trim());
                    const userAcc = (userBookmakers || []).find(
                      (a) => a.bookmaker.toLowerCase().trim() === bk.bookmaker_name.toLowerCase().trim()
                    );
                    return (
                      <div key={bk.id} className={`${glass} p-4`}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-sm text-white">{bk.bookmaker_name}</h3>
                              {bk.tier && (
                                <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${tierColour(bk.tier)}`}>
                                  {bk.tier}
                                </span>
                              )}
                              {bk.importance && (
                                <span className="text-[11px] px-2 py-0.5 rounded border border-white/5 text-slate-400">
                                  {bk.importance}
                                </span>
                              )}
                            </div>
                            {bk.platform && <p className="text-xs text-slate-500 mt-0.5">{bk.platform}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                              hasAccount
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : "bg-slate-800/60 border-white/5 text-slate-500"
                            }`}>
                              {hasAccount ? "✓ Account" : "No account"}
                            </span>
                            {userAcc?.healthScore != null && (
                              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                userAcc.healthScore >= 80
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                  : "bg-red-500/10 border-red-500/30 text-red-400"
                              }`}>
                                Health {userAcc.healthScore}/100
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                          {bk.promo_ban_risk && (
                            <div className="bg-slate-800/50 rounded-xl p-2">
                              <p className="text-slate-500">Promo ban risk</p>
                              <p className={`font-semibold mt-0.5 ${
                                bk.promo_ban_risk.toLowerCase().includes("low") ? "text-emerald-400" : "text-red-400"
                              }`}>{bk.promo_ban_risk}</p>
                            </div>
                          )}
                          {bk.signup_bonus && (
                            <div className="bg-slate-800/50 rounded-xl p-2">
                              <p className="text-slate-500">Sign-up bonus</p>
                              <p className="font-semibold mt-0.5 text-emerald-400">{bk.signup_bonus}</p>
                            </div>
                          )}
                          {bk.promo_offering && (
                            <div className="bg-slate-800/50 rounded-xl p-2">
                              <p className="text-slate-500">Promos</p>
                              <p className="font-semibold mt-0.5 text-white">{bk.promo_offering}</p>
                            </div>
                          )}
                          {bk.odds_boost && (
                            <div className="bg-slate-800/50 rounded-xl p-2">
                              <p className="text-slate-500">Odds boost</p>
                              <p className="font-semibold mt-0.5 text-white">{bk.odds_boost}</p>
                            </div>
                          )}
                        </div>
                        {!hasAccount && bk.signup_offers && (
                          <div className="bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-xl p-2 text-xs text-[#D4AF37]">
                            <Star className="h-3 w-3 inline mr-1" />
                            <strong>Sign-up offer:</strong> {bk.signup_offers}
                          </div>
                        )}
                        {getPromoForBookmaker(bk.bookmaker_name).length > 0 && (
                          <div className="mt-2 pt-2 border-t border-white/5">
                            <p className="text-[11px] text-slate-500 mb-1">
                              {getPromoForBookmaker(bk.bookmaker_name).length} current promo(s)
                            </p>
                            <div className="space-y-0.5">
                              {getPromoForBookmaker(bk.bookmaker_name).slice(0, 2).map((p) => (
                                <p key={p.id} className="text-xs text-slate-400 leading-snug truncate">{p.promotion}</p>
                              ))}
                              {getPromoForBookmaker(bk.bookmaker_name).length > 2 && (
                                <button onClick={() => { setActiveTool("promos"); setShowAllPromos(true); }} className={`text-xs ${goldText} underline`}>
                                  +{getPromoForBookmaker(bk.bookmaker_name).length - 2} more
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Calculator ── */}
          {activeTool === "calc" && (
            <div className="px-4 pt-5 pb-4">
              <h2 className="font-bold text-base text-white mb-4">Betting Calculators</h2>
              <BettingCalculators />
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════
          CONSULT (AI Chat)
      ════════════════════════════════════════ */}
      {activeNav === "consult" && (
        <div className="flex flex-col" style={{ height: "calc(100vh - 136px)" }}>
          <div className="px-4 pt-4 pb-2 border-b border-white/5">
            <h2 className="font-bold text-base text-white">AI Assistant</h2>
            <p className="text-xs text-slate-500">Ask about opportunities, strategy, and more</p>
          </div>
          <BettingChatBox />
        </div>
      )}

      {/* ════════════════════════════════════════
          HISTORY
      ════════════════════════════════════════ */}
      {activeNav === "history" && (
        <div className="px-4 pt-5 pb-4">
          {paperMode ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-base text-white">Paper Trading</h2>
                  <p className="text-xs text-slate-500">Virtual bets — no real money</p>
                </div>
                <FlaskConical className={`h-5 w-5 ${goldText}`} />
              </div>
              {(() => {
                const won = paperBets.filter(b => b.status === "won");
                const lost = paperBets.filter(b => b.status === "lost");
                const virtualPL = won.reduce((s, b) => s + (b.stake * b.odds - b.stake), 0)
                  - lost.reduce((s, b) => s + b.stake, 0);
                const settled = paperBets.filter(b => b.status !== "pending");
                return (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className={`${glass} p-4`}>
                        <p className="text-[11px] text-slate-500 uppercase tracking-widest">Virtual P&L</p>
                        <p className={`text-xl font-black mt-1.5 ${virtualPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {virtualPL >= 0 ? "+" : ""}${virtualPL.toFixed(2)}
                        </p>
                      </div>
                      <div className={`${glass} p-4`}>
                        <p className="text-[11px] text-slate-500 uppercase tracking-widest">Tracked</p>
                        <p className="text-xl font-black mt-1.5 text-white">{paperBets.length}</p>
                        <p className="text-xs text-slate-500">{won.length}W · {lost.length}L</p>
                      </div>
                      <div className={`${glass} p-4`}>
                        <p className="text-[11px] text-slate-500 uppercase tracking-widest">Win Rate</p>
                        <p className="text-xl font-black mt-1.5 text-white">
                          {settled.length > 0 ? `${Math.round(won.length / settled.length * 100)}%` : "—"}
                        </p>
                      </div>
                    </div>
                    {paperBets.length === 0 ? (
                      <EmptyState icon={FlaskConical} message="No paper bets yet" sub='Tap "Place Bets" on any opportunity to track it' />
                    ) : (
                      <div className="space-y-2">
                        {paperBets.map((bet) => (
                          <div key={bet.id} className={`${glass} border-[#D4AF37]/10 p-3 flex items-center justify-between gap-2`}>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-white truncate">{bet.event}</p>
                              <p className="text-xs text-slate-500">{bet.bookmaker} @ {bet.odds} · ${bet.stake}</p>
                              <p className="text-[11px] text-slate-600">{new Date(bet.loggedAt).toLocaleDateString()}</p>
                            </div>
                            {bet.status === "pending" ? (
                              <div className="flex gap-1.5 shrink-0">
                                <button
                                  onClick={() => { settlePaperBet(bet.id, "won"); refreshPaperBets(); }}
                                  className="text-xs px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                                >Won</button>
                                <button
                                  onClick={() => { settlePaperBet(bet.id, "lost"); refreshPaperBets(); }}
                                  className="text-xs px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400"
                                >Lost</button>
                              </div>
                            ) : (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                                bet.status === "won"
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                  : "bg-red-500/20 text-red-400 border-red-500/30"
                              }`}>{bet.status}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-base text-white">Bet History</h2>
                <span className="text-xs text-slate-500">{bets?.length || 0} bets</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className={`${glass} p-4`}>
                  <p className="text-[11px] text-slate-500 uppercase tracking-widest">Total P&L</p>
                  <p className={`text-xl font-black mt-1.5 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                    {isPositive ? "+" : ""}${stats?.totalProfit || "0.00"}
                  </p>
                </div>
                <div className={`${glass} p-4`}>
                  <p className="text-[11px] text-slate-500 uppercase tracking-widest">Win Rate</p>
                  <p className="text-xl font-black mt-1.5 text-white">{stats?.winRate || "0"}%</p>
                  <p className="text-xs text-slate-500">{stats?.wonBets || 0} won</p>
                </div>
                <div className={`${glass} p-4`}>
                  <p className="text-[11px] text-slate-500 uppercase tracking-widest">Total</p>
                  <p className="text-xl font-black mt-1.5 text-white">{bets?.length || 0}</p>
                  <p className="text-xs text-slate-500">{stats?.pendingBets || 0} pending</p>
                </div>
              </div>
              {!bets || bets.length === 0 ? (
                <EmptyState icon={Clock} message="No bets placed yet" />
              ) : (
                <div className="space-y-2">
                  {bets.map((bet) => (
                    <div key={bet.id} className={`${glass} p-3 flex items-center justify-between`}>
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="font-semibold text-sm text-white truncate">{bet.event}</p>
                        <p className="text-xs text-slate-500">{bet.bookmaker} · {bet.sport} · @ {bet.odds}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                          bet.status === "won" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : bet.status === "lost" ? "bg-red-500/20 text-red-400 border-red-500/30"
                          : "bg-slate-700/40 text-slate-400 border-slate-600/30"
                        }`}>{bet.status}</span>
                        <p className="text-xs text-slate-400 mt-0.5">${bet.stake}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════
          FIXED BOTTOM NAV
      ════════════════════════════════════════ */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[rgba(2,6,23,0.97)] backdrop-blur-xl border-t border-white/5 px-2 py-2 z-50">
        <div className="grid grid-cols-4 max-w-lg mx-auto">
          {navItems.map(({ id, label, icon: Icon }) => {
            const active = activeNav === id;
            return (
              <button
                key={id}
                onClick={() => setActiveNav(id)}
                className={`flex flex-col items-center gap-1 py-1.5 px-2 rounded-xl transition-all ${
                  active ? "" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-all ${
                  active ? "bg-[#D4AF37]/15 shadow-[0_0_16px_rgba(212,175,55,0.3)]" : ""
                }`}>
                  <Icon className={`h-5 w-5 ${active ? goldText : ""}`} />
                </div>
                <span className={`text-[10px] font-semibold ${active ? goldText : ""}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ══ HOW IT WORKS DIALOG ══ */}
      <Dialog open={showHowItWorks} onOpenChange={setShowHowItWorks}>
        <DialogContent className="bg-[#0d1628] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" /> How placing bets works
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
            <p>Sick Punt is a <strong className="text-white">research and tracking tool</strong>. It never places bets on your behalf and never touches your money.</p>
            <div className="bg-slate-800/60 rounded-xl p-3 space-y-2">
              <p className="font-semibold text-white text-xs uppercase tracking-wide">When you tap "Place Bets":</p>
              <p>✓ The bet is <strong>logged in your personal history</strong></p>
              <p>✓ The bookmaker's site opens so you can place it yourself</p>
              <p>✓ <strong>You are in full control</strong> at all times</p>
            </div>
            <p className="text-slate-500 text-xs">All transactions go directly between you and the licensed, regulated bookmaker.</p>
            <div className={`bg-[#D4AF37]/8 border border-[#D4AF37]/20 rounded-xl p-3`}>
              <p className={`font-semibold ${goldText} text-xs mb-1`}>💡 Not ready for real money?</p>
              <p className="text-xs text-slate-300">Enable <strong>Paper Mode</strong> to track predictions virtually.</p>
            </div>
          </div>
          <Button className={`w-full ${goldBg} text-black font-bold hover:opacity-90 mt-2`} onClick={() => setShowHowItWorks(false)}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>

      {/* ══ PLACE BETS DIALOG — Arb opps ══ */}
      <Dialog
        open={!!placeBetOpp}
        onOpenChange={(open) => { if (!open) { setPlaceBetOpp(null); setBetPlaced(false); setBetStake(""); } }}
      >
        <DialogContent className="bg-[#0d1628] border-white/10 text-white">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-white">
                {paperMode ? "Track This Bet (Paper)" : "Place Bets"}
              </DialogTitle>
              <button onClick={() => setShowHowItWorks(true)} className="text-slate-500 hover:text-slate-300 transition-colors">
                <Info className="h-4 w-4" />
              </button>
            </div>
            <DialogDescription className="text-slate-400">
              {paperMode
                ? "This will be logged as a virtual bet — no real money involved."
                : "Log both legs, then visit each bookmaker's site to place your bets."}
            </DialogDescription>
          </DialogHeader>

          {betPlaced ? (
            <div className="flex flex-col items-center gap-3 py-6 text-emerald-400">
              <CheckCircle className="h-12 w-12" />
              <p className="font-bold text-lg text-white">Bets logged!</p>
              <p className="text-sm text-slate-400">Now visit each bookmaker to place the bets.</p>
              {placeBetOpp && (
                <div className="flex gap-3 mt-2">
                  <Button variant="outline" className="border-white/10 text-slate-300" asChild>
                    <a href={getBookmakerUrl(placeBetOpp.bookmaker1)} target="_blank" rel="noopener noreferrer">
                      {placeBetOpp.bookmaker1} <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                  <Button variant="outline" className="border-white/10 text-slate-300" asChild>
                    <a href={getBookmakerUrl(placeBetOpp.bookmaker2)} target="_blank" rel="noopener noreferrer">
                      {placeBetOpp.bookmaker2} <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                </div>
              )}
            </div>
          ) : placeBetOpp && (() => {
            const odds1 = parseFloat(placeBetOpp.odds1);
            const odds2 = parseFloat(placeBetOpp.odds2);
            const totalStake = parseFloat(betStake) || 0;
            const stakes = odds1 > 1 && odds2 > 1 && totalStake > 0
              ? calcArbStakes(odds1, odds2, totalStake) : null;
            return (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/5 bg-slate-800/40 p-3 text-sm space-y-2">
                  <p className="font-semibold text-white">{String(placeBetOpp.event)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-slate-500 text-xs">Leg 1 — {placeBetOpp.bookmaker1}</p>
                      <p className="font-medium text-white">{String(placeBetOpp.outcome1)} @ {placeBetOpp.odds1}</p>
                      {stakes && <p className="text-emerald-400 font-bold">Stake: ${stakes.stake1}</p>}
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">Leg 2 — {placeBetOpp.bookmaker2}</p>
                      <p className="font-medium text-white">{String(placeBetOpp.outcome2)} @ {placeBetOpp.odds2}</p>
                      {stakes && <p className="text-emerald-400 font-bold">Stake: ${stakes.stake2}</p>}
                    </div>
                  </div>
                  {stakes && (
                    <div className="pt-2 border-t border-white/5 text-center">
                      <p className="text-emerald-400 font-black text-base">Guaranteed profit: +${stakes.profit}</p>
                      <p className="text-xs text-slate-500">ROI: {stakes.roi}%</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300">Total Stake ($)</Label>
                  <Input
                    type="number"
                    value={betStake}
                    onChange={(e) => setBetStake(e.target.value)}
                    placeholder="e.g. 200"
                    className="bg-slate-800/60 border-white/10 text-white"
                  />
                  {stakes && <p className="text-xs text-slate-500">Split: ${stakes.stake1} + ${stakes.stake2}</p>}
                </div>
                <Button
                  className={`w-full ${goldBg} text-black font-bold hover:opacity-90`}
                  onClick={handlePlaceBets}
                  disabled={!betStake || parseFloat(betStake) <= 0 || createBetMutation.isPending}
                >
                  {createBetMutation.isPending ? "Logging…" : "Confirm & Log Bets"}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ══ CONFIRM MODAL — Sports Max, Middles, Promos ══ */}
      <Dialog open={!!confirmBet} onOpenChange={(open) => { if (!open) setConfirmBet(null); }}>
        <DialogContent className="bg-[#0d1628] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Confirm Before You Bet</DialogTitle>
            <DialogDescription className="text-slate-400">
              {confirmBet?.type === "promo"
                ? "Verify this promotion is showing on the bookmaker site and that you are eligible before proceeding."
                : "Verify these odds still match on the bookmaker site before placing."}
            </DialogDescription>
          </DialogHeader>

          {confirmBet && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/5 bg-slate-800/40 p-3 space-y-3">
                <p className="font-bold text-sm text-white">{confirmBet.eventName}</p>
                {confirmBet.legs.length > 0 && (
                  <div className="space-y-2">
                    {confirmBet.legs.map((leg, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm text-white">{leg.bookmaker}</p>
                          <p className="text-xs text-slate-500">{leg.outcome}</p>
                        </div>
                        <OddsPill odds={Number(leg.odds)} />
                      </div>
                    ))}
                  </div>
                )}
                {confirmBet.type === "promo" && confirmBet.promo && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold">Promotion</p>
                    <p className="text-sm font-medium text-white">{confirmBet.promo.name}</p>
                    {confirmBet.promo.terms && (
                      <>
                        <p className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold mt-2">Terms</p>
                        <p className="text-xs text-slate-400 leading-relaxed">{confirmBet.promo.terms}</p>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                {confirmBet.legs.map((leg) => (
                  <Button key={leg.bookmaker} className={`flex-1 ${goldBg} text-black font-bold hover:opacity-90`} asChild>
                    <a href={leg.url} target="_blank" rel="noopener noreferrer">
                      {leg.bookmaker} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </a>
                  </Button>
                ))}
                {confirmBet.type === "promo" && confirmBet.promo && (
                  <Button className={`flex-1 ${goldBg} text-black font-bold hover:opacity-90`} asChild>
                    <a href={confirmBet.promo.url} target="_blank" rel="noopener noreferrer">
                      Visit {confirmBet.promo.bookmaker} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </a>
                  </Button>
                )}
              </div>
              <Button variant="outline" className="w-full border-white/10 text-slate-400" onClick={() => setConfirmBet(null)}>
                Cancel
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
