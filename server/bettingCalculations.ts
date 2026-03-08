/**
 * Betting calculation utilities for arbitrage, middle betting, and dutching
 * Based on Imperial Wealth platform methodologies
 */

export interface ArbitrageResult {
  isArbitrage: boolean;
  roi: number;
  stake1: number;
  stake2: number;
  profit1: number;
  profit2: number;
  totalStake: number;
  guaranteedProfit: number;
}

export interface MiddleBettingResult {
  isMiddle: boolean;
  riskPercentage: number;
  middleWinPercentage: number;
  stake1: number;
  stake2: number;
  totalStake: number;
  maxProfit: number;
  maxLoss: number;
  breakEvenPoint: number;
}

export interface DutchingResult {
  stake1: number;
  stake2: number;
  stake3?: number;
  totalStake: number;
  profitIfWin1: number;
  profitIfWin2: number;
  profitIfWin3?: number;
  roi: number;
}

/**
 * Convert odds to decimal format
 */
export function convertToDecimal(odds: string | number, format: 'decimal' | 'american' | 'fractional' = 'decimal'): number {
  const oddsStr = String(odds);
  
  if (format === 'decimal') {
    return parseFloat(oddsStr);
  }
  
  if (format === 'american') {
    const americanOdds = parseFloat(oddsStr);
    if (americanOdds > 0) {
      return (americanOdds / 100) + 1;
    } else {
      return (100 / Math.abs(americanOdds)) + 1;
    }
  }
  
  if (format === 'fractional') {
    const [numerator, denominator] = oddsStr.split('/').map(parseFloat);
    return (numerator / denominator) + 1;
  }
  
  return parseFloat(oddsStr);
}

/**
 * Calculate arbitrage betting opportunity
 * Returns guaranteed profit scenario regardless of outcome
 */
export function calculateArbitrage(
  odds1: number,
  odds2: number,
  totalStake: number = 100
): ArbitrageResult {
  const decimalOdds1 = convertToDecimal(odds1);
  const decimalOdds2 = convertToDecimal(odds2);
  
  // Calculate implied probabilities
  const impliedProb1 = 1 / decimalOdds1;
  const impliedProb2 = 1 / decimalOdds2;
  const totalImpliedProb = impliedProb1 + impliedProb2;
  
  // Check if arbitrage exists (total implied probability < 1)
  const isArbitrage = totalImpliedProb < 1;
  
  // Calculate ROI
  const roi = ((1 / totalImpliedProb) - 1) * 100;
  
  // Calculate optimal stakes
  const stake1 = totalStake * impliedProb1 / totalImpliedProb;
  const stake2 = totalStake * impliedProb2 / totalImpliedProb;
  
  // Calculate profits for each outcome
  const profit1 = (stake1 * decimalOdds1) - totalStake;
  const profit2 = (stake2 * decimalOdds2) - totalStake;
  
  const guaranteedProfit = Math.min(profit1, profit2);
  
  return {
    isArbitrage,
    roi: parseFloat(roi.toFixed(2)),
    stake1: parseFloat(stake1.toFixed(2)),
    stake2: parseFloat(stake2.toFixed(2)),
    profit1: parseFloat(profit1.toFixed(2)),
    profit2: parseFloat(profit2.toFixed(2)),
    totalStake,
    guaranteedProfit: parseFloat(guaranteedProfit.toFixed(2))
  };
}

/**
 * Calculate middle betting opportunity
 * Identifies scenarios where both bets can win
 */
export function calculateMiddleBetting(
  odds1: number,
  line1: number,
  odds2: number,
  line2: number,
  totalStake: number = 100
): MiddleBettingResult {
  const decimalOdds1 = convertToDecimal(odds1);
  const decimalOdds2 = convertToDecimal(odds2);
  
  // Calculate if middle exists (gap between lines)
  const middleGap = Math.abs(line1 - line2);
  const isMiddle = middleGap > 0;
  
  // Estimate middle win probability (simplified - would need historical data for accuracy)
  const middleWinPercentage = Math.min(middleGap * 2, 25); // Cap at 25%
  
  // Calculate risk percentage (probability of losing both bets)
  const riskPercentage = 100 - middleWinPercentage;
  
  // Calculate stakes to balance potential loss
  const impliedProb1 = 1 / decimalOdds1;
  const impliedProb2 = 1 / decimalOdds2;
  const totalImpliedProb = impliedProb1 + impliedProb2;
  
  const stake1 = totalStake * impliedProb1 / totalImpliedProb;
  const stake2 = totalStake * impliedProb2 / totalImpliedProb;
  
  // Calculate outcomes
  const winBoth = (stake1 * decimalOdds1) + (stake2 * decimalOdds2) - totalStake;
  const winOne = Math.max(
    (stake1 * decimalOdds1) - totalStake,
    (stake2 * decimalOdds2) - totalStake
  );
  const loseBoth = -totalStake;
  
  return {
    isMiddle,
    riskPercentage: parseFloat(riskPercentage.toFixed(2)),
    middleWinPercentage: parseFloat(middleWinPercentage.toFixed(2)),
    stake1: parseFloat(stake1.toFixed(2)),
    stake2: parseFloat(stake2.toFixed(2)),
    totalStake,
    maxProfit: parseFloat(winBoth.toFixed(2)),
    maxLoss: parseFloat(loseBoth.toFixed(2)),
    breakEvenPoint: parseFloat(winOne.toFixed(2))
  };
}

/**
 * Calculate dutching (spreading stake across multiple outcomes)
 */
