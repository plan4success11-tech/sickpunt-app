import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TrendingUp, AlertCircle, MessageSquare, Bell, BarChart3,
  RefreshCw, CheckCircle, ShieldCheck, Gift, Star, ExternalLink
} from "lucide-react";
import { BettingChatBox } from "@/components/BettingChatBox";
import { BettingCalculators } from "@/components/BettingCalculators";
import type { Opportunity } from "../../../drizzle/schema";

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
    crownbet: "https://www.crownbet.com.au",
    swiftbet: "https://www.swiftbet.com.au",
    next2go: "https://www.next2go.com.au",
    betaus: "https://www.betaus.com.au",
    bet777: "https://www.bet777.com.au",
    playup: "https://www.playup.com.au",
  };
  const key = name.toLowerCase().replace(/[\s.]/g, "");
  return map[key] || `https://www.google.com/search?q=${encodeURIComponent(name + " australia betting")}`;
}

// ── Confirmation modal data type ──────────────────────────────────────────────
type ConfirmBet = {
  type: "standard" | "promo";
  eventName: string;
  legs: { bookmaker: string; odds: number; outcome: string; url: string }[];
  promo?: { name: string; terms: string; bookmaker: string; url: string };
};

// ── Risk / tier colour helpers ────────────────────────────────────────────────
function riskColour(risk: string | null | undefined) {
  const r = (risk || "").toLowerCase();
  if (r.includes("low")) return "default";
  if (r.includes("med")) return "secondary";
  return "destructive";
}

function tierColour(tier: string | null | undefined) {
  const t = (tier || "").toLowerCase();
  if (t === "tier 1" || t === "1") return "bg-green-100 text-green-800 border-green-300";
  if (t === "tier 2" || t === "2") return "bg-blue-100 text-blue-800 border-blue-300";
  return "bg-gray-100 text-gray-700 border-gray-300";
}

