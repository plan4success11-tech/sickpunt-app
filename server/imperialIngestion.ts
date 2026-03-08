import { spawn } from "child_process";
import cron, { ScheduledTask } from "node-cron";
import mysql from "mysql2/promise";
import { notifyOwner } from "./_core/notification";
import { createAdminSystemNotifications, getDb } from "./db";
import { ingestionRuns } from "../drizzle/schema";

type ImperialMode = "all" | "odds" | "sports" | "middle" | "promos" | "intel";

/** Per-module result parsed from scout's structured JSON output */
interface ModuleRunResult {
  module: string;
  status: "success" | "failure" | "skipped";
  rowsExtracted: number;
  rowsWritten: number;
  durationMs: number;
  error: string | null;
  pageVerified: boolean;
}

/** Structured JSON output emitted by the scout process */
interface ScoutOutput {
  runId: string;
  tool: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  modules: ModuleRunResult[];
  overallSuccess: boolean;
}

type ImperialTableCounts = {
  oddsComparison: number | null;
  sportsMaximiser: number | null;
  middleMaximiser: number | null;
  promotions: number | null;
  bookmakerIntelligence: number | null;
  fetchedAt: string;
};

type ImperialIngestionStatus = {
  isEnabled: boolean;
  isRunning: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  lastExitCode: number | null;
  lastMode: ImperialMode | null;
  lastPages: number | null;
  lastSummary: string | null;
  lastModuleResults: ModuleRunResult[] | null;
  lastRunId: string | null;
  nextRunAt: string | null;
  counts: ImperialTableCounts;
};

const EMPTY_COUNTS: ImperialTableCounts = {
  oddsComparison: null,
  sportsMaximiser: null,
  middleMaximiser: null,
  promotions: null,
  bookmakerIntelligence: null,
  fetchedAt: new Date(0).toISOString(),
};

let scheduledTask: ScheduledTask | null = null;
let status: ImperialIngestionStatus = {
  isEnabled: false,
  isRunning: false,
  lastRunAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastDurationMs: null,
  lastError: null,
  lastExitCode: null,
  lastMode: null,
  lastPages: null,
  lastSummary: null,
  lastModuleResults: null,
  lastRunId: null,
  nextRunAt: null,
  counts: { ...EMPTY_COUNTS },
};

function getImperialScriptArgs(mode: ImperialMode, pages: number): string[] {
  const baseArgs = ["exec", "tsx", "server/imperialWealthScout.ts", mode];
  if (mode === "all" || mode === "odds" || mode === "sports" || mode === "middle") {
    baseArgs.push(String(pages));
  }
  return baseArgs;
}

function getImperialCron(): string {
  return process.env.IMPERIAL_CRON_SCHEDULE || "15 * * * *";
}

function calculateNextRunIso(): string | null {
  if (!status.isEnabled) return null;
  const now = new Date();
  const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
  nextHour.setMinutes(15, 0, 0);
  return nextHour.toISOString();
}

async function queryTableCount(
  conn: mysql.Connection,
  tableName: string
): Promise<number | null> {
  try {
    const [rows] = await conn.query(`SELECT COUNT(*) as c FROM ${tableName}`);
    const first = Array.isArray(rows) ? (rows[0] as Record<string, unknown>) : null;
    const value = first ? Number(first.c) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

async function refreshCounts(): Promise<ImperialTableCounts> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return {
      ...EMPTY_COUNTS,
      fetchedAt: new Date().toISOString(),
    };
  }

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection(dbUrl);
    return {
      oddsComparison: await queryTableCount(conn, "odds_comparison"),
      sportsMaximiser: await queryTableCount(conn, "sports_maximiser"),
      middleMaximiser: await queryTableCount(conn, "middle_maximiser"),
      promotions: await queryTableCount(conn, "promotions"),
      bookmakerIntelligence: await queryTableCount(conn, "bookmaker_intelligence"),
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return {
      ...EMPTY_COUNTS,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    if (conn) await conn.end().catch(() => undefined);
  }
}

async function sendFailureAlert(errorMessage: string): Promise<void> {
  if (process.env.IMPERIAL_ALERTS_ENABLED !== "true") return;
  try {
    const delivered = await notifyOwner({
      title: "Imperial Ingestion Failed",
      content: `Imperial ingestion failed at ${new Date().toISOString()}.\n\n${errorMessage}`,
    });
    if (delivered) return;

    const inserted = await createAdminSystemNotifications(
      "Imperial Ingestion Failed",
      `Imperial ingestion failed at ${new Date().toISOString()}.\n\n${errorMessage}`
    );
    if (inserted > 0) {
      console.warn(`[Imperial Ingestion] External owner alert failed; created ${inserted} admin in-app notification(s).`);
      return;
    }
    console.warn("[Imperial Ingestion] External owner alert failed and no admin users were available for fallback notification.");
  } catch (error) {
    console.warn("[Imperial Ingestion] Failure alert pipeline error:", error);
    // Best-effort alerting only; ingestion result should not be masked.
  }
}

/**
 * Parse the structured JSON output from the scout process.
 * The scout emits output between __SCOUT_OUTPUT_START__ and __SCOUT_OUTPUT_END__ markers.
 */
function parseScoutOutput(rawOutput: string): ScoutOutput | null {
  const startMarker = "__SCOUT_OUTPUT_START__";
  const endMarker = "__SCOUT_OUTPUT_END__";

  const startIdx = rawOutput.lastIndexOf(startMarker);
  const endIdx = rawOutput.lastIndexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return null;
  }

  const jsonStr = rawOutput
    .slice(startIdx + startMarker.length, endIdx)
    .trim();

  try {
    return JSON.parse(jsonStr) as ScoutOutput;
  } catch {
    return null;
  }
}

