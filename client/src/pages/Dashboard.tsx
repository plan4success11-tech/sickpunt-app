import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RefreshCw, CheckCircle, ShieldCheck, Gift, Star, ExternalLink,
  MessageSquare, TrendingUp, TrendingDown, Zap, Layers, BookOpen,
  Calculator, Clock, LayoutDashboard, AlertCircle, Bell, Info,
  FlaskConical, Banknote,
} from "lucide-react";
import { BettingChatBox } from "@/components/BettingChatBox";
import { BettingCalculators } from "@/components/BettingCalculators";
import { OnboardingModal, useOnboarding } from "@/components/OnboardingModal";
import type { Opportunity } from "../../../drizzle/schema";

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

function riskColour(risk: string | null | undefined) {
  const r = (risk || "").toLowerCase();
  if (r.includes("low")) return "default";
  if (r.includes("med")) return "secondary";
  return "destructive";
}

function tierColour(tier: string | null | undefined) {
  const t = (tier || "").toLowerCase();
  if (t === "tier 1" || t === "1") return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (t === "tier 2" || t === "2") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return "bg-zinc-700/40 text-zinc-400 border-zinc-600/30";
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, positive }: { label: string; value: string | number; sub?: string; positive?: boolean }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium">{label}</p>
      <p className={`text-2xl font-black mt-1.5 ${positive === true ? "text-emerald-400" : positive === false ? "text-red-400" : "text-white"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Odds pill ─────────────────────────────────────────────────────────────────
function OddsPill({ odds }: { odds: number }) {
  return (
    <span className="inline-block bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-black text-base px-3 py-0.5 rounded-lg">
      {odds.toFixed(2)}
    </span>
  );
}

// ── ROI badge ─────────────────────────────────────────────────────────────────
function RoiBadge({ roi }: { roi: number }) {
  const cls = roi >= 5 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    : roi >= 2 ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
    : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {roi.toFixed(2)}% ROI
    </span>
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

  const [selectedTab, setSelectedTab] = useState("overview");
  const [placeBetOpp, setPlaceBetOpp] = useState<Opportunity | null>(null);
  const [betStake, setBetStake] = useState("");
  const [betPlaced, setBetPlaced] = useState(false);
  const [confirmBet, setConfirmBet] = useState<ConfirmBet | null>(null);

  const { data: opportunities, isLoading: opportunitiesLoading, refetch: refetchOpportunities } =
    trpc.opportunities.list.useQuery();
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
      // Paper mode — log locally, no real money
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
    setTimeout(() => { setPlaceBetOpp(null); setBetPlaced(false); setBetStake(""); }, 1800);
  };

  const handleRefreshData = async () => {
    await triggerImperialIngestion.mutateAsync({ mode: "all", pages: 3 });
    await Promise.all([refetchImperialStatus(), refetchSportsMax(), refetchMiddleMax(), refetchOpportunities()]);
  };

  const promosByBookmaker: Record<string, typeof imperialPromos> = {};
  for (const promo of imperialPromos || []) {
    const bk = (promo.bookmaker || "Unknown").toLowerCase().trim();
    if (!promosByBookmaker[bk]) promosByBookmaker[bk] = [];
    promosByBookmaker[bk]!.push(promo);
  }
  const getPromoForBookmaker = (name: string) =>
    promosByBookmaker[(name || "").toLowerCase().trim()] ?? [];

  const totalPL = parseFloat(stats?.totalProfit || "0");
  const isPositive = totalPL >= 0;

  const tabs = [
    { value: "overview",  label: "Overview",   icon: LayoutDashboard },
    { value: "sports",    label: "Sports Max",  icon: Zap             },
    { value: "middles",   label: "Middles",     icon: Layers          },
    { value: "promos",    label: "Promos",      icon: Gift            },
    { value: "books",     label: "Books",       icon: BookOpen        },
    { value: "chat",      label: "AI Chat",     icon: MessageSquare   },
    { value: "calc",      label: "Calculator",  icon: Calculator      },
    { value: "history",   label: "History",     icon: Clock           },
  ];

  return (
    <div className="-m-4 min-h-screen bg-zinc-950 text-white">

      {/* ── Onboarding ── */}
      <OnboardingModal open={showOnboarding} onDone={dismissOnboarding} />

      {/* ── Top bar ── */}
      <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">
            {user?.name?.split(" ")[0] || "Punter"} 👋
          </p>
          <p className="text-[11px] text-zinc-500">
            {imperialStatus?.lastSuccessAt
              ? `Last sync ${new Date(imperialStatus.lastSuccessAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "No sync yet"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Paper mode toggle */}
          <button
            onClick={togglePaperMode}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
              paperMode
                ? "bg-[#C9A227]/15 border-[#C9A227]/40 text-[#C9A227]"
                : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
            }`}
            title={paperMode ? "Switch to live mode" : "Switch to paper (practice) mode"}
          >
            {paperMode ? <FlaskConical className="h-3.5 w-3.5" /> : <Banknote className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{paperMode ? "Paper" : "Live"}</span>
          </button>

          {notifications && notifications.length > 0 && (
            <div className="relative">
              <Bell className="h-5 w-5 text-zinc-400" />
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 text-[10px] font-bold flex items-center justify-center text-black">
                {notifications.length}
              </span>
            </div>
          )}

          {/* Refresh — admin only to preserve API credits */}
          {isAdmin && (
            <Button
              size="sm"
              onClick={handleRefreshData}
              disabled={triggerImperialIngestion.isPending}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 px-3"
            >
              {triggerImperialIngestion.isPending
                ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Syncing…</>
                : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</>}
            </Button>
          )}
        </div>
      </div>

      {/* ── Paper mode banner ── */}
      {paperMode && (
        <div className="bg-[#C9A227]/10 border-b border-[#C9A227]/30 px-4 py-2 flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-[#C9A227] shrink-0" />
          <p className="text-xs text-[#C9A227] font-medium">
            <strong>Paper Mode is on</strong> — bets are tracked virtually, no real money involved. Perfect for testing.
          </p>
          <button onClick={togglePaperMode} className="ml-auto text-[11px] text-[#C9A227]/70 underline shrink-0">Switch to Live</button>
        </div>
      )}

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-zinc-800 border-b border-zinc-800">
        <div className="bg-zinc-950 p-4">
          <p className="text-[11px] text-zinc-500 uppercase tracking-widest">Total P&amp;L</p>
          <p className={`text-2xl font-black mt-1 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
            {isPositive ? "+" : ""}${stats?.totalProfit || "0.00"}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            ROI {stats?.roi || "0"}%
          </p>
        </div>
        <div className="bg-zinc-950 p-4">
          <p className="text-[11px] text-zinc-500 uppercase tracking-widest">Active Bets</p>
          <p className="text-2xl font-black mt-1 text-white">{stats?.pendingBets || 0}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Win rate {stats?.winRate || "0"}%</p>
        </div>
        <div className="bg-zinc-950 p-4">
          <p className="text-[11px] text-zinc-500 uppercase tracking-widest">Sports Max</p>
          <p className="text-2xl font-black mt-1 text-emerald-400">{sportsMax?.length || 0}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Matched betting opps</p>
        </div>
        <div className="bg-zinc-950 p-4">
          <p className="text-[11px] text-zinc-500 uppercase tracking-widest">Live Promos</p>
          <p className="text-2xl font-black mt-1 text-emerald-400">{imperialPromos?.length || 0}</p>
          <p className="text-xs text-zinc-500 mt-0.5">Active bookmaker offers</p>
        </div>
      </div>

      {/* ── Tab navigation ── */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <div className="border-b border-zinc-800 bg-zinc-950 overflow-x-auto">
          <TabsList className="h-auto bg-transparent p-0 rounded-none flex w-max min-w-full">
            {tabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex items-center gap-1.5 px-4 py-3 rounded-none border-b-2 border-transparent
                  data-[state=active]:border-emerald-500 data-[state=active]:text-emerald-400
                  data-[state=active]:bg-transparent text-zinc-500 hover:text-zinc-300
                  text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ══════════════ OVERVIEW ══════════════ */}
        <TabsContent value="overview" className="p-4 space-y-4">
          {/* Arb opportunities */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-base text-white">Arbitrage Opportunities</h2>
              <span className="text-xs text-zinc-500">From Odds API</span>
            </div>
            {opportunitiesLoading ? (
              <div className="text-center py-8 text-zinc-500 text-sm">Loading…</div>
            ) : opportunities && opportunities.length > 0 ? (
              <div className="space-y-3">
                {opportunities.map((opp) => {
                  const odds1 = parseFloat(opp.odds1);
                  const odds2 = parseFloat(opp.odds2);
                  const stakes = odds1 > 1 && odds2 > 1
                    ? calcArbStakes(odds1, odds2, parseFloat(opp.recommendedStake) || 100)
                    : null;
                  return (
                    <div key={opp.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-white truncate">{opp.event}</p>
                          <p className="text-xs text-zinc-500">{opp.sport} · {opp.market}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                          parseFloat(opp.roi) >= 5 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : parseFloat(opp.roi) >= 2 ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                          : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                        }`}>{opp.roi}% ROI</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-zinc-800/60 rounded-lg p-3">
                          <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wide">{opp.bookmaker1}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{opp.outcome1}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <OddsPill odds={odds1} />
                            {stakes && <span className="text-xs text-zinc-400">→ ${stakes.stake1}</span>}
                          </div>
                        </div>
                        <div className="bg-zinc-800/60 rounded-lg p-3">
                          <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wide">{opp.bookmaker2}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{opp.outcome2}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <OddsPill odds={odds2} />
                            {stakes && <span className="text-xs text-zinc-400">→ ${stakes.stake2}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                        {stakes && (
                          <p className="text-sm font-bold text-emerald-400">+${stakes.profit} guaranteed</p>
                        )}
                        <Button
                          size="sm"
                          className="ml-auto bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
                          onClick={() => { setPlaceBetOpp(opp); setBetStake(opp.recommendedStake); }}
                        >
                          Place Bets
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                <AlertCircle className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm font-medium">No arbitrage opportunities found</p>
                <p className="text-zinc-600 text-xs mt-1">Check Sports Max tab for matched betting opps</p>
              </div>
            )}
          </div>

          {/* Imperial status */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-white">Data Sync Status</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                imperialStatus?.isRunning
                  ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                  : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              }`}>
                {imperialStatus?.isRunning ? "Syncing…" : "Idle"}
              </span>
            </div>
            <div className="grid grid-cols-3 lg:grid-cols-5 gap-3 text-center mb-3">
              {[
                ["Odds", imperialStatus?.counts?.oddsComparison],
                ["Sports Max", imperialStatus?.counts?.sportsMaximiser],
                ["Middles", imperialStatus?.counts?.middleMaximiser],
                ["Promos", imperialStatus?.counts?.promotions],
                ["Bookmakers", imperialStatus?.counts?.bookmakerIntelligence],
              ].map(([label, count]) => (
                <div key={String(label)} className="bg-zinc-800/60 rounded-lg p-2">
                  <p className="text-xs text-zinc-500">{label}</p>
                  <p className="text-lg font-black text-white">{count ?? "—"}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-600">
              Last success: {imperialStatus?.lastSuccessAt ? new Date(imperialStatus.lastSuccessAt).toLocaleString() : "Never"} · Auto-sync every 15 min
            </p>
            {imperialStatus?.lastError && (
              <div className="mt-2 p-2 rounded-lg border border-red-500/20 bg-red-500/5">
                <p className="text-xs text-red-400 font-semibold">⚠ Last sync failed — tap Refresh to try again</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ══════════════ SPORTS MAX ══════════════ */}
        <TabsContent value="sports" className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base text-white">Sports Maximiser</h2>
            <span className="text-xs text-zinc-500">{sportsMax?.length || 0} opportunities</span>
          </div>
          {!sportsMax || sportsMax.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <Zap className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 text-sm">No data yet — tap Refresh above</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-3 pr-1">
                {sportsMax.map((row) => {
                  const odds1 = Number(row.bet1_odds) || 0;
                  const odds2 = Number(row.bet2_odds) || 0;
                  const stakes = odds1 > 1 && odds2 > 1 ? calcArbStakes(odds1, odds2, 100) : null;
                  const roi = Number(row.roi) || 0;
                  return (
                    <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-white truncate">{row.event_name}</p>
                          <p className="text-xs text-zinc-500">
                            {row.sport}{row.league ? ` · ${row.league}` : ""}{row.market ? ` · ${row.market}` : ""}
                          </p>
                        </div>
                        <RoiBadge roi={roi} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-zinc-800/60 rounded-lg p-3">
                          <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wide">{row.bet1_bookmaker}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{row.bet1_name}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <OddsPill odds={odds1} />
                            {stakes && <span className="text-xs text-zinc-400">→ ${stakes.stake1}</span>}
                          </div>
                        </div>
                        <div className="bg-zinc-800/60 rounded-lg p-3">
                          <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wide">{row.bet2_bookmaker}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{row.bet2_name}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <OddsPill odds={odds2} />
                            {stakes && <span className="text-xs text-zinc-400">→ ${stakes.stake2}</span>}
                          </div>
                        </div>
                      </div>
                      {stakes && (
                        <p className="text-xs text-emerald-400 font-semibold mb-2">Guaranteed profit on $100: +${stakes.profit}</p>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                        <div className="flex gap-1.5 flex-wrap">
                          {[row.bet1_bookmaker, row.bet2_bookmaker].filter(Boolean).map((bk) => {
                            const has = userAccountSet.has((bk ?? "").toLowerCase().trim());
                            return (
                              <span key={bk} className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                has ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                    : "bg-zinc-800 border-zinc-700 text-zinc-500"
                              }`}>
                                {bk}: {has ? "✓" : "No acct"}
                              </span>
                            );
                          })}
                        </div>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 ml-2 shrink-0"
                          onClick={() => setConfirmBet({
                            type: "standard", eventName: row.event_name || "",
                            legs: [
                              { bookmaker: row.bet1_bookmaker || "", odds: odds1, outcome: row.bet1_name || "", url: getBookmakerUrl(row.bet1_bookmaker || "") },
                              { bookmaker: row.bet2_bookmaker || "", odds: odds2, outcome: row.bet2_name || "", url: getBookmakerUrl(row.bet2_bookmaker || "") },
                            ],
                          })}
                        >
                          {paperMode ? "Track" : "Place Bets"}
                        </Button>
                      </div>
                      {row.updated_ago && <p className="text-[11px] text-zinc-600 mt-2">Updated: {row.updated_ago}</p>}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* ══════════════ MIDDLES ══════════════ */}
        <TabsContent value="middles" className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base text-white">Middle Maximiser</h2>
            <span className="text-xs text-zinc-500">{middleMax?.length || 0} opportunities</span>
          </div>
          {!middleMax || middleMax.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <Layers className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 text-sm">No data yet — tap Refresh above</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-3 pr-1">
                {middleMax.map((row) => {
                  const odds1 = Number(row.bet1_odds) || 0;
                  const odds2 = Number(row.bet2_odds) || 0;
                  const risk = Number(row.risk_pct) || 0;
                  return (
                    <div key={row.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-white truncate">{row.event_name}</p>
                          <p className="text-xs text-zinc-500">
                            {row.sport}{row.league ? ` · ${row.league}` : ""}{row.market ? ` · ${row.market}` : ""}
                          </p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                          risk <= 5 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : risk <= 15 ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                          : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                        }`}>{risk.toFixed(1)}% risk</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-zinc-800/60 rounded-lg p-3">
                          <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wide">{row.bet1_bookmaker}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{row.bet1_name}</p>
                          <OddsPill odds={odds1} />
                        </div>
                        <div className="bg-zinc-800/60 rounded-lg p-3">
                          <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wide">{row.bet2_bookmaker}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{row.bet2_name}</p>
                          <OddsPill odds={odds2} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                        <div className="flex gap-1.5 flex-wrap">
                          {[row.bet1_bookmaker, row.bet2_bookmaker].filter(Boolean).map((bk) => {
                            const has = userAccountSet.has((bk ?? "").toLowerCase().trim());
                            return (
                              <span key={bk} className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                has ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                    : "bg-zinc-800 border-zinc-700 text-zinc-500"
                              }`}>
                                {bk}: {has ? "✓" : "No acct"}
                              </span>
                            );
                          })}
                        </div>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 ml-2 shrink-0"
                          onClick={() => setConfirmBet({
                            type: "standard", eventName: row.event_name || "",
                            legs: [
                              { bookmaker: row.bet1_bookmaker || "", odds: odds1, outcome: row.bet1_name || "", url: getBookmakerUrl(row.bet1_bookmaker || "") },
                              { bookmaker: row.bet2_bookmaker || "", odds: odds2, outcome: row.bet2_name || "", url: getBookmakerUrl(row.bet2_bookmaker || "") },
                            ],
                          })}
                        >
                          {paperMode ? "Track" : "Place Bets"}
                        </Button>
                      </div>
                      {row.updated_ago && <p className="text-[11px] text-zinc-600 mt-2">Updated: {row.updated_ago}</p>}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* ══════════════ PROMOS ══════════════ */}
        <TabsContent value="promos" className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base text-white">Current Promotions</h2>
            <span className="text-xs text-zinc-500">{imperialPromos?.length || 0} promos</span>
          </div>
          {!imperialPromos || imperialPromos.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <Gift className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 text-sm">No promos yet — tap Refresh above</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-4 pr-1">
                {Object.entries(promosByBookmaker).map(([bookmakerKey, promos]) => {
                  const bookmaker = promos?.[0]?.bookmaker || bookmakerKey;
                  const hasAccount = userAccountSet.has(bookmakerKey);
                  const intelRow = (imperialBookmakers || []).find(
                    (b) => b.bookmaker_name.toLowerCase().trim() === bookmakerKey
                  );
                  return (
                    <div key={bookmaker} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <h3 className="font-bold text-sm text-white">{bookmaker}</h3>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                          hasAccount
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-zinc-800 border-zinc-700 text-zinc-500"
                        }`}>
                          {hasAccount ? "✓ Account" : "No account"}
                        </span>
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
                      <div className="space-y-2">
                        {(promos || []).map((promo) => (
                          <div key={promo.id} className="bg-zinc-800/60 rounded-lg p-3 flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              {promo.track && promo.track.length < 60 && (
                                <p className="text-[11px] text-zinc-500 mb-0.5">{promo.track}{promo.races ? ` · ${promo.races}` : ""}</p>
                              )}
                              <p className="text-sm font-medium text-white">{promo.promotion}</p>
                              {promo.track && promo.track.length >= 60 && (
                                <p className="text-xs text-zinc-500 mt-1 italic">{promo.track}</p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0 border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs h-7"
                              onClick={() => setConfirmBet({
                                type: "promo",
                                eventName: `${bookmaker} promotion`,
                                legs: [],
                                promo: {
                                  name: promo.promotion || "",
                                  terms: promo.track && promo.track.length >= 60 ? promo.track : (promo.races || ""),
                                  bookmaker,
                                  url: getBookmakerUrl(bookmaker),
                                },
                              })}
                            >
                              Claim
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* ══════════════ BOOKS ══════════════ */}
        <TabsContent value="books" className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base text-white">Bookmaker Intelligence</h2>
            <span className="text-xs text-zinc-500">{imperialBookmakers?.length || 0} bookmakers</span>
          </div>
          {!imperialBookmakers || imperialBookmakers.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <ShieldCheck className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 text-sm">No data yet — tap Refresh above</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-3 pr-1">
                {imperialBookmakers.map((bk) => {
                  const hasAccount = userAccountSet.has(bk.bookmaker_name.toLowerCase().trim());
                  const userAcc = (userBookmakers || []).find(
                    (a) => a.bookmaker.toLowerCase().trim() === bk.bookmaker_name.toLowerCase().trim()
                  );
                  return (
                    <div key={bk.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
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
                              <span className="text-[11px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-400">
                                {bk.importance}
                              </span>
                            )}
                          </div>
                          {bk.platform && <p className="text-xs text-zinc-500 mt-0.5">{bk.platform}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            hasAccount
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-zinc-800 border-zinc-700 text-zinc-500"
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
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                        {bk.promo_ban_risk && (
                          <div className="bg-zinc-800/60 rounded-lg p-2">
                            <p className="text-zinc-500">Promo ban risk</p>
                            <p className={`font-semibold mt-0.5 ${
                              bk.promo_ban_risk.toLowerCase().includes("low") ? "text-emerald-400" : "text-red-400"
                            }`}>{bk.promo_ban_risk}</p>
                          </div>
                        )}
                        {bk.signup_bonus && (
                          <div className="bg-zinc-800/60 rounded-lg p-2">
                            <p className="text-zinc-500">Sign-up bonus</p>
                            <p className="font-semibold mt-0.5 text-emerald-400">{bk.signup_bonus}</p>
                          </div>
                        )}
                        {bk.promo_offering && (
                          <div className="bg-zinc-800/60 rounded-lg p-2">
                            <p className="text-zinc-500">Promos</p>
                            <p className="font-semibold mt-0.5 text-white">{bk.promo_offering}</p>
                          </div>
                        )}
                        {bk.odds_boost && (
                          <div className="bg-zinc-800/60 rounded-lg p-2">
                            <p className="text-zinc-500">Odds boost</p>
                            <p className="font-semibold mt-0.5 text-white">{bk.odds_boost}</p>
                          </div>
                        )}
                      </div>
                      {!hasAccount && bk.signup_offers && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2 text-xs text-emerald-400">
                          <Star className="h-3 w-3 inline mr-1" />
                          <strong>Sign-up offer:</strong> {bk.signup_offers}
                        </div>
                      )}
                      {getPromoForBookmaker(bk.bookmaker_name).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-zinc-800">
                          <p className="text-[11px] text-zinc-500 mb-1">
                            {getPromoForBookmaker(bk.bookmaker_name).length} current promo(s)
                          </p>
                          <div className="space-y-0.5">
                            {getPromoForBookmaker(bk.bookmaker_name).slice(0, 2).map((p) => (
                              <p key={p.id} className="text-xs text-zinc-400 leading-snug truncate">{p.promotion}</p>
                            ))}
                            {getPromoForBookmaker(bk.bookmaker_name).length > 2 && (
                              <button onClick={() => setSelectedTab("promos")} className="text-xs text-emerald-400 underline">
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
            </ScrollArea>
          )}
        </TabsContent>

        {/* ══════════════ AI CHAT ══════════════ */}
        <TabsContent value="chat" className="p-0 flex flex-col" style={{ height: "calc(100vh - 200px)" }}>
          <BettingChatBox />
        </TabsContent>

        {/* ══════════════ CALCULATOR ══════════════ */}
        <TabsContent value="calc" className="p-4">
          <h2 className="font-bold text-base text-white mb-4">Betting Calculators</h2>
          <BettingCalculators />
        </TabsContent>

        {/* ══════════════ HISTORY ══════════════ */}
        <TabsContent value="history" className="p-4">
          {paperMode ? (
            // ── Paper trading history ──
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-bold text-base text-white">Paper Trading History</h2>
                  <p className="text-xs text-zinc-500">Virtual bets — no real money involved</p>
                </div>
                <FlaskConical className="h-5 w-5 text-[#C9A227]" />
              </div>
              {(() => {
                const won = paperBets.filter(b => b.status === "won");
                const lost = paperBets.filter(b => b.status === "lost");
                const virtualPL = won.reduce((s, b) => s + (b.stake * b.odds - b.stake), 0)
                  - lost.reduce((s, b) => s + b.stake, 0);
                return (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <StatCard label="Virtual P&L" value={`${virtualPL >= 0 ? "+" : ""}$${virtualPL.toFixed(2)}`} positive={virtualPL >= 0} />
                    <StatCard label="Bets Tracked" value={String(paperBets.length)} sub={`${won.length} won · ${lost.length} lost`} />
                    <StatCard label="Win Rate" value={paperBets.filter(b => b.status !== "pending").length > 0 ? `${Math.round(won.length / paperBets.filter(b => b.status !== "pending").length * 100)}%` : "—"} />
                  </div>
                );
              })()}
              {paperBets.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                  <FlaskConical className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm">No paper bets yet</p>
                  <p className="text-zinc-600 text-xs mt-1">Tap "Place Bets" on any opportunity to track it here</p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-420px)]">
                  <div className="space-y-2 pr-1">
                    {paperBets.map((bet) => (
                      <div key={bet.id} className="bg-zinc-900 border border-[#C9A227]/20 rounded-xl p-3 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-white truncate">{bet.event}</p>
                          <p className="text-xs text-zinc-500">{bet.bookmaker} @ {bet.odds} · ${bet.stake}</p>
                          <p className="text-[11px] text-zinc-600">{new Date(bet.loggedAt).toLocaleDateString()}</p>
                        </div>
                        {bet.status === "pending" ? (
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={() => { settlePaperBet(bet.id, "won"); refreshPaperBets(); }}
                              className="text-xs px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                            >Won</button>
                            <button
                              onClick={() => { settlePaperBet(bet.id, "lost"); refreshPaperBets(); }}
                              className="text-xs px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20"
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
                </ScrollArea>
              )}
            </>
          ) : (
            // ── Real bet history ──
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-base text-white">Bet History</h2>
                <span className="text-xs text-zinc-500">{bets?.length || 0} bets</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <StatCard label="Total P&L" value={`${isPositive ? "+" : ""}$${stats?.totalProfit || "0.00"}`} positive={isPositive} />
                <StatCard label="Win Rate" value={`${stats?.winRate || "0"}%`} sub={`${stats?.wonBets || 0} won`} />
                <StatCard label="Total Bets" value={String((bets?.length || 0))} sub={`${stats?.pendingBets || 0} pending`} />
              </div>
              {!bets || bets.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                  <Clock className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm">No bets placed yet</p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-420px)]">
                  <div className="space-y-2 pr-1">
                    {bets.map((bet) => (
                      <div key={bet.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="font-semibold text-sm text-white truncate">{bet.event}</p>
                          <p className="text-xs text-zinc-500">{bet.bookmaker} · {bet.sport} · @ {bet.odds}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                            bet.status === "won" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : bet.status === "lost" ? "bg-red-500/20 text-red-400 border-red-500/30"
                            : "bg-zinc-700/40 text-zinc-400 border-zinc-600/30"
                          }`}>{bet.status}</span>
                          <p className="text-xs text-zinc-400 mt-0.5">${bet.stake}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ══ HOW IT WORKS DIALOG ══ */}
      <Dialog open={showHowItWorks} onOpenChange={setShowHowItWorks}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" /> How placing bets works
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-zinc-300 leading-relaxed">
            <p>Sick Punt is a <strong className="text-white">research and tracking tool</strong>. It never places bets on your behalf and never touches your money.</p>
            <div className="bg-zinc-800/60 rounded-xl p-3 space-y-2">
              <p className="font-semibold text-white text-xs uppercase tracking-wide">When you tap "Place Bets":</p>
              <p>✓ The bet is <strong>logged in your personal history</strong> so you can track your results over time.</p>
              <p>✓ The bookmaker's website opens in a new tab so you can place the bet yourself.</p>
              <p>✓ <strong>You are in full control</strong> — nothing happens without you acting on the bookmaker's site.</p>
            </div>
            <p className="text-zinc-400 text-xs">All transactions go directly between you and the licensed, regulated bookmaker. Sick Punt is never in the middle.</p>
            <div className="bg-[#C9A227]/10 border border-[#C9A227]/30 rounded-xl p-3">
              <p className="font-semibold text-[#C9A227] text-xs mb-1">💡 Not ready for real money?</p>
              <p className="text-xs text-zinc-300">Enable <strong>Paper Mode</strong> (top of screen) to track predictions virtually — see what you would have won without risking anything.</p>
            </div>
          </div>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white mt-2" onClick={() => setShowHowItWorks(false)}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════
          PLACE BETS DIALOG — Arb tab
      ══════════════════════════════════════════════════════════════ */}
      <Dialog
        open={!!placeBetOpp}
        onOpenChange={(open) => { if (!open) { setPlaceBetOpp(null); setBetPlaced(false); setBetStake(""); } }}
      >
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-white">
                {paperMode ? "Track This Bet (Paper)" : "Place Bets"}
              </DialogTitle>
              <button onClick={() => setShowHowItWorks(true)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <Info className="h-4 w-4" />
              </button>
            </div>
            <DialogDescription className="text-zinc-400">
              {paperMode
                ? "This will be logged as a virtual bet — no real money involved."
                : "Log both legs, then visit each bookmaker's site to place your bets."}
            </DialogDescription>
          </DialogHeader>

          {betPlaced ? (
            <div className="flex flex-col items-center gap-3 py-6 text-emerald-400">
              <CheckCircle className="h-12 w-12" />
              <p className="font-bold text-lg text-white">Bets logged!</p>
              <p className="text-sm text-zinc-400">Now visit each bookmaker to place the bets.</p>
              {placeBetOpp && (
                <div className="flex gap-3 mt-2">
                  <Button variant="outline" className="border-zinc-700 text-zinc-300" asChild>
                    <a href={getBookmakerUrl(placeBetOpp.bookmaker1)} target="_blank" rel="noopener noreferrer">
                      {placeBetOpp.bookmaker1} <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                  <Button variant="outline" className="border-zinc-700 text-zinc-300" asChild>
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
                <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 p-3 text-sm space-y-2">
                  <p className="font-semibold text-white">{String(placeBetOpp.event)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-zinc-500 text-xs">Leg 1 — {placeBetOpp.bookmaker1}</p>
                      <p className="font-medium text-white">{String(placeBetOpp.outcome1)} @ {placeBetOpp.odds1}</p>
                      {stakes && <p className="text-emerald-400 font-bold">Stake: ${stakes.stake1}</p>}
                    </div>
                    <div>
                      <p className="text-zinc-500 text-xs">Leg 2 — {placeBetOpp.bookmaker2}</p>
                      <p className="font-medium text-white">{String(placeBetOpp.outcome2)} @ {placeBetOpp.odds2}</p>
                      {stakes && <p className="text-emerald-400 font-bold">Stake: ${stakes.stake2}</p>}
                    </div>
                  </div>
                  {stakes && (
                    <div className="pt-2 border-t border-zinc-700 text-center">
                      <p className="text-emerald-400 font-black text-base">Guaranteed profit: +${stakes.profit}</p>
                      <p className="text-xs text-zinc-500">ROI: {stakes.roi}%</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-300">Total Stake ($)</Label>
                  <Input
                    type="number"
                    value={betStake}
                    onChange={(e) => setBetStake(e.target.value)}
                    placeholder="e.g. 200"
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                  {stakes && <p className="text-xs text-zinc-500">Split: ${stakes.stake1} + ${stakes.stake2}</p>}
                </div>
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
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

      {/* ══════════════════════════════════════════════════════════════
          CONFIRM MODAL — Sports Max, Middles, Promos
      ══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!confirmBet} onOpenChange={(open) => { if (!open) setConfirmBet(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Confirm Before You Bet</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {confirmBet?.type === "promo"
                ? "Verify this promotion is showing on the bookmaker site and that you are eligible before proceeding."
                : "Verify these odds still match on the bookmaker site before placing."}
            </DialogDescription>
          </DialogHeader>

          {confirmBet && (
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 p-3 space-y-3">
                <p className="font-bold text-sm text-white">{confirmBet.eventName}</p>

                {confirmBet.legs.length > 0 && (
                  <div className="space-y-2">
                    {confirmBet.legs.map((leg, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm text-white">{leg.bookmaker}</p>
                          <p className="text-xs text-zinc-500">{leg.outcome}</p>
                        </div>
                        <OddsPill odds={Number(leg.odds)} />
                      </div>
                    ))}
                  </div>
                )}

                {confirmBet.type === "promo" && confirmBet.promo && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wide font-semibold">Promotion</p>
                    <p className="text-sm font-medium text-white">{confirmBet.promo.name}</p>
                    {confirmBet.promo.terms && (
                      <>
                        <p className="text-[11px] text-zinc-500 uppercase tracking-wide font-semibold mt-2">Terms</p>
                        <p className="text-xs text-zinc-400 leading-relaxed">{confirmBet.promo.terms}</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                {confirmBet.legs.map((leg) => (
                  <Button key={leg.bookmaker} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white" asChild>
                    <a href={leg.url} target="_blank" rel="noopener noreferrer">
                      {leg.bookmaker} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </a>
                  </Button>
                ))}
                {confirmBet.type === "promo" && confirmBet.promo && (
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white" asChild>
                    <a href={confirmBet.promo.url} target="_blank" rel="noopener noreferrer">
                      Visit {confirmBet.promo.bookmaker} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </a>
                  </Button>
                )}
              </div>
              <Button variant="outline" className="w-full border-zinc-700 text-zinc-400" onClick={() => setConfirmBet(null)}>
                Cancel
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
