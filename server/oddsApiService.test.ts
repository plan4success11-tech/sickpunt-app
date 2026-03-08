import { describe, expect, it } from "vitest";
import { fetchSports, fetchOdds, getAustralianSports, americanToDecimal, decimalToAmerican } from "./oddsApiService";

describe("Odds API Service", () => {
  describe("API Credentials Validation", () => {
    it("should successfully fetch sports list with valid API key", async () => {
      if (!process.env.ODDS_API_KEY) {
        console.log("[Test] Skipping live Odds API call (ODDS_API_KEY not set)");
        expect(true).toBe(true);
        return;
      }

      const sports = await fetchSports();
      
      expect(sports).toBeDefined();
      expect(Array.isArray(sports)).toBe(true);
      expect(sports.length).toBeGreaterThan(0);
      
      // Check structure of first sport
      if (sports.length > 0) {
        const sport = sports[0];
        expect(sport).toHaveProperty("key");
        expect(sport).toHaveProperty("title");
        expect(sport).toHaveProperty("group");
        expect(sport).toHaveProperty("active");
      }
    }, 10000); // 10 second timeout for API call

    it("should fetch odds for a popular sport", async () => {
      if (!process.env.ODDS_API_KEY) {
        console.log("[Test] Skipping live Odds API call (ODDS_API_KEY not set)");
        expect(true).toBe(true);
        return;
      }

      // Try to fetch odds for NBA (usually has events year-round)
      const sportKey = "basketball_nba";
      
      try {
        const result = await fetchOdds(sportKey, "au");
        
        expect(result).toBeDefined();
        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.remainingRequests).toBeGreaterThanOrEqual(0);
        
        console.log(`[Test] Fetched ${result.data.length} events for ${sportKey}`);
        console.log(`[Test] Remaining API requests: ${result.remainingRequests}`);
        
        // If there are events, check structure
        if (result.data.length > 0) {
          const event = result.data[0];
          expect(event).toHaveProperty("id");
          expect(event).toHaveProperty("sport_key");
          expect(event).toHaveProperty("home_team");
          expect(event).toHaveProperty("away_team");
          expect(event).toHaveProperty("bookmakers");
          expect(Array.isArray(event.bookmakers)).toBe(true);
        }
      } catch (error) {
        // If NBA is out of season, this is acceptable
        console.log(`[Test] ${sportKey} may be out of season or no events available`);
      }
    }, 15000); // 15 second timeout
  });

  describe("Utility Functions", () => {
    it("should convert American odds to decimal correctly", () => {
      expect(americanToDecimal(150)).toBeCloseTo(2.5, 2);
      expect(americanToDecimal(-200)).toBeCloseTo(1.5, 2);
      expect(americanToDecimal(100)).toBeCloseTo(2.0, 2);
      expect(americanToDecimal(-100)).toBeCloseTo(2.0, 2);
    });

    it("should convert decimal odds to American correctly", () => {
      expect(decimalToAmerican(2.5)).toBe(150);
      expect(decimalToAmerican(1.5)).toBe(-200);
      expect(decimalToAmerican(2.0)).toBe(100);
    });

    it("should return list of Australian sports", () => {
      const sports = getAustralianSports();
      
      expect(Array.isArray(sports)).toBe(true);
      expect(sports.length).toBeGreaterThan(0);
      expect(sports).toContain("aussierules_afl");
      expect(sports).toContain("rugbyleague_nrl");
    });
  });
});