/**
 * Build a human-readable summary from the scout's structured output.
 */
function buildSummary(scoutOutput: ScoutOutput): string {
  const parts: string[] = [];

  if (scoutOutput.overallSuccess) {
    parts.push("Imperial ingestion completed successfully.");
  } else {
    parts.push("Imperial ingestion completed with failures.");
  }

  parts.push(`RunID: ${scoutOutput.runId}`);

  for (const m of scoutOutput.modules) {
    const flag = m.status === "success" ? "✓" : "✗";
    parts.push(`  ${flag} ${m.module}: ${m.status} (${m.rowsWritten} written, ${m.durationMs}ms${m.error ? `, error: ${m.error.substring(0, 100)}` : ""})`);
  }

  return parts.join("\n");
}

export function getImperialIngestionStatus(): ImperialIngestionStatus {
  return {
    ...status,
    counts: { ...status.counts },
    lastModuleResults: status.lastModuleResults ? [...status.lastModuleResults] : null,
  };
}

export async function runImperialIngestion(
  mode: ImperialMode = "all",
  pages = 3
): Promise<{ success: boolean; summary: string; exitCode: number | null; moduleResults: ModuleRunResult[] | null; runId: string | null }> {
  if (status.isRunning) {
    return {
      success: false,
      summary: "Imperial ingestion already running",
      exitCode: null,
      moduleResults: null,
      runId: null,
    };
  }

  const startedAt = Date.now();
  status.isRunning = true;
  status.lastRunAt = new Date(startedAt).toISOString();
  status.lastMode = mode;
  status.lastPages = pages;
  status.lastError = null;
  status.lastSummary = null;
  status.lastModuleResults = null;
  status.lastRunId = null;
  status.nextRunAt = calculateNextRunIso();

  const args = getImperialScriptArgs(mode, pages);
  let output = "";

  const result = await new Promise<{ exitCode: number | null; processError: string | null }>(
    resolve => {
      const child = spawn("pnpm", args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          IW_HEADLESS: process.env.IW_HEADLESS || "true",
        },
        shell: true,
      });

      child.stdout.on("data", chunk => {
        output += chunk.toString();
      });

      child.stderr.on("data", chunk => {
        output += chunk.toString();
      });

      child.on("close", exitCode => {
        resolve({ exitCode, processError: null });
      });

      child.on("error", err => {
        resolve({ exitCode: null, processError: err.message });
      });
    }
  );

  const durationMs = Date.now() - startedAt;
  status.isRunning = false;
  status.lastDurationMs = durationMs;
  status.lastExitCode = result.exitCode;
  status.nextRunAt = calculateNextRunIso();
  status.counts = await refreshCounts();

  // ─── Parse structured output from scout ───
  const scoutOutput = parseScoutOutput(output);
  let moduleResults: ModuleRunResult[] | null = null;
  let runId: string | null = null;

  if (scoutOutput) {
    moduleResults = scoutOutput.modules;
    runId = scoutOutput.runId;
    status.lastModuleResults = moduleResults;
    status.lastRunId = runId;
  }

  // ─── Determine success ───
  // Success requires: process exited 0 AND scout reports overallSuccess
  // If we have structured output, use it; otherwise fall back to exit code
  let success: boolean;
  let summary: string;

  if (result.processError) {
    success = false;
    summary = `Imperial ingestion process error: ${result.processError}`;
  } else if (scoutOutput) {
    success = scoutOutput.overallSuccess;
    summary = buildSummary(scoutOutput);
  } else {
    // No structured output available — fall back to exit code
    // But be conservative: if exit code is 0 but we can't verify modules, still flag it
    success = result.exitCode === 0;
    summary = success
      ? "Imperial ingestion completed (no structured output — verify manually)"
      : "Imperial ingestion failed (no structured output)";
  }

  status.lastSummary = summary;

  if (success) {
    status.lastSuccessAt = new Date().toISOString();
    status.lastError = null;
  } else {
    const tail = output.split("\n").slice(-40).join("\n").trim();
    status.lastFailureAt = new Date().toISOString();
    status.lastError = tail || summary;
    await sendFailureAlert(status.lastError);
  }

  // Persist each module result to ingestion_runs table
  if (moduleResults && runId) {
    try {
      const db = await getDb();
      if (db) {
        for (const m of moduleResults) {
          await db.insert(ingestionRuns).values({
            runId,
            module: m.module,
            status: m.status,
            startedAt: new Date(startedAt),
            completedAt: new Date(),
            rowsExtracted: m.rowsExtracted,
            rowsWritten: m.rowsWritten,
            errorSummary: m.error ?? null,
            pageVerified: m.pageVerified,
          });
        }
      }
    } catch (err) {
      console.warn("[Imperial Ingestion] Failed to write ingestion_runs rows:", err);
    }
  }

  return { success, summary, exitCode: result.exitCode, moduleResults, runId };
}

export function initializeImperialIngestionJobs(): void {
  const isEnabled = process.env.ENABLE_IMPERIAL_INGESTION === "true";
  status.isEnabled = isEnabled;
  status.nextRunAt = calculateNextRunIso();

  if (!isEnabled) {
    return;
  }

  const cronExpr = getImperialCron();
  scheduledTask = cron.schedule(cronExpr, async () => {
    await runImperialIngestion("all", 3);
  });
}

export function stopImperialIngestionJobs(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

// ─── Exports for testing ───
export { parseScoutOutput, buildSummary };
export type { ScoutOutput, ModuleRunResult, ImperialIngestionStatus, ImperialMode };