export function calculateDutching(
  odds: number[],
  totalStake: number = 100
): DutchingResult {
  if (odds.length < 2 || odds.length > 3) {
    throw new Error("Dutching requires 2 or 3 selections");
  }
  
  const decimalOdds = odds.map(o => convertToDecimal(o));
  
  // Calculate implied probabilities
  const impliedProbs = decimalOdds.map(o => 1 / o);
  const totalImpliedProb = impliedProbs.reduce((sum, p) => sum + p, 0);
  
  // Calculate stakes proportional to implied probabilities
  const stakes = impliedProbs.map(p => totalStake * p / totalImpliedProb);
  
  // Calculate profits for each outcome
  const profits = stakes.map((stake, i) => (stake * decimalOdds[i]) - totalStake);
  
  // Calculate ROI (average profit)
  const avgProfit = profits.reduce((sum, p) => sum + p, 0) / profits.length;
  const roi = (avgProfit / totalStake) * 100;
  
  return {
    stake1: parseFloat(stakes[0].toFixed(2)),
    stake2: parseFloat(stakes[1].toFixed(2)),
    stake3: stakes[2] ? parseFloat(stakes[2].toFixed(2)) : undefined,
    totalStake,
    profitIfWin1: parseFloat(profits[0].toFixed(2)),
    profitIfWin2: parseFloat(profits[1].toFixed(2)),
    profitIfWin3: profits[2] ? parseFloat(profits[2].toFixed(2)) : undefined,
    roi: parseFloat(roi.toFixed(2))
  };
}

/**
 * Calculate back/lay betting (matched betting)
 */
export function calculateBackLay(
  backOdds: number,
  layOdds: number,
  backStake: number,
  commission: number = 0 // Betfair commission percentage
): {
  layStake: number;
  liability: number;
  profitIfWin: number;
  profitIfLose: number;
  qualifyingLoss: number;
} {
  const decimalBackOdds = convertToDecimal(backOdds);
  const decimalLayOdds = convertToDecimal(layOdds);
  
  // Calculate lay stake needed
  const layStake = (backStake * decimalBackOdds) / (decimalLayOdds - (commission / 100));
  
  // Calculate liability (amount at risk on lay bet)
  const liability = layStake * (decimalLayOdds - 1);
  
  // Calculate profits for each outcome
  const profitIfWin = (backStake * (decimalBackOdds - 1)) - liability;
  const profitIfLose = layStake - (layStake * (commission / 100)) - backStake;
  
  // Qualifying loss (for bonus bets)
  const qualifyingLoss = Math.abs(Math.min(profitIfWin, profitIfLose));
  
  return {
    layStake: parseFloat(layStake.toFixed(2)),
    liability: parseFloat(liability.toFixed(2)),
    profitIfWin: parseFloat(profitIfWin.toFixed(2)),
    profitIfLose: parseFloat(profitIfLose.toFixed(2)),
    qualifyingLoss: parseFloat(qualifyingLoss.toFixed(2))
  };
}

/**
 * Calculate optimal stake size based on bankroll and risk tolerance
 */
export function calculateOptimalStake(
  bankroll: number,
  roi: number,
  riskLevel: 'conservative' | 'moderate' | 'aggressive' = 'moderate'
): number {
  // Kelly Criterion adjusted for risk level
  const kellyFraction = {
    conservative: 0.25,
    moderate: 0.5,
    aggressive: 1.0
  }[riskLevel];
  
  // Convert ROI to probability
  const edgePercentage = roi / 100;
  
  // Calculate Kelly stake
  const kellyStake = bankroll * edgePercentage * kellyFraction;
  
  // Cap at 5% of bankroll for safety
  const maxStake = bankroll * 0.05;
  
  return Math.min(kellyStake, maxStake);
}

/**
 * Analyze opportunity quality
 */
export function analyzeOpportunityQuality(
  roi: number,
  riskPercentage: number | null,
  timeToEvent: number // hours until event
): {
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  score: number;
  recommendation: string;
} {
  let score = 0;
  
  // ROI scoring (0-40 points)
  if (roi >= 10) score += 40;
  else if (roi >= 5) score += 30;
  else if (roi >= 2) score += 20;
  else score += 10;
  
  // Risk scoring (0-30 points) - only for middle bets
  if (riskPercentage !== null) {
    if (riskPercentage <= 10) score += 30;
    else if (riskPercentage <= 15) score += 20;
    else if (riskPercentage <= 20) score += 10;
    else score += 0;
  } else {
    // Arbitrage has no risk
    score += 30;
  }
  
  // Time scoring (0-30 points)
  if (timeToEvent >= 2 && timeToEvent <= 6) score += 30;
  else if (timeToEvent >= 1 && timeToEvent <= 12) score += 20;
  else if (timeToEvent < 1) score += 10;
  else score += 15;
  
  let quality: 'excellent' | 'good' | 'fair' | 'poor';
  let recommendation: string;
  
  if (score >= 80) {
    quality = 'excellent';
    recommendation = 'Take this opportunity immediately. High ROI with low risk.';
  } else if (score >= 60) {
    quality = 'good';
    recommendation = 'Strong opportunity. Verify odds and place bets within 30 minutes.';
  } else if (score >= 40) {
    quality = 'fair';
    recommendation = 'Decent opportunity. Check for better options first.';
  } else {
    quality = 'poor';
    recommendation = 'Skip this opportunity. ROI or timing not optimal.';
  }
  
  return { quality, score, recommendation };
}
