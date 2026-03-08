import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calculator, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";

// ─── Arbitrage Calculator ────────────────────────────────────────────────────

function ArbitrageCalculator() {
  const [odds1, setOdds1] = useState("");
  const [odds2, setOdds2] = useState("");
  const [stake, setStake] = useState("100");

  const calc = trpc.calculator.arbitrage.useMutation();

  const handleCalc = () => {
    if (!odds1 || !odds2 || !stake) return;
    calc.mutate({ odds1: parseFloat(odds1), odds2: parseFloat(odds2), totalStake: parseFloat(stake) });
  };

  const r = calc.data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Odds 1 (decimal)</Label>
          <Input placeholder="e.g. 1.95" value={odds1} onChange={e => setOdds1(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Odds 2 (decimal)</Label>
          <Input placeholder="e.g. 2.10" value={odds2} onChange={e => setOdds2(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Total Stake ($)</Label>
        <Input placeholder="100" value={stake} onChange={e => setStake(e.target.value)} />
      </div>
      <Button onClick={handleCalc} disabled={calc.isPending} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        {calc.isPending ? "Calculating..." : "Calculate"}
      </Button>

      {r && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/40">
          <div className="flex items-center gap-2">
            {r.isArbitrage ? (
              <><CheckCircle className="h-5 w-5 text-green-600" /><span className="font-semibold text-green-600">Arbitrage Opportunity!</span></>
            ) : (
              <><AlertTriangle className="h-5 w-5 text-yellow-600" /><span className="font-semibold text-yellow-600">No arbitrage (bookmaker margin applies)</span></>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-muted-foreground">ROI</p><p className="text-xl font-bold text-green-600">{r.roi}%</p></div>
            <div><p className="text-muted-foreground">Guaranteed Profit</p><p className="text-xl font-bold">${r.guaranteedProfit}</p></div>
            <div><p className="text-muted-foreground">Stake on Bet 1</p><p className="font-semibold">${r.stake1}</p></div>
            <div><p className="text-muted-foreground">Stake on Bet 2</p><p className="font-semibold">${r.stake2}</p></div>
            <div><p className="text-muted-foreground">Profit if Bet 1 wins</p><p className="font-semibold">${r.profit1}</p></div>
            <div><p className="text-muted-foreground">Profit if Bet 2 wins</p><p className="font-semibold">${r.profit2}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Middle Betting Calculator ───────────────────────────────────────────────

function MiddleCalculator() {
  const [odds1, setOdds1] = useState("");
  const [line1, setLine1] = useState("");
  const [odds2, setOdds2] = useState("");
  const [line2, setLine2] = useState("");
  const [stake, setStake] = useState("100");

  const calc = trpc.calculator.middleBetting.useMutation();

  const handleCalc = () => {
    if (!odds1 || !line1 || !odds2 || !line2 || !stake) return;
    calc.mutate({
      odds1: parseFloat(odds1),
      line1: parseFloat(line1),
      odds2: parseFloat(odds2),
      line2: parseFloat(line2),
      totalStake: parseFloat(stake),
    });
  };

  const r = calc.data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Over Odds (decimal)</Label>
          <Input placeholder="e.g. 1.90" value={odds1} onChange={e => setOdds1(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Over Line</Label>
          <Input placeholder="e.g. 215.5" value={line1} onChange={e => setLine1(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Under Odds (decimal)</Label>
          <Input placeholder="e.g. 1.90" value={odds2} onChange={e => setOdds2(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Under Line</Label>
          <Input placeholder="e.g. 218.5" value={line2} onChange={e => setLine2(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Total Stake ($)</Label>
        <Input placeholder="100" value={stake} onChange={e => setStake(e.target.value)} />
      </div>
      <Button onClick={handleCalc} disabled={calc.isPending} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        {calc.isPending ? "Calculating..." : "Calculate"}
      </Button>

      {r && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/40">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <span className="font-semibold">Middle Betting Analysis</span>
            <Badge variant={r.riskPercentage <= 15 ? "default" : "destructive"}>
              {r.riskPercentage <= 10 ? "Low Risk" : r.riskPercentage <= 15 ? "Medium Risk" : "High Risk"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-muted-foreground">Middle Win Chance</p><p className="text-xl font-bold text-green-600">{r.middleWinPercentage}%</p></div>
            <div><p className="text-muted-foreground">Risk (both lose)</p><p className="text-xl font-bold text-red-600">{r.riskPercentage}%</p></div>
            <div><p className="text-muted-foreground">Max Profit (middle hits)</p><p className="font-semibold text-green-600">${r.maxProfit}</p></div>
            <div><p className="text-muted-foreground">Max Loss</p><p className="font-semibold text-red-600">${Math.abs(r.maxLoss)}</p></div>
            <div><p className="text-muted-foreground">Stake on Over</p><p className="font-semibold">${r.stake1}</p></div>
            <div><p className="text-muted-foreground">Stake on Under</p><p className="font-semibold">${r.stake2}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dutching Calculator ─────────────────────────────────────────────────────

function DutchingCalculator() {
  const [odds1, setOdds1] = useState("");
  const [odds2, setOdds2] = useState("");
  const [odds3, setOdds3] = useState("");
  const [stake, setStake] = useState("100");

  const calc = trpc.calculator.dutching.useMutation();

  const handleCalc = () => {
    if (!odds1 || !odds2 || !stake) return;
    const oddsArr = [parseFloat(odds1), parseFloat(odds2)];
    if (odds3) oddsArr.push(parseFloat(odds3));
    calc.mutate({ odds: oddsArr, totalStake: parseFloat(stake) });
  };

  const r = calc.data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Selection 1 Odds</Label>
          <Input placeholder="e.g. 3.00" value={odds1} onChange={e => setOdds1(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Selection 2 Odds</Label>
          <Input placeholder="e.g. 4.00" value={odds2} onChange={e => setOdds2(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Selection 3 Odds (optional)</Label>
          <Input placeholder="e.g. 5.00" value={odds3} onChange={e => setOdds3(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Total Stake ($)</Label>
          <Input placeholder="100" value={stake} onChange={e => setStake(e.target.value)} />
        </div>
      </div>
      <Button onClick={handleCalc} disabled={calc.isPending} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        {calc.isPending ? "Calculating..." : "Calculate"}
      </Button>

      {r && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/40">
          <p className="font-semibold">Dutching Breakdown</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-muted-foreground">ROI</p><p className="text-xl font-bold">{r.roi}%</p></div>
            <div><p className="text-muted-foreground">Total Stake</p><p className="text-xl font-bold">${r.totalStake}</p></div>
            <div><p className="text-muted-foreground">Stake on Selection 1</p><p className="font-semibold">${r.stake1}</p></div>
            <div><p className="text-muted-foreground">Profit if Sel 1 wins</p><p className="font-semibold text-green-600">${r.profitIfWin1}</p></div>
            <div><p className="text-muted-foreground">Stake on Selection 2</p><p className="font-semibold">${r.stake2}</p></div>
            <div><p className="text-muted-foreground">Profit if Sel 2 wins</p><p className="font-semibold text-green-600">${r.profitIfWin2}</p></div>
            {r.stake3 !== undefined && (
              <>
                <div><p className="text-muted-foreground">Stake on Selection 3</p><p className="font-semibold">${r.stake3}</p></div>
                <div><p className="text-muted-foreground">Profit if Sel 3 wins</p><p className="font-semibold text-green-600">${r.profitIfWin3}</p></div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Back/Lay Calculator ─────────────────────────────────────────────────────

function BackLayCalculator() {
  const [backOdds, setBackOdds] = useState("");
  const [layOdds, setLayOdds] = useState("");
  const [backStake, setBackStake] = useState("50");
  const [commission, setCommission] = useState("5");

  const calc = trpc.calculator.backLay.useMutation();

  const handleCalc = () => {
    if (!backOdds || !layOdds || !backStake) return;
    calc.mutate({
      backOdds: parseFloat(backOdds),
      layOdds: parseFloat(layOdds),
      backStake: parseFloat(backStake),
      commission: parseFloat(commission || "0"),
    });
  };

  const r = calc.data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Back Odds (bookmaker)</Label>
          <Input placeholder="e.g. 3.00" value={backOdds} onChange={e => setBackOdds(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Lay Odds (exchange)</Label>
          <Input placeholder="e.g. 3.10" value={layOdds} onChange={e => setLayOdds(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Back Stake ($)</Label>
          <Input placeholder="50" value={backStake} onChange={e => setBackStake(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Exchange Commission (%)</Label>
          <Input placeholder="5" value={commission} onChange={e => setCommission(e.target.value)} />
        </div>
      </div>
      <Button onClick={handleCalc} disabled={calc.isPending} className="w-full">
        <Calculator className="h-4 w-4 mr-2" />
        {calc.isPending ? "Calculating..." : "Calculate"}
      </Button>

      {r && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/40">
          <p className="font-semibold">Back / Lay Result</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-muted-foreground">Lay Stake Required</p><p className="text-xl font-bold">${r.layStake}</p></div>
            <div><p className="text-muted-foreground">Liability</p><p className="text-xl font-bold text-red-600">${r.liability}</p></div>
            <div><p className="text-muted-foreground">Profit if Back wins</p><p className={`font-semibold ${r.profitIfWin >= 0 ? "text-green-600" : "text-red-600"}`}>${r.profitIfWin}</p></div>
            <div><p className="text-muted-foreground">Profit if Lay wins</p><p className={`font-semibold ${r.profitIfLose >= 0 ? "text-green-600" : "text-red-600"}`}>${r.profitIfLose}</p></div>
            <div className="col-span-2"><p className="text-muted-foreground">Qualifying Loss</p><p className="font-semibold text-yellow-600">${r.qualifyingLoss}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function BettingCalculators() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Betting Calculators</CardTitle>
        <CardDescription>Calculate stakes and profits for different betting strategies</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="arbitrage">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="arbitrage">Arbitrage</TabsTrigger>
            <TabsTrigger value="middle">Middle</TabsTrigger>
            <TabsTrigger value="dutching">Dutching</TabsTrigger>
            <TabsTrigger value="backlay">Back/Lay</TabsTrigger>
          </TabsList>
          <TabsContent value="arbitrage" className="mt-4"><ArbitrageCalculator /></TabsContent>
          <TabsContent value="middle" className="mt-4"><MiddleCalculator /></TabsContent>
          <TabsContent value="dutching" className="mt-4"><DutchingCalculator /></TabsContent>
          <TabsContent value="backlay" className="mt-4"><BackLayCalculator /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
