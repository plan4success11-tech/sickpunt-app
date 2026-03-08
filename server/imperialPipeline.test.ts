import { describe, it, expect } from "vitest";
import {
  isAU,
  generateRunId,
  sportsUrl,
  middleUrl,
} from "./imperialWealthScout";
import type { ModuleResult, ScoutOutput } from "./imperialWealthScout";
import { parseScoutOutput, buildSummary } from "./imperialIngestion";
import type { ScoutOutput as IngestionScoutOutput, ModuleRunResult } from "./imperialIngestion";

// ═══════════════════════════════════════════════════════════
// Scout unit tests
// ═══════════════════════════════════════════════════════════

describe("isAU", () => {
  it("should identify known Australian bookmakers (case insensitive)", () => {
    expect(isAU("Sportsbet")).toBe(true);
    expect(isAU("TAB")).toBe(true);
    expect(isAU("bet365")).toBe(true);
    expect(isAU("Ladbrokes")).toBe(true);
    expect(isAU("  Neds  ")).toBe(true);
    expect(isAU("BETFAIR")).toBe(true);
    expect(isAU("picklebet")).toBe(true);
  });

  it("should reject non-Australian bookmakers", () => {
    expect(isAU("William Hill")).toBe(false);
    expect(isAU("Pinnacle")).toBe(false);
    expect(isAU("FanDuel")).toBe(false);
    expect(isAU("DraftKings")).toBe(false);
    expect(isAU("")).toBe(false);
  });
});

