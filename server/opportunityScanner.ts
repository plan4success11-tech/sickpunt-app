import { OddsEvent, OddsMarket, Bookmaker, getBookmakerName } from "./oddsApiService";
import { calculateArbitrage, analyzeOpportunityQuality } from "./bettingCalculations";

export interface ArbitrageOpportunity {
  event: string;
  sport: string;
  sportKey: string;
  market: string; // 'h2h', 'spreads', 'totals'
  commenceTime: string;
  
  // Bet 1
  bookmaker1: string;
  bookmaker1Key: string;
  outcome1: string;
  odds1: number;
  stake1: number;
  
  // Bet 2
  bookmaker2: string;
  bookmaker2Key: string;
  outcome2: string;
  odds2: number;
  stake2: number;
  
  // Opportunity metrics
  roi: number;
  guaranteedProfit: number;
  totalStake: number;
  profit1: number;
  profit2: number;
  
  // Quality assessment
  quality: "excellent" | "good" | "fair" | "poor";
  qualityScore: number;
  recommendation: string;
  
  // Timing
  hoursUntilEvent: number;
  detectedAt: Date;
}

export interface MiddleBettingOpportunity {
  event: string;
  sport: string;
  sportKey: string;
  market: string;
  commenceTime: string;
  
  // Over bet
  bookmaker1: string;
  bookmaker1Key: string;
  line1: number;
  odds1: number;
  stake1: number;
  
  // Under bet
  bookmaker2: string;
  bookmaker2Key: string;
  line2: number;
  odds2: number;
  stake2: number;
  
  // Opportunity metrics
  middleRange: string; // e.g., "216-218"
  maxProfit: number;
  maxLoss: number;
  riskPercentage: number;
  middleWinPercentage: number;
  
  // Quality assessment
  quality: "excellent" | "good" | "fair" | "poor";
  qualityScore: number;
  
  // Timing
  hoursUntilEvent: number;
  detectedAt: Date;
}

/**
 * Scan a single event for arbitrage opportunities in head-to-head markets
 */
export function scanEventForArbitrage(
  event: OddsEvent,
  minRoi: number = 1.0,
  recommendedStake: number = 100
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];
  
  // Get all bookmakers with h2h markets
  const h2hBookmakers = event.bookmakers
    .map((bm) => ({
      bookmaker: bm,
      market: bm.markets.find((m) => m.key === "h2h"),
    }))
    .filter((item) => item.market !== undefined);

  if (h2hBookmakers.length < 2) {
    return opportunities; // Need at least 2 bookmakers
  }

  // Compare all pairs of bookmakers
  for (let i = 0; i < h2hBookmakers.length; i++) {
    for (let j = i + 1; j < h2hBookmakers.length; j++) {
      const bm1 = h2hBookmakers[i];
      const bm2 = h2hBookmakers[j];

      if (!bm1.market || !bm2.market) continue;

      // Get outcomes (typically home/away or team1/team2)
      const outcomes1 = bm1.market.outcomes;
      const outcomes2 = bm2.market.outcomes;

      if (outcomes1.length !== 2 || outcomes2.length !== 2) continue;

      // Try both combinations
      // Combination 1: bm1 outcome1 vs bm2 outcome2
      const odds1_1 = outcomes1[0].price;
      const odds2_1 = outcomes2[1].price;
      const calc1 = calculateArbitrage(odds1_1, odds2_1, recommendedStake);

      if (calc1.isArbitrage && calc1.roi >= minRoi) {
        const hoursUntilEvent = calculateHoursUntilEvent(event.commence_time);
        const quality = analyzeOpportunityQuality(calc1.roi, null, hoursUntilEvent);

        opportunities.push({
          event: `${event.away_team} @ ${event.home_team}`,
          sport: event.sport_title,
          sportKey: event.sport_key,
          market: "h2h",
          commenceTime: event.commence_time,
          
          bookmaker1: getBookmakerName(bm1.bookmaker.key),
          bookmaker1Key: bm1.bookmaker.key,
          outcome1: outcomes1[0].name,
          odds1: odds1_1,
          stake1: calc1.stake1,
          
          bookmaker2: getBookmakerName(bm2.bookmaker.key),
          bookmaker2Key: bm2.bookmaker.key,
          outcome2: outcomes2[1].name,
          odds2: odds2_1,
          stake2: calc1.stake2,
          
          roi: calc1.roi,
          guaranteedProfit: calc1.guaranteedProfit,
          totalStake: recommendedStake,
          profit1: calc1.profit1,
          profit2: calc1.profit2,
          
          quality: quality.quality,
          qualityScore: quality.score,
          recommendation: quality.recommendation,
          
          hoursUntilEvent,
          detectedAt: new Date(),
        });
      }

      // Combination 2: bm1 outcome2 vs bm2 outcome1
      const odds1_2 = outcomes1[1].price;
      const odds2_2 = outcomes2[0].price;
      const calc2 = calculateArbitrage(odds1_2, odds2_2, recommendedStake);

      if (calc2.isArbitrage && calc2.roi >= minRoi) {
        const hoursUntilEvent = calculateHoursUntilEvent(event.commence_time);
        const quality = analyzeOpportunityQuality(calc2.roi, null, hoursUntilEvent);

        opportunities.push({
          event: `${event.away_team} @ ${event.home_team}`,
          sport: event.sport_title,
          sportKey: event.sport_key,
          market: "h2h",
          commenceTime: event.commence_time,
          
          bookmaker1: getBookmakerName(bm1.bookmaker.key),
          bookmaker1Key: bm1.bookmaker.key,
          outcome1: outcomes1[1].name,
          odds1: odds1_2,
          stake1: calc2.stake1,
          
          bookmaker2: getBookmakerName(bm2.bookmaker.key),
          bookmaker2Key: bm2.bookmaker.key,
          outcome2: outcomes2[0].name,
          odds2: odds2_2,
          stake2: calc2.stake2,
          
          roi: calc2.roi,
          guaranteedProfit: calc2.guaranteedProfit,
          totalStake: recommendedStake,
          profit1: calc2.profit1,
          profit2: calc2.profit2,
          
          quality: quality.quality,
          qualityScore: quality.score,
          recommendation: quality.recommendation,
          
          hoursUntilEvent,
          detectedAt: new Date(),
        });
      }
    }
  }

  return opportunities;
}

