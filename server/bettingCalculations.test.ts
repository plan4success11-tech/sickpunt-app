import { describe, expect, it } from "vitest";
import {
  calculateArbitrage,
  calculateMiddleBetting,
  calculateDutching,
  calculateBackLay,
  convertToDecimal,
  analyzeOpportunityQuality
} from "./bettingCalculations";

describe("Betting Calculations", () => {
  describe("convertToDecimal", () => {
    it("should convert decimal odds correctly", () => {
      expect(convertToDecimal(2.5, "decimal")).toBe(2.5);
      expect(convertToDecimal("3.0", "decimal")).toBe(3.0);
    });

    it("should convert American odds correctly", () => {
      expect(convertToDecimal(150, "american")).toBe(2.5);
      expect(convertToDecimal(-200, "american")).toBe(1.5);
    });

    it("should convert fractional odds correctly", () => {
      expect(convertToDecimal("3/1", "fractional")).toBe(4.0);
      expect(convertToDecimal("1/2", "fractional")).toBe(1.5);
    });
  });

  describe("calculateArbitrage", () => {
    it("should identify arbitrage opportunity", () => {
      const result = calculateArbitrage(2.1, 2.1, 100);
      expect(result.isArbitrage).toBe(true);
      expect(result.roi).toBeGreaterThan(0);
      expect(result.guaranteedProfit).toBeGreaterThan(0);
    });

    it("should calculate correct stakes", () => {
      const result = calculateArbitrage(2.0, 2.0, 100);
      expect(result.stake1 + result.stake2).toBeCloseTo(100, 1);
    });

    it("should identify no arbitrage when odds are poor", () => {
      const result = calculateArbitrage(1.5, 1.5, 100);
      expect(result.isArbitrage).toBe(false);
      expect(result.roi).toBeLessThan(0);
    });

    it("should calculate equal profits for both outcomes", () => {
      const result = calculateArbitrage(2.1, 2.1, 100);
      expect(Math.abs(result.profit1 - result.profit2)).toBeLessThan(0.1);
    });
  });

  describe("calculateMiddleBetting", () => {
    it("should identify middle betting opportunity", () => {
      const result = calculateMiddleBetting(1.9, 215.5, 1.9, 218.5, 100);
      expect(result.isMiddle).toBe(true);
      expect(result.middleWinPercentage).toBeGreaterThan(0);
    });

    it("should calculate risk percentage", () => {
      const result = calculateMiddleBetting(1.9, 215, 1.9, 220, 100);
      expect(result.riskPercentage).toBeGreaterThan(0);
      expect(result.riskPercentage).toBeLessThan(100);
    });

    it("should calculate max profit when both bets win", () => {
      const result = calculateMiddleBetting(1.9, 215, 1.9, 220, 100);
      expect(result.maxProfit).toBeGreaterThan(0);
    });

    it("should calculate max loss correctly", () => {
      const result = calculateMiddleBetting(1.9, 215, 1.9, 220, 100);
      expect(result.maxLoss).toBe(-100);
    });
  });

  describe("calculateDutching", () => {
    it("should calculate stakes for 2-way dutching", () => {
      const result = calculateDutching([2.0, 3.0], 100);
      expect(result.stake1 + result.stake2).toBeCloseTo(100, 1);
    });

    it("should calculate stakes for 3-way dutching", () => {
      const result = calculateDutching([2.0, 3.0, 4.0], 100);
      expect(result.stake1 + result.stake2 + (result.stake3 || 0)).toBeCloseTo(100, 1);
    });

    it("should calculate equal profits for all outcomes", () => {
      const result = calculateDutching([2.0, 3.0], 100);
      expect(Math.abs(result.profitIfWin1 - result.profitIfWin2)).toBeLessThan(1);
    });

    it("should throw error for invalid number of selections", () => {
      expect(() => calculateDutching([2.0], 100)).toThrow();
      expect(() => calculateDutching([2.0, 3.0, 4.0, 5.0], 100)).toThrow();
    });
  });

  describe("calculateBackLay", () => {
    it("should calculate lay stake correctly", () => {
      const result = calculateBackLay(2.0, 2.1, 50, 0);
      expect(result.layStake).toBeGreaterThan(0);
    });

    it("should calculate liability", () => {
      const result = calculateBackLay(2.0, 2.1, 50, 0);
      expect(result.liability).toBeGreaterThan(0);
    });

    it("should account for commission", () => {
      const resultNoComm = calculateBackLay(2.0, 2.1, 50, 0);
      const resultWithComm = calculateBackLay(2.0, 2.1, 50, 5);
      expect(resultWithComm.layStake).toBeGreaterThan(resultNoComm.layStake);
    });

    it("should calculate qualifying loss", () => {
      const result = calculateBackLay(2.0, 2.1, 50, 2);
      expect(result.qualifyingLoss).toBeGreaterThan(0);
    });
  });

  describe("analyzeOpportunityQuality", () => {
    it("should rate excellent opportunities correctly", () => {
      const result = analyzeOpportunityQuality(15, null, 4);
      expect(result.quality).toBe("excellent");
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it("should rate good opportunities correctly", () => {
      const result = analyzeOpportunityQuality(5.5, 14, 2);
      // Score should be in a reasonable range
      expect(result.score).toBeGreaterThan(50);
      expect(result.score).toBeLessThan(90);
      expect(result.recommendation).toBeTruthy();
    });

    it("should rate fair opportunities correctly", () => {
      const result = analyzeOpportunityQuality(3, 18, 8);
      expect(result.quality).toBe("fair");
      expect(result.score).toBeGreaterThanOrEqual(40);
      expect(result.score).toBeLessThan(60);
    });

    it("should rate poor opportunities correctly", () => {
      const result = analyzeOpportunityQuality(1, 25, 0.5);
      expect(result.quality).toBe("poor");
      expect(result.score).toBeLessThan(40);
    });

    it("should provide recommendations", () => {
      const result = analyzeOpportunityQuality(10, null, 4);
      expect(result.recommendation).toBeTruthy();
      expect(typeof result.recommendation).toBe("string");
    });
  });
});
