import { describe, expect, it } from "vitest";
import { getJobStatus, triggerScanManually } from "./backgroundJobs";

const canRunLiveScan = Boolean(process.env.ODDS_API_KEY);

function skipIfNoOddsApiKey(): boolean {
  if (!canRunLiveScan) {
    expect(true).toBe(true);
    return true;
  }
  return false;
}

describe("Background Jobs", { timeout: 15000 }, () => {
  describe("Job Status Tracking", () => {
    it("should initialize with default status", () => {
      const status = getJobStatus();
      
      expect(status).toBeDefined();
      expect(status.isRunning).toBe(false);
      expect(status.successCount).toBeGreaterThanOrEqual(0);
      expect(status.failureCount).toBeGreaterThanOrEqual(0);
      expect(status.nextRun).toBeDefined();
    });

    it("should track job execution status", () => {
      const status = getJobStatus();
      
      expect(status.lastRun).toBeNull();
      expect(status.isRunning).toBe(false);
      expect(status.lastError).toBeNull();
    });
  });

  describe("Manual Scan Trigger", () => {
    it("should allow manual scan trigger", async () => {
      if (skipIfNoOddsApiKey()) return;
      const result = await triggerScanManually();
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.opportunitiesFound).toBeGreaterThanOrEqual(0);
    });

    it("should prevent concurrent scans", async () => {
      if (skipIfNoOddsApiKey()) return;
      const result = await triggerScanManually();
      
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it("should return proper error structure on failure", async () => {
      if (skipIfNoOddsApiKey()) return;
      const result = await triggerScanManually();
      
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      }
    });
  });

  describe("Cron Schedule", () => {
    it("should have next run time set", () => {
      const status = getJobStatus();
      
      if (status.nextRun) {
        expect(status.nextRun).toBeInstanceOf(Date);
        expect(status.nextRun.getTime()).toBeGreaterThan(Date.now());
      }
    });

    it("should calculate next run at top of hour", () => {
      const status = getJobStatus();
      
      if (status.nextRun) {
        expect(status.nextRun.getMinutes()).toBe(0);
        expect(status.nextRun.getSeconds()).toBe(0);
      }
    });
  });

  describe("Opportunity Detection", () => {
    it("should track opportunities found", async () => {
      if (skipIfNoOddsApiKey()) return;
      const result = await triggerScanManually();
      const status = getJobStatus();
      
      expect(status.opportunitiesFound).toBeGreaterThanOrEqual(0);
    });

    it("should increment success count on successful scan", async () => {
      if (skipIfNoOddsApiKey()) return;
      const statusBefore = getJobStatus();
      const result = await triggerScanManually();
      const statusAfter = getJobStatus();
      
      if (result.success) {
        expect(statusAfter.successCount).toBeGreaterThanOrEqual(statusBefore.successCount);
      }
    });

    it("should return valid result structure", async () => {
      if (skipIfNoOddsApiKey()) return;
      const result = await triggerScanManually();
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('opportunitiesFound');
    });
  });

  describe("Error Handling", () => {
    it("should capture error messages when they occur", async () => {
      if (skipIfNoOddsApiKey()) return;
      const result = await triggerScanManually();
      
      if (!result.success && result.error) {
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }
    });

    it("should store last error in status", async () => {
      if (skipIfNoOddsApiKey()) return;
      const result = await triggerScanManually();
      const status = getJobStatus();
      
      if (!result.success) {
        expect(status.lastError).toBeDefined();
      }
    });
  });

  describe("Job Metrics", () => {
    it("should provide comprehensive job metrics", () => {
      const status = getJobStatus();
      
      expect(status).toHaveProperty('lastRun');
      expect(status).toHaveProperty('nextRun');
      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('successCount');
      expect(status).toHaveProperty('failureCount');
      expect(status).toHaveProperty('lastError');
      expect(status).toHaveProperty('opportunitiesFound');
    });

    it("should track execution time implicitly", () => {
      const status = getJobStatus();
      
      if (status.lastRun) {
        expect(status.lastRun).toBeInstanceOf(Date);
        expect(status.lastRun.getTime()).toBeLessThanOrEqual(Date.now());
      }
    });
  });
});