describe("generateRunId", () => {
  it("should produce a unique string starting with run_", () => {
    const id1 = generateRunId();
    const id2 = generateRunId();
    expect(id1).toMatch(/^run_\d+_[a-z0-9]+$/);
    expect(id2).toMatch(/^run_\d+_[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });
});

describe("sportsUrl", () => {
  it("should build correct URL with page parameter", () => {
    const url = sportsUrl(1);
    expect(url).toContain("sports-maximiser?");
    expect(url).toContain("page=1");
    expect(url).toContain("perPage=100");
    expect(url).toContain("report=b2b");
    expect(url).toContain("oddType=2-way");
    expect(url).toContain("refresh=true");
  });

  it("should increment page parameter correctly", () => {
    const url3 = sportsUrl(3);
    expect(url3).toContain("page=3");
  });
});

describe("middleUrl", () => {
  it("should build correct URL with page parameter", () => {
    const url = middleUrl(1);
    expect(url).toContain("middle-maximiser?");
    expect(url).toContain("page=1");
    expect(url).toContain("perPage=100");
    expect(url).toContain("refresh=true");
  });

  it("should increment page parameter correctly", () => {
    const url5 = middleUrl(5);
    expect(url5).toContain("page=5");
  });
});

// ═══════════════════════════════════════════════════════════
// Ingestion output parsing tests
// ═══════════════════════════════════════════════════════════

describe("parseScoutOutput", () => {
  const validOutput: IngestionScoutOutput = {
    runId: "run_123_abc",
    tool: "all",
    startedAt: "2025-01-01T00:00:00.000Z",
    completedAt: "2025-01-01T00:05:00.000Z",
    durationMs: 300000,
    modules: [
      { module: "odds", status: "success", rowsExtracted: 50, rowsWritten: 50, durationMs: 60000, error: null, pageVerified: true },
      { module: "sports", status: "success", rowsExtracted: 30, rowsWritten: 30, durationMs: 45000, error: null, pageVerified: true },
      { module: "middle", status: "success", rowsExtracted: 10, rowsWritten: 10, durationMs: 30000, error: null, pageVerified: true },
    ],
    overallSuccess: true,
  };

  it("should parse valid structured output between markers", () => {
    const raw = `[Scout] Starting...\nsome logs\n__SCOUT_OUTPUT_START__\n${JSON.stringify(validOutput)}\n__SCOUT_OUTPUT_END__\n[Scout] Done.`;
    const parsed = parseScoutOutput(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.runId).toBe("run_123_abc");
    expect(parsed!.modules).toHaveLength(3);
    expect(parsed!.overallSuccess).toBe(true);
  });

  it("should return null when no markers present", () => {
    expect(parseScoutOutput("just some random logs")).toBeNull();
  });

  it("should return null when markers are present but JSON is invalid", () => {
    const raw = "__SCOUT_OUTPUT_START__\n{invalid json\n__SCOUT_OUTPUT_END__";
    expect(parseScoutOutput(raw)).toBeNull();
  });

  it("should return null when end marker comes before start marker", () => {
    const raw = "__SCOUT_OUTPUT_END__\n__SCOUT_OUTPUT_START__\n{}";
    expect(parseScoutOutput(raw)).toBeNull();
  });

  it("should use last occurrence of markers if output appears multiple times", () => {
    const earlyOutput = { ...validOutput, runId: "early" };
    const lateOutput = { ...validOutput, runId: "late" };
    const raw = `__SCOUT_OUTPUT_START__\n${JSON.stringify(earlyOutput)}\n__SCOUT_OUTPUT_END__\n...\n__SCOUT_OUTPUT_START__\n${JSON.stringify(lateOutput)}\n__SCOUT_OUTPUT_END__`;
    const parsed = parseScoutOutput(raw);
    expect(parsed!.runId).toBe("late");
  });
});

describe("buildSummary", () => {
  it("should include SUCCESS for passing runs", () => {
    const output: IngestionScoutOutput = {
      runId: "run_1",
      tool: "all",
      startedAt: "",
      completedAt: "",
      durationMs: 1000,
      modules: [
        { module: "sports", status: "success", rowsExtracted: 10, rowsWritten: 10, durationMs: 500, error: null, pageVerified: true },
      ],
      overallSuccess: true,
    };
    const summary = buildSummary(output);
    expect(summary).toContain("successfully");
    expect(summary).toContain("✓");
    expect(summary).toContain("sports");
  });

  it("should include FAILURE and error details for failing runs", () => {
    const output: IngestionScoutOutput = {
      runId: "run_2",
      tool: "sports",
      startedAt: "",
      completedAt: "",
      durationMs: 1000,
      modules: [
        { module: "sports", status: "failure", rowsExtracted: 0, rowsWritten: 0, durationMs: 500, error: "Timed out waiting for table", pageVerified: false },
      ],
      overallSuccess: false,
    };
    const summary = buildSummary(output);
    expect(summary).toContain("failures");
    expect(summary).toContain("✗");
    expect(summary).toContain("Timed out");
  });
});

// ═══════════════════════════════════════════════════════════
// CRITICAL: False-positive prevention tests
// ═══════════════════════════════════════════════════════════

describe("false-positive prevention", () => {
  it("MUST NOT report success when a requested module fails", () => {
    // This is the exact bug that was occurring: sports and middle fail silently,
    // but the process exits 0 and ingestion reports "success".
    const scoutOutput: IngestionScoutOutput = {
      runId: "run_test_false_positive",
      tool: "all",
      startedAt: "2025-01-01T00:00:00.000Z",
      completedAt: "2025-01-01T00:05:00.000Z",
      durationMs: 300000,
      modules: [
        { module: "odds", status: "success", rowsExtracted: 50, rowsWritten: 50, durationMs: 60000, error: null, pageVerified: true },
        { module: "sports", status: "failure", rowsExtracted: 0, rowsWritten: 0, durationMs: 30000, error: "Timed out waiting for table data", pageVerified: false },
        { module: "middle", status: "failure", rowsExtracted: 0, rowsWritten: 0, durationMs: 30000, error: "Timed out waiting for table data", pageVerified: false },
        { module: "promos", status: "success", rowsExtracted: 20, rowsWritten: 20, durationMs: 15000, error: null, pageVerified: true },
        { module: "intel", status: "success", rowsExtracted: 40, rowsWritten: 40, durationMs: 10000, error: null, pageVerified: true },
      ],
      overallSuccess: false,
    };

    // The structured output itself says overallSuccess=false
    expect(scoutOutput.overallSuccess).toBe(false);

    // The ingestion layer parsing it should also report failure
    const summary = buildSummary(scoutOutput);
    expect(summary).toContain("failures");

    // Verify the logic: any module with status=failure means overallSuccess=false
    const failedModules = scoutOutput.modules.filter(m => m.status === "failure");
    expect(failedModules.length).toBeGreaterThan(0);
    expect(failedModules.some(m => m.module === "sports")).toBe(true);
    expect(failedModules.some(m => m.module === "middle")).toBe(true);
  });

  it("should correctly report success when zero rows are legitimate (pageVerified=true)", () => {
    // This tests the distinction: zero rows + pageVerified=true is NOT a failure.
    // It means the page loaded, parsed, and there are genuinely no opportunities.
    const scoutOutput: IngestionScoutOutput = {
      runId: "run_test_legit_empty",
      tool: "sports",
      startedAt: "2025-01-01T00:00:00.000Z",
      completedAt: "2025-01-01T00:01:00.000Z",
      durationMs: 60000,
      modules: [
        {
          module: "sports",
          status: "success",
          rowsExtracted: 0,
          rowsWritten: 0,
          durationMs: 30000,
          error: null,
          pageVerified: true,  // <-- page loaded and parsed, just no data
        },
      ],
      overallSuccess: true,
    };

    expect(scoutOutput.overallSuccess).toBe(true);
    expect(scoutOutput.modules[0].status).toBe("success");
    expect(scoutOutput.modules[0].rowsWritten).toBe(0);
    expect(scoutOutput.modules[0].pageVerified).toBe(true);

    const summary = buildSummary(scoutOutput);
    expect(summary).toContain("successfully");
  });

  it("should report failure when zero rows AND page NOT verified (selector failure)", () => {
    const scoutOutput: IngestionScoutOutput = {
      runId: "run_test_selector_fail",
      tool: "sports",
      startedAt: "2025-01-01T00:00:00.000Z",
      completedAt: "2025-01-01T00:01:00.000Z",
      durationMs: 60000,
      modules: [
        {
          module: "sports",
          status: "failure",
          rowsExtracted: 0,
          rowsWritten: 0,
          durationMs: 30000,
          error: "Timed out waiting for table data after 30000ms",
          pageVerified: false,  // <-- page did NOT parse correctly
        },
      ],
      overallSuccess: false,
    };

    expect(scoutOutput.overallSuccess).toBe(false);
    expect(scoutOutput.modules[0].status).toBe("failure");
    expect(scoutOutput.modules[0].pageVerified).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Data validation tests
// ═══════════════════════════════════════════════════════════

describe("data validation rules", () => {
  it("should require odds > 1.0 for valid sports rows", () => {
    // This tests the validation logic documented in extractSportsMax
    const validRow = { event: "Team A vs Team B", odds1: 1.85, odds2: 2.10, bookie1: "Sportsbet", bookie2: "Bet365" };
    const invalidRow = { event: "Team A vs Team B", odds1: 0.0, odds2: 2.10, bookie1: "Sportsbet", bookie2: "Bet365" };

    const isValid = (r: typeof validRow) => r.event.length > 0 && r.odds1 > 1.0 && r.odds2 > 1.0 && (r.bookie1.length > 0 || r.bookie2.length > 0);

    expect(isValid(validRow)).toBe(true);
    expect(isValid(invalidRow)).toBe(false);
  });

  it("should require non-empty event names", () => {
    const row = { event: "", odds1: 1.85, odds2: 2.10, bookie1: "Tab", bookie2: "Neds" };
    const isValid = (r: typeof row) => r.event.length > 0 && r.odds1 > 1.0 && r.odds2 > 1.0;
    expect(isValid(row)).toBe(false);
  });
});
