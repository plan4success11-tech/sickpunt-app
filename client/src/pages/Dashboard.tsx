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
import { TrendingUp, AlertCircle, MessageSquare, Bell, BarChart3, RefreshCw, Zap, CheckCircle } from "lucide-react";
import { BettingChatBox } from "@/components/BettingChatBox";
import { BettingCalculators } from "@/components/BettingCalculators";
import type { Opportunity } from "../../../drizzle/schema";

export default function Dashboard() {
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState("opportunities");
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [placeBetOpp, setPlaceBetOpp] = useState<Opportunity | null>(null);
  const [betStake, setBetStake] = useState("");
  const [betPlaced, setBetPlaced] = useState(false);
  
  const { data: opportunities, isLoading: opportunitiesLoading, refetch: refetchOpportunities } = trpc.opportunities.list.useQuery();
  const { data: bets } = trpc.bets.list.useQuery();
  const { data: stats } = trpc.bets.stats.useQuery();
  const { data: notifications } = trpc.notifications.unread.useQuery();
  const { data: bookmakers } = trpc.bookmakers.list.useQuery();
  const { data: imperialStatus, refetch: refetchImperialStatus } = trpc.imperial.status.useQuery();
  
  const scanAllSports = trpc.liveOdds.scanAllSports.useMutation();
  const triggerImperialIngestion = trpc.imperial.trigger.useMutation();
  const createBetMutation = trpc.bets.create.useMutation();

  const handlePlaceBets = async () => {
    if (!placeBetOpp || !betStake) return;
    const stake = parseFloat(betStake);
    if (isNaN(stake) || stake <= 0) return;

    // Log both legs of the opportunity as separate bet records
    await createBetMutation.mutateAsync({
      opportunityId: placeBetOpp.id,
      bookmaker: placeBetOpp.bookmaker1,
      sport: placeBetOpp.sport,
      event: String(placeBetOpp.event),
      market: placeBetOpp.market,
      outcome: String(placeBetOpp.outcome1),
      odds: placeBetOpp.odds1,
      stake: (stake / 2).toFixed(2),
    });
    await createBetMutation.mutateAsync({
      opportunityId: placeBetOpp.id,
      bookmaker: placeBetOpp.bookmaker2,
      sport: placeBetOpp.sport,
      event: String(placeBetOpp.event),
      market: placeBetOpp.market,
      outcome: String(placeBetOpp.outcome2),
      odds: placeBetOpp.odds2,
      stake: (stake / 2).toFixed(2),
    });

    setBetPlaced(true);
    setTimeout(() => {
      setPlaceBetOpp(null);
      setBetPlaced(false);
      setBetStake("");
    }, 1800);
  };
  
  const handleScanOpportunities = async () => {
    setIsScanning(true);
    try {
      const results = await scanAllSports.mutateAsync({
        minRoi: 1.0,
        recommendedStake: 100,
        minQuality: "good"
      });
      setScanResults(results);
      // Refetch opportunities to show newly created ones
      await refetchOpportunities();
    } catch (error) {
      console.error("Failed to scan:", error);
    } finally {
      setIsScanning(false);
    }
  };

  const getQualityBadge = (roi: string) => {
    const roiNum = parseFloat(roi);
    if (roiNum >= 10) return <Badge className="bg-green-600">Excellent</Badge>;
    if (roiNum >= 5) return <Badge className="bg-blue-600">Good</Badge>;
    if (roiNum >= 2) return <Badge className="bg-yellow-600">Fair</Badge>;
    return <Badge variant="secondary">Poor</Badge>;
  };

  const handleTriggerImperial = async () => {
    await triggerImperialIngestion.mutateAsync({ mode: "all", pages: 3 });
    await refetchImperialStatus();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">AI Betting Assistant</h1>
              <p className="text-muted-foreground mt-1">
                Welcome back, {user?.name || 'User'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                variant="default" 
                onClick={handleScanOpportunities}
                disabled={isScanning}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Scan for Opportunities
                  </>
                )}
              </Button>
              <Button variant="outline" className="relative">
                <Bell className="h-4 w-4 mr-2" />
                Notifications
                {notifications && notifications.length > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center">
                    {notifications.length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stats Cards */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${parseFloat(stats?.totalProfit || '0') >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${stats?.totalProfit || '0.00'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                ROI: {stats?.roi || '0'}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Bets</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.pendingBets || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Win Rate: {stats?.winRate || '0'}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Opportunities</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{opportunities?.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Available now
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Imperial Ingestion Status</CardTitle>
            <CardDescription>
              Data freshness for Imperial Wealth collectors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Enabled</p>
                <p className="font-medium">{imperialStatus?.isEnabled ? "Yes" : "No"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Running</p>
                <p className="font-medium">{imperialStatus?.isRunning ? "Yes" : "No"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Success</p>
                <p className="font-medium">
                  {imperialStatus?.lastSuccessAt
                    ? new Date(imperialStatus.lastSuccessAt).toLocaleString()
                    : "Never"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Failure</p>
                <p className="font-medium">
                  {imperialStatus?.lastFailureAt
                    ? new Date(imperialStatus.lastFailureAt).toLocaleString()
                    : "None"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Odds Rows</p>
                <p className="font-medium">{imperialStatus?.counts?.oddsComparison ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Sports Rows</p>
                <p className="font-medium">{imperialStatus?.counts?.sportsMaximiser ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Middle Rows</p>
                <p className="font-medium">{imperialStatus?.counts?.middleMaximiser ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Promotions Rows</p>
                <p className="font-medium">{imperialStatus?.counts?.promotions ?? "N/A"}</p>
              </div>
            </div>
            {imperialStatus?.lastError && (
              <div className="mt-4 p-3 rounded border border-red-500/20 bg-red-500/5">
                <p className="text-xs text-red-600 font-medium">Last Error</p>
                <p className="text-xs text-red-700 whitespace-pre-wrap mt-1">{imperialStatus.lastError}</p>
              </div>
            )}
            {user?.role === "admin" && (
              <div className="mt-4">
                <Button
                  variant="outline"
                  onClick={handleTriggerImperial}
                  disabled={triggerImperialIngestion.isPending}
                >
                  {triggerImperialIngestion.isPending ? "Running Imperial Ingestion..." : "Run Imperial Ingestion Now"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Left Column - Opportunities and Tools */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
                <TabsTrigger value="bets">My Bets</TabsTrigger>
                <TabsTrigger value="calculators">Calculators</TabsTrigger>
                <TabsTrigger value="bookmakers">Bookmakers</TabsTrigger>
              </TabsList>

              <TabsContent value="opportunities" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Active Opportunities</CardTitle>
                    <CardDescription>
                      Arbitrage and middle betting opportunities with guaranteed profits
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {opportunitiesLoading ? (
                      <div className="text-center py-8 text-muted-foreground">
                        Loading opportunities...
                      </div>
                    ) : opportunities && opportunities.length > 0 ? (
                      <ScrollArea className="h-[500px] pr-4">
                        <div className="space-y-4">
                          {opportunities.map((opp) => (
                            <Card key={opp.id} className="border-2 hover:border-primary transition-colors">
                              <CardHeader>
                                <div className="flex items-start justify-between">
                                  <div>
                                    <CardTitle className="text-lg">{opp.event}</CardTitle>
                                    <CardDescription className="mt-1">
                                      {opp.sport} • {opp.market}
                                    </CardDescription>
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    {getQualityBadge(opp.roi)}
                                    <Badge variant="outline">{opp.type}</Badge>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent>
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium">{opp.bookmaker1}</p>
                                    <p className="text-xs text-muted-foreground">{opp.outcome1}</p>
                                    <p className="text-lg font-bold text-primary">{opp.odds1}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium">{opp.bookmaker2}</p>
                                    <p className="text-xs text-muted-foreground">{opp.outcome2}</p>
                                    <p className="text-lg font-bold text-primary">{opp.odds2}</p>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between pt-4 border-t">
                                  <div className="space-y-1">
                                    <p className="text-sm text-muted-foreground">ROI</p>
                                    <p className="text-xl font-bold text-green-600">{opp.roi}%</p>
                                  </div>
                                  <div className="space-y-1 text-right">
                                    <p className="text-sm text-muted-foreground">Recommended Stake</p>
                                    <p className="text-xl font-bold">${opp.recommendedStake}</p>
                                  </div>
                                  <Button onClick={() => { setPlaceBetOpp(opp); setBetStake(opp.recommendedStake); }}>
                                    Place Bets
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="text-center py-12">
                        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No opportunities available at the moment</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Check back soon or adjust your alert preferences
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="bets" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>My Betting History</CardTitle>
                    <CardDescription>Track all your placed bets and results</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {bets && bets.length > 0 ? (
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-3">
                          {bets.slice(0, 20).map((bet) => (
                            <div key={bet.id} className="flex items-center justify-between p-4 border rounded-lg">
                              <div className="flex-1">
                                <p className="font-medium">{bet.event}</p>
                                <p className="text-sm text-muted-foreground">
                                  {bet.bookmaker} • {bet.outcome} @ {bet.odds}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(bet.placedAt).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="text-right">
                                <Badge variant={
                                  bet.status === 'won' ? 'default' :
                                  bet.status === 'lost' ? 'destructive' :
                                  'secondary'
                                }>
                                  {bet.status}
                                </Badge>
                                <p className="text-sm font-medium mt-2">${bet.stake}</p>
                                {bet.result && (
                                  <p className={`text-sm font-bold ${parseFloat(bet.result) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {parseFloat(bet.result) >= 0 ? '+' : ''}${bet.result}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        No bets placed yet. Start by exploring opportunities!
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="calculators" className="mt-6">
                <BettingCalculators />
              </TabsContent>

              <TabsContent value="bookmakers" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Bookmaker Intelligence</CardTitle>
                    <CardDescription>Monitor your bookmaker account health and status</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {bookmakers && bookmakers.length > 0 ? (
                      <div className="space-y-3">
                        {bookmakers.map((acc) => (
                          <div key={acc.id} className="flex items-center justify-between p-4 border rounded-lg">
                            <div>
                              <p className="font-medium">{acc.bookmaker}</p>
                              <p className="text-sm text-muted-foreground">
                                Balance: ${acc.currentBalance || 'N/A'}
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm">Health:</span>
                                <Badge variant={acc.healthScore && acc.healthScore >= 80 ? 'default' : 'destructive'}>
                                  {acc.healthScore || 100}/100
                                </Badge>
                              </div>
                              <Badge variant={
                                acc.detectionRisk === 'low' ? 'default' :
                                acc.detectionRisk === 'medium' ? 'secondary' :
                                'destructive'
                              }>
                                {acc.detectionRisk} risk
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        No bookmaker accounts added yet
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - AI Chat */}
          <div className="lg:col-span-1">
            <Card className="h-[700px] flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  <CardTitle>AI Betting Assistant</CardTitle>
                </div>
                <CardDescription>
                  Get expert advice on betting strategies and opportunities
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0">
                <BettingChatBox />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Place Bets Dialog */}
      <Dialog open={!!placeBetOpp} onOpenChange={(open) => { if (!open) { setPlaceBetOpp(null); setBetPlaced(false); setBetStake(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place Bets</DialogTitle>
            <DialogDescription>
              Log both legs of this opportunity to your bet tracker.
            </DialogDescription>
          </DialogHeader>

          {betPlaced ? (
            <div className="flex flex-col items-center gap-3 py-6 text-green-600">
              <CheckCircle className="h-12 w-12" />
              <p className="font-semibold text-lg">Bets logged successfully!</p>
            </div>
          ) : placeBetOpp && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 bg-muted/40 text-sm space-y-2">
                <p className="font-medium">{String(placeBetOpp.event)}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-muted-foreground">Leg 1 — {placeBetOpp.bookmaker1}</p>
                    <p>{String(placeBetOpp.outcome1)} @ {placeBetOpp.odds1}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Leg 2 — {placeBetOpp.bookmaker2}</p>
                    <p>{String(placeBetOpp.outcome2)} @ {placeBetOpp.odds2}</p>
                  </div>
                </div>
                <p className="text-green-600 font-semibold">ROI: {placeBetOpp.roi}%</p>
              </div>

              <div className="space-y-1">
                <Label>Total Stake ($) — split evenly across both legs</Label>
                <Input
                  type="number"
                  value={betStake}
                  onChange={e => setBetStake(e.target.value)}
                  placeholder="e.g. 100"
                />
                {betStake && (
                  <p className="text-xs text-muted-foreground">
                    ${(parseFloat(betStake) / 2).toFixed(2)} on each leg
                  </p>
                )}
              </div>

              <Button
                className="w-full"
                onClick={handlePlaceBets}
                disabled={!betStake || parseFloat(betStake) <= 0 || createBetMutation.isPending}
              >
                {createBetMutation.isPending ? "Logging bets..." : "Confirm & Log Bets"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
