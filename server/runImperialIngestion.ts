import "dotenv/config";
import { runImperialIngestion } from "./imperialIngestion";

async function main() {
  const modeArg = (process.argv[2] || "all") as
    | "all"
    | "odds"
    | "sports"
    | "middle"
    | "promos"
    | "intel";
  const pages = parseInt(process.argv[3] || "3", 10);

  const result = await runImperialIngestion(modeArg, Number.isFinite(pages) ? pages : 3);

  console.log(`\n[Imperial Runner] ${result.summary}`);
  console.log(`[Imperial Runner] Exit code: ${result.exitCode ?? "n/a"}`);
  console.log(`[Imperial Runner] Run ID: ${result.runId ?? "n/a"}`);

  if (result.moduleResults) {
    console.log("[Imperial Runner] Module results:");
    for (const m of result.moduleResults) {
      const icon = m.status === "success" ? "✓" : "✗";
      console.log(`  ${icon} ${m.module}: ${m.status} | extracted=${m.rowsExtracted} written=${m.rowsWritten} | ${m.durationMs}ms${m.error ? ` | error: ${m.error}` : ""}`);
    }
  }

  process.exit(result.success ? 0 : 1);
}

main().catch(error => {
  console.error("[Imperial Runner] Fatal error:", error);
  process.exit(1);
});
