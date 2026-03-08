import { describe, expect, it } from "vitest";
import {
  scanEventForArbitrage,
  scanEventsForArbitrage,
  scanEventForMiddles,
  filterOpportunitiesByQuality,
  filterOpportunitiesByTime,
  type ArbitrageOpportunity
} from "./opportunityScanner";
import { OddsEvent } from "./oddsApiService";

describe("Opportunity Scanner", () => {
  describe("scanEventForArbitrage", () => {
    it("should detect arbitrage opportunity with profitable odds", () => {
      const mockEvent: OddsEvent = {
        id: "test-event-1",
        sport_key: "basketball_nba",
        sport_title: "NBA",
        commence_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
        home_team: "Los Angeles Lakers",
        away_team: "Boston Celtics",
        bookmakers: [
          {
            key: "sportsbet",
            title: "Sportsbet",
            last_update: new Date().toISOString(),
            markets: [
              {
                key: "h2h",
                last_update: new Date().toISOString(),
                outcomes: [
                  { name: "Los Angeles Lakers", price: 2.10 },
                  { name: "Boston Celtics", price: 2.00 }
                ]
              }
            ]
          },
          {
            key: "bet365_au",
            title: "Bet365",
            last_update: new Date().toISOString(),
            markets: [
              {
                key: "h2h",
                last_update: new Date().toISOString(),
                outcomes: [
                  { name: "Los Angeles Lakers", price: 1.90 },
                  { name: "Boston Celtics", price: 2.15 }
                ]
              }
            ]
          }
        ]
      };

      const opportunities = scanEventForArbitrage(mockEvent, 0.5, 100);
      
      expect(opportunities.length).toBeGreaterThan(0);
      
      if (opportunities.length > 0) {
        const opp = opportunities[0];
        expect(opp.event).toContain("Lakers");
        expect(opp.event).toContain("Celtics");
        expect(opp.roi).toBeGreaterThan(0);
        expect(opp.guaranteedProfit).toBeGreaterThan(0);
        expect(opp.totalStake).toBe(100);
        expect(opp.stake1 + opp.stake2).toBeCloseTo(100, 2);
      }
    });

    it("should not detect arbitrage when odds are not profitable", () => {
      const mockEvent: OddsEvent = {
        id: "test-event-2",
        sport_key: "basketball_nba",
        sport_title: "NBA",
        commence_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        home_team: "Team A",
        away_team: "Team B",
        bookmakers: [
          {
            key: "sportsbet",
            title: "Sportsbet",
            last_update: new Date().toISOString(),
            markets: [
              {
                key: "h2h",
                last_update: new Date().toISOString(),
                outcomes: [
                  { name: "Team A", price: 1.90 },
                  { name: "Team B", price: 1.90 }
                ]
              }
            ]
          },
          {
            key: "bet365_au",
            title: "Bet365",
            last_update: new Date().toISOString(),
            markets: [
              {
                key: "h2h",
                last_update: new Date().toISOString(),
                outcomes: [
                  { name: "Team A", price: 1.85 },
                  { name: "Team B", price: 1.95 }
                ]
              }
            ]
          }
        ]
      };

      const opportunities = scanEventForArbitrage(mockEvent, 1.0, 100);
      
      // Should not find any opportunities with 1% minimum ROI
      expect(opportunities.length).toBe(0);
    });

    it("should require at least 2 bookmakers", () => {
      const mockEvent: OddsEvent = {
        id: "test-event-3",
        sport_key: "basketball_nba",
        sport_title: "NBA",
        commence_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        home_team: "Team A",
        away_team: "Team B",
        bookmakers: [
          {
            key: "sportsbet",
            title: "Sportsbet",
            last_update: new Date().toISOString(),
            markets: [
              {
                key: "h2h",
                last_update: new Date().toISOString(),
                outcomes: [
                  { name: "Team A", price: 2.50 },
                  { name: "Team B", price: 2.50 }
                ]
              }
            ]
          }
        ]
      };

      const opportunities = scanEventForArbitrage(mockEvent, 0.5, 100);
      
      expect(opportunities.length).toBe(0);
    });
  });

  describe("scanEventsForArbitrage", () => {
    it("should scan multiple events and sort by ROI", () => {
      const mockEvents: OddsEvent[] = [
        {
          id: "event-1",
          sport_key: "basketball_nba",
          sport_title: "NBA",
          commence_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          home_team: "Team A",
          away_team: "Team B",
          bookmakers: [
            {
              key: "sportsbet",
              title: "Sportsbet",
              last_update: new Date().toISOString(),
              markets: [
                {
                  key: "h2h",
                  last_update: new Date().toISOString(),
                  outcomes: [
                    { name: "Team A", price: 2.20 },
                    { name: "Team B", price: 1.95 }
                  ]
                }
              ]
            },
            {
              key: "bet365_au",
              title: "Bet365",
              last_update: new Date().toISOString(),
              markets: [
                {
                  key: "h2h",
                  last_update: new Date().toISOString(),
                  outcomes: [
                    { name: "Team A", price: 1.85 },
                    { name: "Team B", price: 2.25 }
                  ]
                }
              ]
            }
          ]
        },
        {
          id: "event-2",
          sport_key: "basketball_nba",
          sport_title: "NBA",
          commence_time: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          home_team: "Team C",
          away_team: "Team D",
          bookmakers: [
            {
              key: "sportsbet",
              title: "Sportsbet",
              last_update: new Date().toISOString(),
              markets: [
                {
                  key: "h2h",
                  last_update: new Date().toISOString(),
                  outcomes: [
                    { name: "Team C", price: 2.30 },
                    { name: "Team D", price: 1.90 }
                  ]
                }
              ]
            },
            {
              key: "neds",
              title: "Neds",
              last_update: new Date().toISOString(),
              markets: [
                {
                  key: "h2h",
                  last_update: new Date().toISOString(),
                  outcomes: [
                    { name: "Team C", price: 1.80 },
                    { name: "Team D", price: 2.35 }
                  ]
                }
              ]
            }
          ]
        }
      ];

      const opportunities = scanEventsForArbitrage(mockEvents, 0.5, 100);
      
      expect(opportunities.length).toBeGreaterThan(0);
      
      // Check that results are sorted by ROI descending
      for (let i = 0; i < opportunities.length - 1; i++) {
        expect(opportunities[i].roi).toBeGreaterThanOrEqual(opportunities[i + 1].roi);
      }
    });
  });

  describe("filterOpportunitiesByQuality", () => {
    it("should filter opportunities by quality threshold", () => {
      const mockOpportunities: ArbitrageOpportunity[] = [
        {
          event: "Event 1",
          sport: "NBA",
          sportKey: "basketball_nba",
          market: "h2h",
          commenceTime: new Date().toISOString(),
          bookmaker1: "Sportsbet",
          bookmaker1Key: "sportsbet",
          outcome1: "Team A",
          odds1: 2.10,
          stake1: 50,
          bookmaker2: "Bet365",
          bookmaker2Key: "bet365_au",
          outcome2: "Team B",
          odds2: 2.10,
          stake2: 50,
          roi: 12.0,
          guaranteedProfit: 12.0,
          totalStake: 100,
          profit1: 55,
          profit2: 55,
          quality: "excellent",
          qualityScore: 90,
          recommendation: "Strong opportunity",
          hoursUntilEvent: 24,
          detectedAt: new Date()
        },
        {
          event: "Event 2",
          sport: "NBA",
          sportKey: "basketball_nba",
          market: "h2h",
          commenceTime: new Date().toISOString(),
          bookmaker1: "Sportsbet",
          bookmaker1Key: "sportsbet",
          outcome1: "Team C",
          odds1: 2.00,
          stake1: 50,
          bookmaker2: "Neds",
          bookmaker2Key: "neds",
          outcome2: "Team D",
          odds2: 2.00,
          stake2: 50,
          roi: 3.0,
          guaranteedProfit: 3.0,
          totalStake: 100,
          profit1: 50,
          profit2: 50,
          quality: "fair",
          qualityScore: 50,
          recommendation: "Moderate opportunity",
          hoursUntilEvent: 12,
          detectedAt: new Date()
        }
      ];

      const filtered = filterOpportunitiesByQuality(mockOpportunities, "good");
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].quality).toBe("excellent");
    });
  });

  describe("filterOpportunitiesByTime", () => {
    it("should filter opportunities by time window", () => {
      const now = Date.now();
      const mockOpportunities: ArbitrageOpportunity[] = [
        {
          event: "Event 1",
          sport: "NBA",
          sportKey: "basketball_nba",
          market: "h2h",
          commenceTime: new Date(now + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
          bookmaker1: "Sportsbet",
          bookmaker1Key: "sportsbet",
          outcome1: "Team A",
          odds1: 2.10,
          stake1: 50,
          bookmaker2: "Bet365",
          bookmaker2Key: "bet365_au",
          outcome2: "Team B",
          odds2: 2.10,
          stake2: 50,
          roi: 5.0,
          guaranteedProfit: 5.0,
          totalStake: 100,
          profit1: 52.5,
          profit2: 52.5,
          quality: "good",
          qualityScore: 70,
          recommendation: "Good opportunity",
          hoursUntilEvent: 2,
          detectedAt: new Date()
        },
        {
          event: "Event 2",
          sport: "NBA",
          sportKey: "basketball_nba",
          market: "h2h",
          commenceTime: new Date(now + 72 * 60 * 60 * 1000).toISOString(), // 72 hours
          bookmaker1: "Sportsbet",
          bookmaker1Key: "sportsbet",
          outcome1: "Team C",
          odds1: 2.00,
          stake1: 50,
          bookmaker2: "Neds",
          bookmaker2Key: "neds",
          outcome2: "Team D",
          odds2: 2.00,
          stake2: 50,
          roi: 5.0,
          guaranteedProfit: 5.0,
          totalStake: 100,
          profit1: 50,
          profit2: 50,
          quality: "good",
          qualityScore: 70,
          recommendation: "Good opportunity",
          hoursUntilEvent: 72,
          detectedAt: new Date()
        }
      ];

      const filtered = filterOpportunitiesByTime(mockOpportunities, 1, 48);
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].hoursUntilEvent).toBe(2);
    });
  });

  describe("scanEventForMiddles", () => {
    it("should detect middle betting opportunity with sufficient gap", () => {
      const mockEvent: OddsEvent = {
        id: "test-middle-1",
        sport_key: "basketball_nba",
        sport_title: "NBA",
        commence_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        home_team: "Team A",
        away_team: "Team B",
        bookmakers: [
          {
            key: "sportsbet",
            title: "Sportsbet",
            last_update: new Date().toISOString(),
            markets: [
              {
                key: "totals",
                last_update: new Date().toISOString(),
                outcomes: [
                  { name: "Over 215.5", price: 1.90 },
                  { name: "Under 215.5", price: 1.90 }
                ]
              }
            ]
          },
          {
            key: "bet365_au",
            title: "Bet365",
            last_update: new Date().toISOString(),
            markets: [
              {
                key: "totals",
                last_update: new Date().toISOString(),
                outcomes: [
                  { name: "Over 218.5", price: 1.90 },
                  { name: "Under 218.5", price: 1.90 }
                ]
              }
            ]
          }
        ]
      };

      const middles = scanEventForMiddles(mockEvent, 2.0, 100);
      
      expect(middles.length).toBeGreaterThan(0);
      
      if (middles.length > 0) {
        const middle = middles[0];
        expect(middle.line2 - middle.line1).toBeGreaterThanOrEqual(2.0);
        expect(middle.middleRange).toBeDefined();
        expect(middle.maxProfit).toBeGreaterThan(0);
      }
    });

    it("should not detect middle when gap is too small", () => {
      const mockEvent: OddsEvent = {
        id: "test-middle-2",
        sport_key: "basketball_nba",
        sport_title: "NBA",
        commence_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        home_team: "Team A",
        away_team: "Team B",
        bookmakers: [
          {
            key: "sportsbet",
            title: "Sportsbet",
            last_update: new Date().toISOString(),
            markets: [
              {
                key: "totals",
                last_update: new Date().toISOString(),
                outcomes: [
                  { name: "Over 215.5", price: 1.90 },
                  { name: "Under 215.5", price: 1.90 }
                ]
              }
            ]
          },
          {
            key: "bet365_au",
            title: "Bet365",
            last_update: new Date().toISOString(),
            markets: [
              {
                key: "totals",
                last_update: new Date().toISOString(),
                outcomes: [
                  { name: "Over 216.5", price: 1.90 },
                  { name: "Under 216.5", price: 1.90 }
                ]
              }
            ]
          }
        ]
      };

      const middles = scanEventForMiddles(mockEvent, 2.0, 100);
      
      // Gap is only 1.0, should not meet 2.0 minimum
      expect(middles.length).toBe(0);
    });
  });
});