export default function Dashboard() {
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState("opportunities");
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

  // ── Place bet (Arb tab — logs to DB) ──────────────────────────────────────
  const handlePlaceBets = async () => {
    if (!placeBetOpp || !betStake) return;
    const totalStake = parseFloat(betStake);
    if (isNaN(totalStake) || totalStake <= 0) return;

    const odds1 = parseFloat(placeBetOpp.odds1);
    const odds2 = parseFloat(placeBetOpp.odds2);
    const { stake1, stake2 } = calcArbStakes(odds1, odds2, totalStake);

    await createBetMutation.mutateAsync({
      opportunityId: placeBetOpp.id,
      bookmaker: placeBetOpp.bookmaker1,
      sport: placeBetOpp.sport,
      event: String(placeBetOpp.event),
      market: placeBetOpp.market,
      outcome: String(placeBetOpp.outcome1),
      odds: placeBetOpp.odds1,
      stake: stake1,
    });
    await createBetMutation.mutateAsync({
      opportunityId: placeBetOpp.id,
      bookmaker: placeBetOpp.bookmaker2,
      sport: placeBetOpp.sport,
      event: String(placeBetOpp.event),
      market: placeBetOpp.market,
      outcome: String(placeBetOpp.outcome2),
      odds: placeBetOpp.odds2,
      stake: stake2,
    });

    setBetPlaced(true);
    setTimeout(() => {
      setPlaceBetOpp(null);
      setBetPlaced(false);
      setBetStake("");
    }, 1800);
  };

  // ── Trigger Imperial ingestion then refetch all data ──────────────────────
  const handleRefreshData = async () => {
    await triggerImperialIngestion.mutateAsync({ mode: "all", pages: 3 });
    await Promise.all([refetchImperialStatus(), refetchSportsMax(), refetchMiddleMax(), refetchOpportunities()]);
  };

  const getQualityBadge = (roi: string) => {
    const roiNum = parseFloat(roi);
    if (roiNum >= 10) return <Badge className="bg-green-600">Excellent</Badge>;
    if (roiNum >= 5) return <Badge className="bg-blue-600">Good</Badge>;
    if (roiNum >= 2) return <Badge className="bg-yellow-600">Fair</Badge>;
    return <Badge variant="secondary">Poor</Badge>;
  };

  // Group promotions by bookmaker (lowercase key)
  const promosByBookmaker: Record<string, typeof imperialPromos> = {};
  for (const promo of imperialPromos || []) {
    const bk = (promo.bookmaker || "Unknown").toLowerCase().trim();
    if (!promosByBookmaker[bk]) promosByBookmaker[bk] = [];
    promosByBookmaker[bk]!.push(promo);
  }
  const getPromoForBookmaker = (name: string) =>
    promosByBookmaker[(name || "").toLowerCase().trim()] ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Sick Punt</h1>
              <p className="text-muted-foreground mt-0.5 text-sm">Welcome back, {user?.name || "User"}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="default"
                size="sm"
                onClick={handleRefreshData}
                disabled={triggerImperialIngestion.isPending}
              >
                {triggerImperialIngestion.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Refreshing...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" /><span className="hidden sm:inline">Refresh Imperial Data</span><span className="sm:hidden">Refresh</span></>
                )}
              </Button>
              <Button variant="outline" size="sm" className="relative">
                <Bell className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Notifications</span>
                {notifications && notifications.length > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                    {notifications.length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${parseFloat(stats?.totalProfit || "0") >= 0 ? "text-green-600" : "text-red-600"}`}>
                ${stats?.totalProfit || "0.00"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">ROI: {stats?.roi || "0"}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Bets</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.pendingBets || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Win Rate: {stats?.winRate || "0"}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sports Max Opps</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sportsMax?.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">From Imperial Wealth</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Live Promos</CardTitle>
              <Gift className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{imperialPromos?.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">From Imperial Wealth</p>
            </CardContent>
          </Card>
        </div>

        {/* Imperial Status */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Imperial Ingestion Status</CardTitle>
            <CardDescription>Data freshness — all intelligence sourced directly from Imperial Wealth</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              {[
                ["Odds Rows", imperialStatus?.counts?.oddsComparison],
                ["Sports Max", imperialStatus?.counts?.sportsMaximiser],
                ["Middles", imperialStatus?.counts?.middleMaximiser],
                ["Promotions", imperialStatus?.counts?.promotions],
                ["Bookmakers", imperialStatus?.counts?.bookmakerIntelligence],
              ].map(([label, count]) => (
                <div key={String(label)}>
                  <p className="text-muted-foreground">{label}</p>
                  <p className="font-medium text-lg">{count ?? "N/A"}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-6 text-xs text-muted-foreground">
              <span>Last success: {imperialStatus?.lastSuccessAt ? new Date(imperialStatus.lastSuccessAt).toLocaleString() : "Never"}</span>
              <span>Running: {imperialStatus?.isRunning ? "Yes" : "No"}</span>
              <span>Auto-refresh: every 15 mins</span>
            </div>
            {imperialStatus?.lastError && (
              <div className="mt-3 p-3 rounded border border-red-500/20 bg-red-500/5">
                <p className="text-xs text-red-600 font-medium">Last Error</p>
                <p className="text-xs text-red-700 whitespace-pre-wrap mt-1">{imperialStatus.lastError}</p>
              </div>
            )}
            <div className="mt-4">
              <Button variant="outline" onClick={handleRefreshData} disabled={triggerImperialIngestion.isPending}>
                {triggerImperialIngestion.isPending ? "Running..." : "Run Imperial Ingestion Now"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList className="flex w-full overflow-x-auto gap-0.5 h-auto flex-nowrap p-1">
                <TabsTrigger value="opportunities" className="shrink-0 text-xs sm:text-sm">Arb</TabsTrigger>
                <TabsTrigger value="sports" className="shrink-0 text-xs sm:text-sm whitespace-nowrap">Sports Max</TabsTrigger>
                <TabsTrigger value="middles" className="shrink-0 text-xs sm:text-sm">Middles</TabsTrigger>
                <TabsTrigger value="promotions" className="shrink-0 text-xs sm:text-sm">Promos</TabsTrigger>
                <TabsTrigger value="bookmakers" className="shrink-0 text-xs sm:text-sm">Books</TabsTrigger>
                <TabsTrigger value="calculators" className="shrink-0 text-xs sm:text-sm">Calc</TabsTrigger>
              </TabsList>

              {/* ── ARBITRAGE OPPORTUNITIES ── */}
              <TabsContent value="opportunities" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Arbitrage Opportunities</CardTitle>
                    <CardDescription>Guaranteed profit from Odds API scan — verify odds on-site before placing</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {opportunitiesLoading ? (
                      <div className="text-center py-8 text-muted-foreground">Loading...</div>
                    ) : opportunities && opportunities.length > 0 ? (
                      <ScrollArea className="h-[500px] pr-4">
                        <div className="space-y-4">
                          {opportunities.map((opp) => {
                            const odds1 = parseFloat(opp.odds1);
                            const odds2 = parseFloat(opp.odds2);
                            const stakes = (odds1 > 1 && odds2 > 1)
                              ? calcArbStakes(odds1, odds2, parseFloat(opp.recommendedStake) || 100)
                              : null;
                            return (
                              <Card key={opp.id} className="border-2 hover:border-primary transition-colors">
                                <CardHeader className="pb-2">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <CardTitle className="text-base">{opp.event}</CardTitle>
                                      <CardDescription className="mt-0.5">{opp.sport} • {opp.market}</CardDescription>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                      {getQualityBadge(opp.roi)}
                                      <Badge variant="outline" className="text-xs">{opp.type}</Badge>
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent className="pt-0">
                                  <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div className="bg-muted/40 rounded p-2">
                                      <p className="text-xs font-semibold text-muted-foreground">{opp.bookmaker1}</p>
                                      <p className="text-xs">{opp.outcome1}</p>
                                      <div className="flex items-center gap-2">
                                        <p className="text-lg font-bold text-primary">{opp.odds1}</p>
                                        {stakes && <p className="text-xs text-muted-foreground">→ ${stakes.stake1}</p>}
                                      </div>
                                    </div>
                                    <div className="bg-muted/40 rounded p-2">
                                      <p className="text-xs font-semibold text-muted-foreground">{opp.bookmaker2}</p>
                                      <p className="text-xs">{opp.outcome2}</p>
                                      <div className="flex items-center gap-2">
                                        <p className="text-lg font-bold text-primary">{opp.odds2}</p>
                                        {stakes && <p className="text-xs text-muted-foreground">→ ${stakes.stake2}</p>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between pt-2 border-t">
                                    <div>
                                      <p className="text-xs text-muted-foreground">ROI</p>
                                      <p className="text-xl font-bold text-green-600">{opp.roi}%</p>
                                    </div>
                                    {stakes && (
                                      <div className="text-center">
                                        <p className="text-xs text-muted-foreground">Profit on ${opp.recommendedStake}</p>
                                        <p className="text-base font-bold text-green-600">+${stakes.profit}</p>
                                      </div>
                                    )}
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setPlaceBetOpp(opp);
                                        setBetStake(opp.recommendedStake);
                                      }}
                                    >
                                      Place Bets
                                    </Button>
                                  </div>
                                  <div className="mt-2 flex gap-2 flex-wrap">
                                    {[opp.bookmaker1, opp.bookmaker2].map((bk) => {
                                      const hasAccount = userAccountSet.has(bk.toLowerCase().trim());
                                      return (
                                        <span key={bk} className={`text-xs px-2 py-0.5 rounded-full border ${hasAccount ? "bg-green-50 border-green-300 text-green-700" : "bg-orange-50 border-orange-300 text-orange-700"}`}>
                                          {bk}: {hasAccount ? "✓ Account" : "No account"}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="text-center py-12">
                        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No arbitrage opportunities found</p>
                        <p className="text-sm text-muted-foreground mt-2">Check the Sports Max tab for matched betting from Imperial Wealth</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── SPORTS MAXIMISER ── */}
              <TabsContent value="sports" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Sports Maximiser</CardTitle>
                    <CardDescription>Matched betting from Imperial Wealth — click "Place Bets" to verify odds and visit bookmaker</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!sportsMax || sportsMax.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <p>No data yet — click "Refresh Imperial Data" above.</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[540px] pr-4">
                        <div className="space-y-3">
                          {sportsMax.map((row) => {
                            const odds1 = Number(row.bet1_odds) || 0;
                            const odds2 = Number(row.bet2_odds) || 0;
                            const stakes = (odds1 > 1 && odds2 > 1)
                              ? calcArbStakes(odds1, odds2, 100)
                              : null;
                            const roi = Number(row.roi) || 0;
                            return (
                              <div key={row.id} className="border rounded-lg p-4 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium text-sm">{row.event_name}</p>
                                    <p className="text-xs text-muted-foreground">{row.sport}{row.league ? ` • ${row.league}` : ""}{row.market ? ` • ${row.market}` : ""}</p>
                                  </div>
                                  <Badge className={roi >= 5 ? "bg-green-600" : roi >= 2 ? "bg-blue-600" : "bg-yellow-600"}>
                                    {roi.toFixed(2)}% ROI
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-muted/40 rounded p-2">
                                    <p className="text-xs font-medium">{row.bet1_bookmaker}</p>
                                    <p className="text-xs text-muted-foreground">{row.bet1_name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-base font-bold text-primary">{odds1.toFixed(2)}</span>
                                      {stakes && <span className="text-xs text-muted-foreground">→ ${stakes.stake1}</span>}
                                    </div>
                                  </div>
                                  <div className="bg-muted/40 rounded p-2">
                                    <p className="text-xs font-medium">{row.bet2_bookmaker}</p>
                                    <p className="text-xs text-muted-foreground">{row.bet2_name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-base font-bold text-primary">{odds2.toFixed(2)}</span>
                                      {stakes && <span className="text-xs text-muted-foreground">→ ${stakes.stake2}</span>}
                                    </div>
                                  </div>
                                </div>
                                {stakes && (
                                  <p className="text-xs text-green-600 font-medium">Guaranteed profit on $100: +${stakes.profit}</p>
                                )}
                                <div className="flex items-center justify-between pt-1">
                                  <div className="flex gap-2 flex-wrap">
                                    {[row.bet1_bookmaker, row.bet2_bookmaker].filter(Boolean).map((bk) => {
                                      const hasAccount = userAccountSet.has((bk ?? "").toLowerCase().trim());
                                      return (
                                        <span key={bk} className={`text-xs px-2 py-0.5 rounded-full border ${hasAccount ? "bg-green-50 border-green-300 text-green-700" : "bg-orange-50 border-orange-300 text-orange-700"}`}>
                                          {bk}: {hasAccount ? "✓" : "No account"}
                                        </span>
                                      );
                                    })}
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => setConfirmBet({
                                      type: "standard",
                                      eventName: row.event_name || "",
                                      legs: [
                                        { bookmaker: row.bet1_bookmaker || "", odds: odds1, outcome: row.bet1_name || "", url: getBookmakerUrl(row.bet1_bookmaker || "") },
                                        { bookmaker: row.bet2_bookmaker || "", odds: odds2, outcome: row.bet2_name || "", url: getBookmakerUrl(row.bet2_bookmaker || "") },
                                      ],
                                    })}
                                  >
                                    Place Bets
                                  </Button>
                                </div>
                                {row.updated_ago && <p className="text-xs text-muted-foreground">Updated: {row.updated_ago}</p>}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── MIDDLE MAXIMISER ── */}
              <TabsContent value="middles" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Middle Maximiser</CardTitle>
                    <CardDescription>Middle betting from Imperial Wealth — profit if result lands between the two lines</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!middleMax || middleMax.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <p>No data yet — click "Refresh Imperial Data" above.</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[540px] pr-4">
                        <div className="space-y-3">
                          {middleMax.map((row) => {
                            const odds1 = Number(row.bet1_odds) || 0;
                            const odds2 = Number(row.bet2_odds) || 0;
                            const risk = Number(row.risk_pct) || 0;
                            return (
                              <div key={row.id} className="border rounded-lg p-4 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium text-sm">{row.event_name}</p>
                                    <p className="text-xs text-muted-foreground">{row.sport}{row.league ? ` • ${row.league}` : ""}{row.market ? ` • ${row.market}` : ""}</p>
                                  </div>
                                  <Badge className={risk <= 5 ? "bg-green-600" : risk <= 15 ? "bg-blue-600" : "bg-yellow-600"}>
                                    {risk.toFixed(1)}% risk
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-muted/40 rounded p-2">
                                    <p className="text-xs font-medium">{row.bet1_bookmaker}</p>
                                    <p className="text-xs text-muted-foreground">{row.bet1_name}</p>
                                    <p className="text-base font-bold text-primary mt-0.5">{odds1.toFixed(2)}</p>
                                  </div>
                                  <div className="bg-muted/40 rounded p-2">
                                    <p className="text-xs font-medium">{row.bet2_bookmaker}</p>
                                    <p className="text-xs text-muted-foreground">{row.bet2_name}</p>
                                    <p className="text-base font-bold text-primary mt-0.5">{odds2.toFixed(2)}</p>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between pt-1">
                                  <div className="flex gap-2 flex-wrap">
                                    {[row.bet1_bookmaker, row.bet2_bookmaker].filter(Boolean).map((bk) => {
                                      const hasAccount = userAccountSet.has((bk ?? "").toLowerCase().trim());
                                      return (
                                        <span key={bk} className={`text-xs px-2 py-0.5 rounded-full border ${hasAccount ? "bg-green-50 border-green-300 text-green-700" : "bg-orange-50 border-orange-300 text-orange-700"}`}>
                                          {bk}: {hasAccount ? "✓" : "No account"}
                                        </span>
                                      );
                                    })}
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => setConfirmBet({
                                      type: "standard",
                                      eventName: row.event_name || "",
                                      legs: [
                                        { bookmaker: row.bet1_bookmaker || "", odds: odds1, outcome: row.bet1_name || "", url: getBookmakerUrl(row.bet1_bookmaker || "") },
                                        { bookmaker: row.bet2_bookmaker || "", odds: odds2, outcome: row.bet2_name || "", url: getBookmakerUrl(row.bet2_bookmaker || "") },
                                      ],
                                    })}
                                  >
                                    Place Bets
                                  </Button>
                                </div>
                                {row.updated_ago && <p className="text-xs text-muted-foreground">Updated: {row.updated_ago}</p>}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── PROMOTIONS ── */}
              <TabsContent value="promotions" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Current Promotions</CardTitle>
                    <CardDescription>Live bookmaker promos from Imperial Wealth — check eligibility before claiming</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!imperialPromos || imperialPromos.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Gift className="h-12 w-12 mx-auto mb-3 opacity-40" />
                        <p>No promotions data yet. Click "Refresh Imperial Data".</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[540px] pr-4">
                        <div className="space-y-6">
                          {Object.entries(promosByBookmaker).map(([bookmakerKey, promos]) => {
                            const bookmaker = promos?.[0]?.bookmaker || bookmakerKey;
                            const hasAccount = userAccountSet.has(bookmakerKey);
                            const intelRow = (imperialBookmakers || []).find(
                              (b) => b.bookmaker_name.toLowerCase().trim() === bookmakerKey
                            );
                            return (
                              <div key={bookmaker}>
                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                  <h3 className="font-semibold text-base">{bookmaker}</h3>
                                  <Badge variant={hasAccount ? "default" : "secondary"}>
                                    {hasAccount ? "✓ You have an account" : "No account yet"}
                                  </Badge>
                                  {intelRow?.tier && (
                                    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${tierColour(intelRow.tier)}`}>
                                      {intelRow.tier}
                                    </span>
                                  )}
                                  {intelRow?.promo_ban_risk && (
                                    <Badge variant={riskColour(intelRow.promo_ban_risk)} className="text-xs">
                                      Ban risk: {intelRow.promo_ban_risk}
                                    </Badge>
                                  )}
                                </div>
                                <div className="space-y-2 pl-1">
                                  {(promos || []).map((promo) => (
                                    <div key={promo.id} className="border rounded p-3 text-sm">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                          {promo.track && promo.track.length < 60 && (
                                            <p className="font-medium text-xs text-muted-foreground mb-0.5">
                                              {promo.track}{promo.races ? ` · ${promo.races}` : ""}
                                            </p>
                                          )}
                                          {promo.races && (!promo.track || promo.track.length >= 60) && (
                                            <p className="text-xs text-muted-foreground mb-0.5">{promo.races}</p>
                                          )}
                                          <p className="font-medium">{promo.promotion}</p>
                                          {promo.track && promo.track.length >= 60 && (
                                            <p className="text-xs text-muted-foreground mt-1 italic">{promo.track}</p>
                                          )}
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                          {promo.account_specific ? (
                                            <Badge variant="outline" className="text-xs">Account specific</Badge>
                                          ) : null}
                                          <Button
                                            size="sm"
                                            variant="outline"
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
                                            Claim Promo
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── BOOKMAKER INTELLIGENCE ── */}
              <TabsContent value="bookmakers" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Bookmaker Intelligence</CardTitle>
                    <CardDescription>Live data from Imperial Wealth — tier ratings, promo ban risk, and your account status</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!imperialBookmakers || imperialBookmakers.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-40" />
                        <p>No data yet — click "Refresh Imperial Data".</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[600px] pr-4">
                        <div className="space-y-3">
                          {imperialBookmakers.map((bk) => {
                            const hasAccount = userAccountSet.has(bk.bookmaker_name.toLowerCase().trim());
                            const userAcc = (userBookmakers || []).find(
                              (a) => a.bookmaker.toLowerCase().trim() === bk.bookmaker_name.toLowerCase().trim()
                            );
                            return (
                              <div key={bk.id} className="border rounded-lg p-4">
                                <div className="flex items-start justify-between gap-3 mb-3">
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h3 className="font-semibold text-base">{bk.bookmaker_name}</h3>
                                      {bk.tier && (
                                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${tierColour(bk.tier)}`}>
                                          {bk.tier}
                                        </span>
                                      )}
                                      {bk.importance && (
                                        <Badge variant="outline" className="text-xs">{bk.importance}</Badge>
                                      )}
                                    </div>
                                    {bk.platform && <p className="text-xs text-muted-foreground mt-0.5">{bk.platform}</p>}
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    <Badge variant={hasAccount ? "default" : "secondary"}>
                                      {hasAccount ? "✓ Account" : "No account"}
                                    </Badge>
                                    {userAcc?.healthScore != null && (
                                      <Badge variant={userAcc.healthScore >= 80 ? "default" : "destructive"}>
                                        Health: {userAcc.healthScore}/100
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                                  {bk.promo_ban_risk && (
                                    <div className="bg-muted/40 rounded p-2">
                                      <p className="text-muted-foreground">Promo ban risk</p>
                                      <Badge variant={riskColour(bk.promo_ban_risk)} className="text-xs mt-0.5">{bk.promo_ban_risk}</Badge>
                                    </div>
                                  )}
                                  {bk.signup_bonus && (
                                    <div className="bg-muted/40 rounded p-2">
                                      <p className="text-muted-foreground">Sign-up bonus</p>
                                      <p className="font-medium mt-0.5 text-green-700">{bk.signup_bonus}</p>
                                    </div>
                                  )}
                                  {bk.promo_offering && (
                                    <div className="bg-muted/40 rounded p-2">
                                      <p className="text-muted-foreground">Promo offering</p>
                                      <p className="font-medium mt-0.5">{bk.promo_offering}</p>
                                    </div>
                                  )}
                                  {bk.odds_boost && (
                                    <div className="bg-muted/40 rounded p-2">
                                      <p className="text-muted-foreground">Odds boost</p>
                                      <p className="font-medium mt-0.5">{bk.odds_boost}</p>
                                    </div>
                                  )}
                                  {bk.same_race_multi && (
                                    <div className="bg-muted/40 rounded p-2">
                                      <p className="text-muted-foreground">Same race multi</p>
                                      <p className="font-medium mt-0.5">{bk.same_race_multi}</p>
                                    </div>
                                  )}
                                  {bk.more_places && (
                                    <div className="bg-muted/40 rounded p-2">
                                      <p className="text-muted-foreground">More places</p>
                                      <p className="font-medium mt-0.5">{bk.more_places}</p>
                                    </div>
                                  )}
                                  {bk.optin_racing && (
                                    <div className="bg-muted/40 rounded p-2">
                                      <p className="text-muted-foreground">Opt-in racing</p>
                                      <p className="font-medium mt-0.5">{bk.optin_racing}</p>
                                    </div>
                                  )}
                                  {bk.optin_sports && (
                                    <div className="bg-muted/40 rounded p-2">
                                      <p className="text-muted-foreground">Opt-in sports</p>
                                      <p className="font-medium mt-0.5">{bk.optin_sports}</p>
                                    </div>
                                  )}
                                </div>
                                {!hasAccount && bk.signup_offers && (
                                  <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-800 mb-2">
                                    <Star className="h-3 w-3 inline mr-1" />
                                    <strong>Sign-up offer:</strong> {bk.signup_offers}
                                  </div>
                                )}
                                {bk.sustainability && (
                                  <p className="text-xs text-muted-foreground mt-1 italic">{bk.sustainability}</p>
                                )}
                                {getPromoForBookmaker(bk.bookmaker_name).length > 0 && (
                                  <div className="mt-2 pt-2 border-t">
                                    <p className="text-xs font-semibold text-muted-foreground mb-1">
                                      Current promos ({getPromoForBookmaker(bk.bookmaker_name).length})
                                    </p>
                                    <div className="space-y-1">
                                      {getPromoForBookmaker(bk.bookmaker_name).slice(0, 3).map((p) => (
                                        <p key={p.id} className="text-xs text-foreground/80 leading-snug">
                                          {p.track && p.track.length < 60 ? <span className="text-muted-foreground">{p.track}: </span> : null}
                                          {p.promotion}
                                        </p>
                                      ))}
                                      {getPromoForBookmaker(bk.bookmaker_name).length > 3 && (
                                        <button onClick={() => setSelectedTab("promotions")} className="text-xs text-primary underline">
                                          +{getPromoForBookmaker(bk.bookmaker_name).length - 3} more — view Promos tab
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
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── CALCULATORS ── */}
              <TabsContent value="calculators" className="mt-6">
                <BettingCalculators />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column — AI Chat + Recent Bets */}
          <div className="lg:col-span-1">
            <Card className="h-[700px] flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  <CardTitle>AI Betting Assistant</CardTitle>
                </div>
                <CardDescription>Ask about strategies, opportunities, and calculations</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0">
                <BettingChatBox />
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recent Bets</CardTitle>
              </CardHeader>
              <CardContent>
                {bets && bets.length > 0 ? (
                  <div className="space-y-2">
                    {bets.slice(0, 5).map((bet) => (
                      <div key={bet.id} className="flex items-center justify-between text-sm">
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="font-medium truncate">{bet.event}</p>
                          <p className="text-xs text-muted-foreground">{bet.bookmaker} @ {bet.odds}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <Badge variant={bet.status === "won" ? "default" : bet.status === "lost" ? "destructive" : "secondary"} className="text-xs">
                            {bet.status}
                          </Badge>
                          <p className="text-xs mt-0.5">${bet.stake}</p>
                        </div>
                      </div>
                    ))}
                    {bets.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center pt-1">+{bets.length - 5} more bets</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No bets placed yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PLACE BETS DIALOG — Arb tab (logs bet to DB + shows bookmaker links)
      ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={!!placeBetOpp}
        onOpenChange={(open) => { if (!open) { setPlaceBetOpp(null); setBetPlaced(false); setBetStake(""); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place Bets</DialogTitle>
            <DialogDescription>Log both legs and visit each bookmaker to place your bets.</DialogDescription>
          </DialogHeader>

          {betPlaced ? (
            <div className="flex flex-col items-center gap-3 py-6 text-green-600">
              <CheckCircle className="h-12 w-12" />
              <p className="font-semibold text-lg">Bets logged!</p>
              <p className="text-sm text-muted-foreground">Now visit each bookmaker below to place the bets.</p>
              {placeBetOpp && (
                <div className="flex gap-3 mt-2">
                  <Button variant="outline" asChild>
                    <a href={getBookmakerUrl(placeBetOpp.bookmaker1)} target="_blank" rel="noopener noreferrer">
                      {placeBetOpp.bookmaker1} <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                  <Button variant="outline" asChild>
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
            const stakes = (odds1 > 1 && odds2 > 1 && totalStake > 0)
              ? calcArbStakes(odds1, odds2, totalStake)
              : null;
            return (
              <div className="space-y-4">
                <div className="rounded-lg border p-3 bg-muted/40 text-sm space-y-2">
                  <p className="font-medium">{String(placeBetOpp.event)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-muted-foreground text-xs">Leg 1 — {placeBetOpp.bookmaker1}</p>
                      <p className="font-medium">{String(placeBetOpp.outcome1)} @ {placeBetOpp.odds1}</p>
                      {stakes && <p className="text-green-700 font-semibold">Stake: ${stakes.stake1}</p>}
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Leg 2 — {placeBetOpp.bookmaker2}</p>
                      <p className="font-medium">{String(placeBetOpp.outcome2)} @ {placeBetOpp.odds2}</p>
                      {stakes && <p className="text-green-700 font-semibold">Stake: ${stakes.stake2}</p>}
                    </div>
                  </div>
                  {stakes && (
                    <div className="pt-2 border-t text-center">
                      <p className="text-green-600 font-bold text-base">Guaranteed profit: +${stakes.profit}</p>
                      <p className="text-xs text-muted-foreground">ROI: {stakes.roi}%</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Total Stake ($)</Label>
                  <Input type="number" value={betStake} onChange={(e) => setBetStake(e.target.value)} placeholder="e.g. 200" />
                  {stakes && (
                    <p className="text-xs text-muted-foreground">Proportional split: ${stakes.stake1} + ${stakes.stake2}</p>
                  )}
                </div>
                <Button
                  className="w-full"
                  onClick={handlePlaceBets}
                  disabled={!betStake || parseFloat(betStake) <= 0 || createBetMutation.isPending}
                >
                  {createBetMutation.isPending ? "Logging..." : "Confirm & Log Bets"}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════
          CONFIRMATION MODAL — Sports Max, Middles, Promos
      ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!confirmBet} onOpenChange={(open) => { if (!open) setConfirmBet(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Before You Bet</DialogTitle>
            <DialogDescription>
              {confirmBet?.type === "promo"
                ? "Verify this promotion is showing on the bookmaker site and that you are eligible before proceeding."
                : "These are the odds AI Scout identified. Verify they still match on the bookmaker site before placing your bet."}
            </DialogDescription>
          </DialogHeader>

          {confirmBet && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 bg-muted/40 space-y-3">
                <p className="font-semibold text-sm">{confirmBet.eventName}</p>

                {/* Standard bet legs */}
                {confirmBet.legs.length > 0 && (
                  <div className="space-y-2">
                    {confirmBet.legs.map((leg, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium">{leg.bookmaker}</p>
                          <p className="text-xs text-muted-foreground">{leg.outcome}</p>
                        </div>
                        <p className="text-lg font-bold text-primary">{Number(leg.odds).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Promo detail */}
                {confirmBet.type === "promo" && confirmBet.promo && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Promotion</p>
                    <p className="text-sm font-medium">{confirmBet.promo.name}</p>
                    {confirmBet.promo.terms && (
                      <>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">Terms</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{confirmBet.promo.terms}</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Warning */}
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                {confirmBet.type === "promo" ? (
                  <>
                    <p className="font-semibold">Before proceeding:</p>
                    <p>• Confirm this promotion is visible on the bookmaker site.</p>
                    <p>• Confirm you are eligible (e.g. new customer, opted in, account not restricted).</p>
                    <p>• Do not proceed if the promotion is not showing or has expired.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">Before proceeding:</p>
                    <p>• When you land on the bookmaker site, confirm these exact odds are still showing.</p>
                    <p>• If the odds have moved, do not place the bet — the arbitrage may no longer be profitable.</p>
                    <p>• Place both legs as quickly as possible to lock in the opportunity.</p>
                  </>
                )}
              </div>

              {/* Buttons */}
              <div className="space-y-2">
                {confirmBet.legs.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {confirmBet.legs.map((leg, i) => (
                      <Button key={i} asChild className="w-full">
                        <a href={leg.url} target="_blank" rel="noopener noreferrer">
                          I understand — {leg.bookmaker} <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    ))}
                  </div>
                ) : confirmBet.promo && (
                  <Button asChild className="w-full">
                    <a href={confirmBet.promo.url} target="_blank" rel="noopener noreferrer">
                      I understand — take me to {confirmBet.promo.bookmaker} <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                )}
                <Button variant="outline" className="w-full" onClick={() => setConfirmBet(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
