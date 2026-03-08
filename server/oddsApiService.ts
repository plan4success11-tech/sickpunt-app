import axios from "axios";
import { ENV } from "./_core/env";

const ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4";

export interface Sport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

export interface OddsOutcome {
  name: string;
  price: number; // Decimal odds
}

export interface OddsMarket {
  key: string; // 'h2h', 'spreads', 'totals'
  last_update: string;
  outcomes: OddsOutcome[];
}

export interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsMarket[];
}

export interface OddsEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

export interface OddsApiResponse {
  data: OddsEvent[];
  remainingRequests: number;
  usedRequests: number;
}

/**
 * Fetch list of available sports from The Odds API
 */
export async function fetchSports(): Promise<Sport[]> {
  try {
    const response = await axios.get(`${ODDS_API_BASE_URL}/sports`, {
      params: {
        apiKey: ENV.oddsApiKey,
      },
    });

    return response.data;
  } catch (error) {
    console.error("[OddsAPI] Failed to fetch sports:", error);
    throw new Error("Failed to fetch sports from Odds API");
  }
}

/**
 * Fetch live odds for a specific sport
 * @param sportKey - Sport identifier (e.g., 'aussierules_afl', 'rugbyleague_nrl')
 * @param regions - Bookmaker regions (default: 'au' for Australian bookmakers)
 * @param markets - Betting markets to include (default: 'h2h,spreads,totals')
 * @param oddsFormat - Odds format (default: 'decimal')
 */
export async function fetchOdds(
  sportKey: string,
  regions: string = "au",
  markets: string = "h2h,spreads,totals",
  oddsFormat: "decimal" | "american" = "decimal"
): Promise<OddsApiResponse> {
  try {
    const response = await axios.get(
      `${ODDS_API_BASE_URL}/sports/${sportKey}/odds`,
      {
        params: {
          apiKey: ENV.oddsApiKey,
          regions,
          markets,
          oddsFormat,
        },
      }
    );

    const remainingRequests = parseInt(
      response.headers["x-requests-remaining"] || "0"
    );
    const usedRequests = parseInt(response.headers["x-requests-used"] || "0");

    return {
      data: response.data,
      remainingRequests,
      usedRequests,
    };
  } catch (error) {
    console.error(`[OddsAPI] Failed to fetch odds for ${sportKey}:`, error);
    throw new Error(`Failed to fetch odds for ${sportKey}`);
  }
}

/**
 * Fetch odds for multiple sports at once
 */
export async function fetchMultipleSportsOdds(
  sportKeys: string[],
  regions: string = "au"
): Promise<Map<string, OddsEvent[]>> {
  const results = new Map<string, OddsEvent[]>();

  for (const sportKey of sportKeys) {
    try {
      const { data } = await fetchOdds(sportKey, regions);
      results.set(sportKey, data);
      
      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`[OddsAPI] Failed to fetch odds for ${sportKey}:`, error);
      results.set(sportKey, []);
    }
  }

  return results;
}

/**
 * Get popular Australian sports for odds fetching
 */
export function getAustralianSports(): string[] {
  return [
    "aussierules_afl", // AFL
    "rugbyleague_nrl", // NRL
    "cricket_big_bash", // Big Bash
    "cricket_test_match", // Test Cricket
    "soccer_australia_aleague", // A-League
    "basketball_nba", // NBA (popular in AU)
    "tennis_atp_us_open", // Tennis
  ];
}

/**
 * Get bookmaker display name from key
 */
export function getBookmakerName(key: string): string {
  const bookmakerNames: Record<string, string> = {
    sportsbet: "Sportsbet",
    bet365_au: "Bet365",
    tab: "TAB",
    neds: "Neds",
    ladbrokes_au: "Ladbrokes",
    betfair_ex_au: "Betfair Exchange",
    unibet: "Unibet",
    pointsbetau: "PointsBet",
    betr_au: "Betr",
    boombet: "BoomBet",
    betright: "Bet Right",
    playup: "PlayUp",
    tabtouch: "TABtouch",
    dabble_au: "Dabble",
  };

  return bookmakerNames[key] || key;
}

/**
 * Convert American odds to decimal
 */
export function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) {
    return americanOdds / 100 + 1;
  } else {
    return 100 / Math.abs(americanOdds) + 1;
  }
}

/**
 * Convert decimal odds to American
 */
export function decimalToAmerican(decimalOdds: number): number {
  if (decimalOdds >= 2.0) {
    return Math.round((decimalOdds - 1) * 100);
  } else {
    return Math.round(-100 / (decimalOdds - 1));
  }
}