/**
 * Scan multiple events for arbitrage opportunities
 */
export function scanEventsForArbitrage(
  events: OddsEvent[],
  minRoi: number = 1.0,
  recommendedStake: number = 100
): ArbitrageOpportunity[] {
  const allOpportunities: ArbitrageOpportunity[] = [];

  for (const event of events) {
    const opportunities = scanEventForArbitrage(event, minRoi, recommendedStake);
    allOpportunities.push(...opportunities);
  }

  // Sort by ROI descending
  return allOpportunities.sort((a, b) => b.roi - a.roi);
}

/**
 * Scan for middle betting opportunities in totals markets
 */
export function scanEventForMiddles(
  event: OddsEvent,
  minGap: number = 2.0,
  recommendedStake: number = 100
): MiddleBettingOpportunity[] {
  const opportunities: MiddleBettingOpportunity[] = [];
  
  // Get all bookmakers with totals markets
  const totalsBookmakers = event.bookmakers
    .map((bm) => ({
      bookmaker: bm,
      market: bm.markets.find((m) => m.key === "totals"),
    }))
    .filter((item) => item.market !== undefined);

  if (totalsBookmakers.length < 2) {
    return opportunities;
  }

  // Compare all pairs
  for (let i = 0; i < totalsBookmakers.length; i++) {
    for (let j = i + 1; j < totalsBookmakers.length; j++) {
      const bm1 = totalsBookmakers[i];
      const bm2 = totalsBookmakers[j];

      if (!bm1.market || !bm2.market) continue;

      const outcomes1 = bm1.market.outcomes;
      const outcomes2 = bm2.market.outcomes;

      // Find over and under outcomes with their lines
      const over1 = outcomes1.find((o) => o.name.toLowerCase().includes("over"));
      const under2 = outcomes2.find((o) => o.name.toLowerCase().includes("under"));

      if (!over1 || !under2) continue;

      // Extract point values from outcome names (e.g., "Over 215.5" -> 215.5)
      const line1 = extractLineFromOutcome(over1.name);
      const line2 = extractLineFromOutcome(under2.name);

      if (line1 === null || line2 === null) continue;

      // Check if there's a middle (line1 < line2)
      const gap = line2 - line1;
      if (gap >= minGap) {
        const hoursUntilEvent = calculateHoursUntilEvent(event.commence_time);
        
        // Estimate middle win percentage (rough approximation)
        const middleWinPercentage = Math.min(gap * 5, 30); // Cap at 30%
        
        opportunities.push({
          event: `${event.away_team} @ ${event.home_team}`,
          sport: event.sport_title,
          sportKey: event.sport_key,
          market: "totals",
          commenceTime: event.commence_time,
          
          bookmaker1: getBookmakerName(bm1.bookmaker.key),
          bookmaker1Key: bm1.bookmaker.key,
          line1,
          odds1: over1.price,
          stake1: recommendedStake / 2,
          
          bookmaker2: getBookmakerName(bm2.bookmaker.key),
          bookmaker2Key: bm2.bookmaker.key,
          line2,
          odds2: under2.price,
          stake2: recommendedStake / 2,
          
          middleRange: `${line1 + 0.5}-${line2 - 0.5}`,
          maxProfit: (over1.price - 1) * (recommendedStake / 2) + (under2.price - 1) * (recommendedStake / 2),
          maxLoss: -recommendedStake,
          riskPercentage: 100 - middleWinPercentage,
          middleWinPercentage,
          
          quality: gap >= 4 ? "excellent" : gap >= 3 ? "good" : "fair",
          qualityScore: Math.min(gap * 20, 100),
          
          hoursUntilEvent,
          detectedAt: new Date(),
        });
      }
    }
  }

  return opportunities.sort((a, b) => b.qualityScore - a.qualityScore);
}

/**
 * Calculate hours until event starts
 */
function calculateHoursUntilEvent(commenceTime: string): number {
  const now = new Date();
  const eventTime = new Date(commenceTime);
  const diffMs = eventTime.getTime() - now.getTime();
  return diffMs / (1000 * 60 * 60);
}

/**
 * Extract numeric line from outcome name (e.g., "Over 215.5" -> 215.5)
 */
function extractLineFromOutcome(outcomeName: string): number | null {
  const match = outcomeName.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

/**
 * Filter opportunities by quality
 */
export function filterOpportunitiesByQuality(
  opportunities: ArbitrageOpportunity[],
  minQuality: "excellent" | "good" | "fair" | "poor" = "fair"
): ArbitrageOpportunity[] {
  const qualityOrder = { excellent: 3, good: 2, fair: 1, poor: 0 };
  const minScore = qualityOrder[minQuality];

  return opportunities.filter((opp) => qualityOrder[opp.quality] >= minScore);
}

/**
 * Filter opportunities by time until event
 */
export function filterOpportunitiesByTime(
  opportunities: ArbitrageOpportunity[],
  minHours: number = 1,
  maxHours: number = 48
): ArbitrageOpportunity[] {
  return opportunities.filter(
    (opp) => opp.hoursUntilEvent >= minHours && opp.hoursUntilEvent <= maxHours
  );
}
