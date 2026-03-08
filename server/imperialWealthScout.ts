import { chromium, Page } from 'playwright';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ═══════════════════════════════════════════════════════════
// SICK PUNT — Imperial Wealth Full Scout
// Extracts: Odds Comparison, Sports Maximiser, Middle Maximiser,
//           Promotion Finder, Bookmaker Intelligence
//
// Usage:
//   npx tsx server/imperialWealthScout.ts              (all tools, 3 pages each)
//   npx tsx server/imperialWealthScout.ts odds 5       (odds only, 5 pages)
//   npx tsx server/imperialWealthScout.ts sports 3     (sports max, 3 pages)
//   npx tsx server/imperialWealthScout.ts middle 3     (middle max, 3 pages)
//   npx tsx server/imperialWealthScout.ts promos       (promotions)
//   npx tsx server/imperialWealthScout.ts intel        (bookmaker intel)
// ═══════════════════════════════════════════════════════════

const IW_EMAIL = process.env.IW_EMAIL || '';
const IW_PASSWORD = process.env.IW_PASSWORD || '';
const LOGIN_URL = 'https://imperialwealth.com/signin';
const DB_URL = process.env.DATABASE_URL || '';
const HEADLESS = process.env.IW_HEADLESS !== 'false';

// ─── Constants ───────────────────────────────────────────
const NAV_TIMEOUT = 60_000;
const TABLE_WAIT_TIMEOUT = 30_000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 3_000;

// ─── Types ───────────────────────────────────────────────
type ModuleName = 'odds' | 'sports' | 'middle' | 'promos' | 'intel';

/** Structured result emitted by each module for orchestrator consumption */
interface ModuleResult {
  module: ModuleName;
  status: 'success' | 'failure' | 'skipped';
  rowsExtracted: number;
  rowsWritten: number;
  durationMs: number;
  error: string | null;
  /** True when page parsed correctly — zero rows with pageVerified=true means legitimately empty */
  pageVerified: boolean;
  diagnostics?: string | null;
}

/** Structured JSON output printed to stdout for the orchestrator to parse */
interface ScoutOutput {
  runId: string;
  tool: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  modules: ModuleResult[];
  overallSuccess: boolean;
}

function requireCredentials(): void {
  if (!IW_EMAIL || !IW_PASSWORD) {
    throw new Error('Missing required credentials: set IW_EMAIL and IW_PASSWORD');
  }
}

const URLS = {
  odds: 'https://imperialwealth.com/app/betting/odds-comparison',
  sports: 'https://imperialwealth.com/app/betting/sports-maximiser',
  middle: 'https://imperialwealth.com/app/betting/middle-maximiser',
  promos_racing: 'https://imperialwealth.com/app/betting/promotions?type=racing',
  promos_sports: 'https://imperialwealth.com/app/betting/promotions?type=sports',
  intel: 'https://imperialwealth.com/app/betting/bookmaker-intelligence?sort=bookmaker-tier',
};

/** Build the sports maximiser URL with pagination and default params */
function sportsUrl(pageNum: number): string {
  const params = new URLSearchParams({
    report: 'b2b',
    type: 'advance',
    oddType: '2-way',
    perPage: '100',
    refresh: 'true',
    page: String(pageNum),
  });
  return `${URLS.sports}?${params.toString()}`;
}

/** Build the middle maximiser URL with pagination and default params */
function middleUrl(pageNum: number): string {
  const params = new URLSearchParams({
    perPage: '100',
    refresh: 'true',
    page: String(pageNum),
  });
  return `${URLS.middle}?${params.toString()}`;
}

const AU_BOOKMAKERS = new Set([
  'tab sportsbet','tabozbet','tab','sportsbet','ladbrokes','neds',
  'pointsbet','bet365','betfair','betdeluxe','bluebet','topsport',
  'betr','boombet','palmerbet','crossbet','dabble','goldbet','surge',
  'chasebet','havabet','tradie bet','upc oz','star sports','ultra bet',
  'unibet','betright','mintbet','dowbet','marantelli bet','premium bet',
  'betbuzz','bet champs','betdash','betexpress','betit','betjet',
  'betnation','betreal','bigbet','diamond bet','mightybet','noisy',
  'pandabet','ponybet','pulsebet','razoo','yesbet','betaus','betlocal',
  'betm','betplay','betyoucan','next2go','punt123','ripperbet',
  'swiftbet','topbet','wizbet','betblitz','picklebet','hotbet',
  'baggybet','betbetbet','betestate','betflux','betgalaxy','betgold',
  'betkings','betprofessor','betroyale','bitwinning','bossbet',
  'budgetbet','colossalbet','elitebet','eskander bet','fiestabet',
  'foxcatcher betting','getsetbet','tabtouch',
]);

function isAU(name: string): boolean {
  return AU_BOOKMAKERS.has(name.toLowerCase().trim());
}

// ─── Helpers ─────────────────────────────────────────────

function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Retry wrapper with exponential backoff for transient failures */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        const delay = RETRY_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(`[${label}] Attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  throw lastError!;
}

/**
 * Wait for a data table to be present and contain at least one row,
 * or confirm the page loaded with a "no data" indicator.
 * Returns { hasRows: true } if rows found, { hasRows: false } if empty state confirmed.
 * Throws on timeout (neither state detected).
 */
async function waitForTableOrEmpty(
  page: Page,
  label: string,
  timeout = TABLE_WAIT_TIMEOUT,
): Promise<{ hasRows: boolean; explicitEmpty: boolean; rowCount: number; altRowCount: number; emptySignals: string[] }> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    // Check for data rows (multiple selector strategies)
    const rowCount = await page.locator('tbody.divide-y tr').count().catch(() => 0);
    if (rowCount > 0) {
      const loadingProbe = await page.evaluate(() => {
        const body = (document.body.textContent || '').toLowerCase();
        const hasLoadingText = body.includes('loading');
        const spinner =
          !!document.querySelector('[aria-busy="true"]') ||
          !!document.querySelector('[class*="loading"]') ||
          !!document.querySelector('[class*="spinner"]');
        return hasLoadingText || spinner;
      }).catch(() => false);
      if (!loadingProbe) {
        console.log(`[${label}] Table ready with ${rowCount} row(s).`);
        return { hasRows: true, explicitEmpty: false, rowCount, altRowCount: rowCount, emptySignals: [] };
      }
    }

    // Fallback selector
    const altRowCount = await page.locator('table tbody tr').count().catch(() => 0);
    if (altRowCount > 0) {
      const loadingProbe = await page.evaluate(() => {
        const body = (document.body.textContent || '').toLowerCase();
        const hasLoadingText = body.includes('loading');
        const spinner =
          !!document.querySelector('[aria-busy="true"]') ||
          !!document.querySelector('[class*="loading"]') ||
          !!document.querySelector('[class*="spinner"]');
        return hasLoadingText || spinner;
      }).catch(() => false);
      if (!loadingProbe) {
        console.log(`[${label}] Table ready (alt selector) with ${altRowCount} row(s).`);
        return { hasRows: true, explicitEmpty: false, rowCount, altRowCount, emptySignals: [] };
      }
    }

    // Explicit empty state only: avoid broad body-text false positives.
    const emptyProbe = await page.evaluate(() => {
      const patterns = [
        'no opportunities found',
        'no results found',
        'no records found',
        'no data available',
      ];
      const selectors = [
        '[data-testid*="empty"]',
        '[class*="empty"]',
        '[id*="empty"]',
      ];

      const hasTable = !!document.querySelector('table, tbody');
      const visibleText = (document.querySelector('main, [role="main"], body')?.textContent || '').toLowerCase();
      const matchedPatterns = patterns.filter(p => visibleText.includes(p));
      const matchedSelectors = selectors.filter(s => {
        const el = document.querySelector(s);
        if (!el) return false;
        const txt = (el.textContent || '').trim();
        return txt.length > 0;
      });

      const explicitEmpty = (hasTable && matchedPatterns.length > 0) || matchedSelectors.length > 0;
      return {
        explicitEmpty,
        matchedPatterns,
        matchedSelectors,
      };
    });

    if (emptyProbe.explicitEmpty) {
      const emptySignals = [...emptyProbe.matchedPatterns, ...emptyProbe.matchedSelectors];
      console.log(`[${label}] Page loaded with explicit empty state: ${emptySignals.join(', ')}`);
      return { hasRows: false, explicitEmpty: true, rowCount, altRowCount, emptySignals };
    }

    await sleep(1000);
  }

  throw new Error(`[${label}] Timed out waiting for table data after ${timeout}ms`);
}

async function captureModuleEvidence(
  page: Page,
  runId: string,
  module: ModuleName,
  pageNum: number,
  reason: string,
): Promise<string> {
  const primaryRows = await page.locator('tbody.divide-y tr').count().catch(() => 0);
  const fallbackRows = await page.locator('table tbody tr').count().catch(() => 0);
  const url = page.url();
  const htmlSnippet = await page.evaluate(() => {
    const root = document.querySelector('main, [role="main"], body');
    return (root?.innerHTML || '').slice(0, 4000);
  }).catch(() => '');
  const snippetHash = createHash('sha256').update(htmlSnippet).digest('hex').slice(0, 16);

  const evidenceDir = path.resolve(process.cwd(), 'tmp', 'imperial-evidence', runId);
  await fs.mkdir(evidenceDir, { recursive: true }).catch(() => undefined);
  const screenshotPath = path.join(evidenceDir, `${module}-p${pageNum}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);

  const diagnostics =
    `reason=${reason}; url=${url}; primaryRows=${primaryRows}; fallbackRows=${fallbackRows}; ` +
    `screenshot=${screenshotPath}; snippetHash=${snippetHash}`;
  console.log(`[Evidence][${module}] ${diagnostics}`);
  return diagnostics;
}

// ─── DATABASE ────────────────────────────────────────────
async function setupDB(): Promise<mysql.Connection | null> {
  if (!DB_URL) { console.log('[DB] No DATABASE_URL — print only.'); return null; }
  console.log('[DB] Connecting...');
  const conn = await mysql.createConnection(DB_URL);

  await conn.execute(`CREATE TABLE IF NOT EXISTS odds_comparison (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL, sport VARCHAR(100), league VARCHAR(200),
    event_date VARCHAR(50), timing VARCHAR(50),
    outcome VARCHAR(200) NOT NULL, bookmaker VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL, tab VARCHAR(20) DEFAULT 'odds',
    extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_event (event_name), INDEX idx_bookmaker (bookmaker), INDEX idx_extracted (extracted_at)
  )`);

  await conn.execute(`CREATE TABLE IF NOT EXISTS sports_maximiser (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_date VARCHAR(100), sport VARCHAR(100), league VARCHAR(200),
    event_name VARCHAR(255), market VARCHAR(200),
    bet1_name VARCHAR(200), bet1_odds DECIMAL(10,2), bet1_bookmaker VARCHAR(100),
    bet2_name VARCHAR(200), bet2_odds DECIMAL(10,2), bet2_bookmaker VARCHAR(100),
    roi DECIMAL(10,2), conversion DECIMAL(10,2), updated_ago VARCHAR(100),
    extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_roi (roi), INDEX idx_event (event_name)
  )`);

  await conn.execute(`CREATE TABLE IF NOT EXISTS middle_maximiser (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_date VARCHAR(100), event_name VARCHAR(255),
    sport VARCHAR(100), league VARCHAR(200), market VARCHAR(200),
    bet1_name VARCHAR(200), bet1_bookmaker VARCHAR(100), bet1_odds DECIMAL(10,2),
    bet2_name VARCHAR(200), bet2_bookmaker VARCHAR(100), bet2_odds DECIMAL(10,2),
    risk_pct DECIMAL(10,2), updated_ago VARCHAR(100),
    extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_risk (risk_pct), INDEX idx_event (event_name)
  )`);

  await conn.execute(`CREATE TABLE IF NOT EXISTS promotions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    promo_type VARCHAR(20) DEFAULT 'racing', track VARCHAR(200),
    races VARCHAR(100), promotion TEXT, bookmaker VARCHAR(100),
    account_specific TINYINT DEFAULT 0,
    extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_track (track), INDEX idx_bookmaker (bookmaker)
  )`);

  await conn.execute(`CREATE TABLE IF NOT EXISTS bookmaker_intelligence (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bookmaker_name VARCHAR(100) NOT NULL, website VARCHAR(200),
    platform VARCHAR(100), tier VARCHAR(20), importance VARCHAR(20),
    signup_bonus VARCHAR(10), promo_offering VARCHAR(20), promo_ban_risk VARCHAR(20),
    optin_racing VARCHAR(50), optin_sports VARCHAR(50),
    same_race_multi VARCHAR(100), same_game_multi VARCHAR(20),
    odds_boost VARCHAR(100), more_places VARCHAR(50),
    about TEXT, signup_offers TEXT, sustainability TEXT, last_updated VARCHAR(50),
    extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_bookmaker (bookmaker_name)
  )`);

  await conn.execute(`CREATE TABLE IF NOT EXISTS bet_tracker (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bet_date DATE, event_name VARCHAR(255),
    bookie1 VARCHAR(100), bonus_bet VARCHAR(20), odds1 DECIMAL(10,2), stake1 DECIMAL(10,2),
    bookie2 VARCHAR(100), odds2 DECIMAL(10,2), stake2 DECIMAL(10,2),
    bookie3 VARCHAR(100), odds3 DECIMAL(10,2), stake3 DECIMAL(10,2),
    profit DECIMAL(10,2), created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await conn.execute(`CREATE TABLE IF NOT EXISTS ingestion_runs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    run_id VARCHAR(64) NOT NULL,
    module VARCHAR(32) NOT NULL,
    status ENUM('success','failure','partial','skipped') NOT NULL DEFAULT 'failure',
    started_at DATETIME NOT NULL,
    completed_at DATETIME,
    rows_extracted INT DEFAULT 0,
    rows_written INT DEFAULT 0,
    error_summary TEXT,
    page_verified TINYINT DEFAULT 0,
    INDEX idx_run (run_id),
    INDEX idx_module (module),
    INDEX idx_started (started_at)
  )`);

  console.log('[DB] All tables ready.');
  return conn;
}

/** Write a module-level run record for auditing */
async function writeRunRecord(
  conn: mysql.Connection | null,
  runId: string,
  result: ModuleResult,
): Promise<void> {
  if (!conn) return;
  try {
    await conn.execute(
      `INSERT INTO ingestion_runs (run_id, module, status, started_at, completed_at, rows_extracted, rows_written, error_summary, page_verified)
       VALUES (?, ?, ?, NOW() - INTERVAL ? SECOND, NOW(), ?, ?, ?, ?)`,
      [
        runId,
        result.module,
        result.status,
        Math.round(result.durationMs / 1000),
        result.rowsExtracted,
        result.rowsWritten,
        [result.error, result.diagnostics].filter(Boolean).join(' | ').slice(0, 4000) || null,
        result.pageVerified ? 1 : 0,
      ],
    );
  } catch (err) {
    console.error(`[DB] Failed to write run record for ${result.module}:`, err instanceof Error ? err.message : String(err));
  }
}

// ─── LOGIN ───────────────────────────────────────────────
async function login(page: Page): Promise<boolean> {
  requireCredentials();
  console.log('[Scout] Logging in...');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await page.waitForTimeout(3000);
  await page.fill('input[name="email"]', IW_EMAIL);
  await page.fill('input[name="password"]', IW_PASSWORD);
  await page.keyboard.press('Enter');
  try {
    await page.waitForURL('**/app**', { timeout: 20000 });
    console.log('[Scout] Logged in.');
    return true;
  } catch {
    console.error('[Scout] Login failed — URL did not redirect to /app.');
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// 1. ODDS COMPARISON
// ═══════════════════════════════════════════════════════════
async function extractOdds(
  page: Page,
  conn: mysql.Connection | null,
  maxPages: number,
  runId: string
): Promise<ModuleResult> {
  const start = Date.now();
  let rowsExtracted = 0;
  let rowsWritten = 0;
  let pageVerified = false;
  let diagnostics: string | null = null;

  try {
    console.log('\n══ ODDS COMPARISON (' + maxPages + ' pages) ══\n');
    await withRetry('Odds load', async () => {
      await page.goto(URLS.odds, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    });
    await page.waitForTimeout(5000);
    pageVerified = true;

    for (let p = 1; p <= maxPages; p++) {
      console.log('--- Page ' + p + '/' + maxPages + ' ---');
      const buttons = page.locator('button.block.w-full[id^="headlessui-disclosure-button"]');
      let count = await buttons.count();

      // Fallback selector if primary misses
      if (count === 0) {
        const altButtons = page.locator('button[id^="headlessui-disclosure-button"]');
        count = await altButtons.count();
        if (count === 0 && p === 1) {
          diagnostics = await captureModuleEvidence(
            page,
            runId,
            'odds',
            p,
            'no-disclosure-buttons-on-page-1'
          );
          throw new Error('[Odds] No disclosure buttons found on page 1. Possible DOM change. ' + diagnostics);
        }
      }

      for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        if ((await btn.getAttribute('aria-expanded')) !== 'true') {
          await btn.click();
          await page.waitForTimeout(800);
        }
        const li = page.locator('ul.divide-y li').nth(i);
        const data = await li.evaluate((el) => {
          const event = el.querySelector('p.font-bold.text-amber-600')?.textContent?.trim() || '';
          const timing = (el.querySelector('.bg-green-100, .bg-red-100, .bg-yellow-100') as HTMLElement)?.textContent?.trim() || '';
          const infos = el.querySelectorAll('.text-gray-500 p, .text-gray-300 p');
          const parts: string[] = [];
          infos.forEach(p => { const t = p.textContent?.trim(); if (t && t !== '|') parts.push(t); });
          let date = '';
          el.querySelectorAll('.text-sm.text-gray-500, .text-sm.dark\\:text-gray-300').forEach(t => {
            const txt = t.textContent?.trim() || '';
            if (txt.match(/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i)) date = txt;
          });
          const panel = el.querySelector('[id^="headlessui-disclosure-panel"]');
          if (!panel) return { event, sport: parts[0]||'', league: parts[1]||'', date, timing, odds: [] as any[] };
          const outcomes: string[] = [];
          panel.querySelectorAll('.col-span-2 .h-12.text-sm').forEach(o => { const t = o.textContent?.trim(); if (t) outcomes.push(t); });
          const col3 = panel.querySelector('.col-span-3');
          if (!col3) return { event, sport: parts[0]||'', league: parts[1]||'', date, timing, odds: [] as any[] };
          const rows = col3.querySelectorAll('.inline-flex');
          const bookmakers: string[] = [];
          if (rows.length > 0) {
            rows[0].querySelectorAll('[data-original-title]').forEach(t => bookmakers.push(t.getAttribute('data-original-title') || 'Unknown'));
            if (bookmakers.length === 0) {
              rows[0].querySelectorAll('img').forEach(img => bookmakers.push(img.getAttribute('alt') || 'Unknown'));
            }
          }
          const odds: any[] = [];
          for (let oi = 0; oi < outcomes.length; oi++) {
            const row = rows[oi + 1]; if (!row) continue;
            row.querySelectorAll('.w-12.h-12').forEach((cell, ci) => {
              const price = parseFloat(cell.textContent?.trim().replace('$', '') || '0') || 0;
              if (price > 0) odds.push({ outcome: outcomes[oi], bookmaker: bookmakers[ci] || 'Unknown', price });
            });
          }
          return { event, sport: parts[0]||'', league: parts[1]||'', date, timing, odds };
        });

        const auOdds = data.odds.filter((o: any) => isAU(o.bookmaker));
        rowsExtracted += auOdds.length;

        if (conn && auOdds.length > 0) {
          await conn.execute('DELETE FROM odds_comparison WHERE event_name = ?', [data.event]);
          for (const o of auOdds) {
            await conn.execute(
              'INSERT INTO odds_comparison (event_name,sport,league,event_date,timing,outcome,bookmaker,price) VALUES (?,?,?,?,?,?,?,?)',
              [data.event, data.sport, data.league, data.date, data.timing, o.outcome, o.bookmaker, o.price],
            );
            rowsWritten++;
          }
        }
        console.log('  [' + (i+1) + '/' + count + '] ' + data.event + ' -> ' + auOdds.length + ' AU odds');
      }

      if (p < maxPages) {
        const next = page.locator('button:has-text("Next"), a:has-text("Next")');
        if (await next.count() > 0) {
          await next.first().click();
          await page.waitForTimeout(3000);
        } else {
          console.log('  No more pages.');
          break;
        }
      }
    }

    if (rowsExtracted === 0) {
      diagnostics = await captureModuleEvidence(
        page,
        runId,
        'odds',
        1,
        'zero-au-odds-parsed'
      );
      throw new Error('Odds extracted zero AU rows. ' + diagnostics);
    }

    console.log('[Odds] Total AU odds stored: ' + rowsWritten);
    return { module: 'odds', status: 'success', rowsExtracted, rowsWritten, durationMs: Date.now() - start, error: null, pageVerified, diagnostics };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Odds] ERROR:', msg);
    if (!diagnostics) {
      diagnostics = await captureModuleEvidence(page, runId, 'odds', 0, `failure: ${msg}`).catch(() => null);
    }
    return { module: 'odds', status: 'failure', rowsExtracted, rowsWritten, durationMs: Date.now() - start, error: msg, pageVerified, diagnostics };
  }
}

// ═══════════════════════════════════════════════════════════
// 2. SPORTS MAXIMISER
// ═══════════════════════════════════════════════════════════
async function extractSportsMax(page: Page, conn: mysql.Connection | null, maxPages: number, runId: string): Promise<ModuleResult> {
  const start = Date.now();
  let rowsExtracted = 0;
  let rowsWritten = 0;
  let pageVerified = false;
  let diagnostics: string | null = null;

  // Accumulate all rows; only write to DB after full extraction succeeds (safe write)
  const allRows: Array<{
    date: string; sport: string; league: string; event: string; market: string;
    bet1: string; bet2: string; odds1: number; odds2: number;
    roi: number; conversion: number; updated: string; bookie1: string; bookie2: string;
  }> = [];

  try {
    console.log('\n══ SPORTS MAXIMISER (' + maxPages + ' pages) ══\n');

    for (let p = 1; p <= maxPages; p++) {
      console.log('--- Page ' + p + '/' + maxPages + ' ---');

      // ─── FIX #1: Actually navigate to the sports URL with page param ───
      const url = sportsUrl(p);
      console.log(`  Navigating to: ${url}`);
      await withRetry(`Sports p${p}`, async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      });

      // ─── FIX #2: Proper wait-for-table-ready instead of fixed timeout ───
      const tableState = await waitForTableOrEmpty(page, `Sports p${p}`, TABLE_WAIT_TIMEOUT);
      pageVerified = true;

      if (!tableState.hasRows) {
        diagnostics = await captureModuleEvidence(
          page,
          runId,
          'sports',
          p,
          `zero-rows explicitEmpty=${tableState.explicitEmpty} signals=${tableState.emptySignals.join('|') || 'none'}`,
        );
        if (!tableState.explicitEmpty) {
          throw new Error(`Sports page ${p} had zero rows without explicit empty-state. ${diagnostics}`);
        }
        console.log(`  Page ${p} has explicit empty state. ${p === 1 ? 'Legitimately empty.' : 'End of pagination.'}`);
        break;
      }

      const rows = await page.evaluate(() => {
        let trs = document.querySelectorAll('tbody.divide-y tr');
        if (trs.length === 0) trs = document.querySelectorAll('table tbody tr');
        const rawRowCount = trs.length;
        const results: any[] = [];
        for (let i = 0; i < trs.length; i++) {
          const cells = trs[i].querySelectorAll('td');
          if (cells.length < 7) continue;
          const dateText = (cells[0] as HTMLElement | undefined)?.innerText?.trim() || '';
          if (!dateText || dateText.length < 5) continue;
          const sportParts = ((cells[1] as HTMLElement | undefined)?.innerText || '')
            .split('\n')
            .map((s: string) => s.trim())
            .filter(Boolean);
          const eventText = ((cells[2] as HTMLElement | undefined)?.innerText || '').replace(/\s+/g, ' ').trim();
          const market = ((cells[3] as HTMLElement | undefined)?.innerText || '').replace(/\s+/g, ' ').trim();
          const betsCellText = ((cells[4] as HTMLElement | undefined)?.innerText || '').trim();
          const betTexts = betsCellText
            .split('\n')
            .map((s: string) => s.trim())
            .filter(Boolean);
          const oddsCellText = ((cells[5] as HTMLElement | undefined)?.innerText || '').trim();
          const oddsNums = (oddsCellText.match(/\d+(?:\.\d+)?/g) || [])
            .map((s: string) => Number(s))
            .filter((n: number) => Number.isFinite(n) && n >= 1.01 && n <= 200);
          const roiCellText = ((cells[6] as HTMLElement | undefined)?.innerText || '').trim();
          const roiNums = (roiCellText.match(/-?\d+(?:\.\d+)?/g) || [])
            .map((s: string) => Number(s))
            .filter((n: number) => Number.isFinite(n) && n >= -1000 && n <= 1000);
          const updated = ((cells[7] as HTMLElement | undefined)?.innerText || '').trim();
          const imgs = trs[i].querySelectorAll('img[alt]');
          const bks: string[] = [];
          imgs.forEach(img => {
            const a = img.getAttribute('alt')?.trim();
            if (a && a.length > 1 && !a.includes('banner')) bks.push(a);
          });

          let bet1 = betTexts[0] || '';
          let bet2 = betTexts[1] || '';
          if (!bet2 && bet1) {
            const mergedMatch = bet1.match(/^(.+?\d(?:\.\d+)?)\s*([A-Z].+)$/);
            if (mergedMatch) {
              bet1 = mergedMatch[1].trim();
              bet2 = mergedMatch[2].trim();
            }
          }

          results.push({
            date: dateText, sport: sportParts[0]||'', league: sportParts[1]||'',
            event: eventText, market,
            bet1, bet2,
            odds1: oddsNums[0] || 0,
            odds2: oddsNums[1] || 0,
            roi: roiNums[0] || 0,
            conversion: roiNums[1] || 0,
            updated, bookie1: bks[0]||'', bookie2: bks[1]||'',
          });
        }
        return { rawRowCount, results };
      });
      const rawRowCount = rows.rawRowCount;
      const parsedRows = rows.results;

      // Data validation: reject rows that are clearly malformed
      const validRows = parsedRows.filter((r: any) =>
        r.event.length > 0 &&
        r.odds1 > 1.0 &&
        r.odds2 > 1.0 &&
        (r.bet1.length > 0 || r.bet2.length > 0)
      );
      const rejected = parsedRows.length - validRows.length;
      if (rejected > 0) console.log(`  Rejected ${rejected} malformed row(s).`);

      // If page table has rows but parser yields no valid opportunities, mark parser mismatch.
      if (rawRowCount > 0 && validRows.length === 0) {
        const rowSample = JSON.stringify(parsedRows.slice(0, 2));
        diagnostics = await captureModuleEvidence(
          page,
          runId,
          'sports',
          p,
          `parser-mismatch rawRows=${rawRowCount} parsedRows=${parsedRows.length} valid=0 sample=${rowSample}`,
        );
        throw new Error(
          `Sports parser mismatch on page ${p}: rawRows=${rawRowCount}, parsedRows=${parsedRows.length}, valid=0, sample=${rowSample}. ${diagnostics}`
        );
      }

      allRows.push(...validRows);
      rowsExtracted += validRows.length;
      console.log('  Extracted ' + validRows.length + ' matched betting opportunities (page ' + p + ')');

      // ─── FIX #3: Check if more pages exist before continuing ───
      if (p < maxPages) {
        const nextExists = await page.locator(
          'button:has-text("Next"):not([disabled]), a:has-text("Next"):not([disabled]), a:has-text("›"):not([disabled])'
        ).count();
        if (nextExists === 0) {
          console.log('  No more pages available.');
          break;
        }
      }
    }

    // ─── FIX #4: Safe write — only delete AFTER successful full extraction ───
    if (conn && allRows.length > 0) {
      await conn.execute('DELETE FROM sports_maximiser');
      for (const r of allRows) {
        await conn.execute(
          'INSERT INTO sports_maximiser (event_date,sport,league,event_name,market,bet1_name,bet1_odds,bet1_bookmaker,bet2_name,bet2_odds,bet2_bookmaker,roi,conversion,updated_ago) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [r.date, r.sport, r.league, r.event, r.market, r.bet1, r.odds1, r.bookie1, r.bet2, r.odds2, r.bookie2, r.roi, r.conversion, r.updated],
        );
        rowsWritten++;
      }
    } else if (conn && allRows.length === 0 && pageVerified) {
      // Page parsed correctly, genuinely zero opportunities — safe to clear stale data
      await conn.execute('DELETE FROM sports_maximiser');
      console.log('[Sports Max] Zero opportunities confirmed (page verified). Cleared stale data.');
    }

    console.log('[Sports Max] Total stored: ' + rowsWritten);
    return { module: 'sports', status: 'success', rowsExtracted, rowsWritten, durationMs: Date.now() - start, error: null, pageVerified, diagnostics };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Sports Max] ERROR:', msg);
    // ─── FIX #5: Do NOT delete existing data on failure ───
    if (!diagnostics) {
      diagnostics = await captureModuleEvidence(page, runId, 'sports', 0, `failure: ${msg}`).catch(() => null);
    }
    return { module: 'sports', status: 'failure', rowsExtracted, rowsWritten, durationMs: Date.now() - start, error: msg, pageVerified, diagnostics };
  }
}

// ═══════════════════════════════════════════════════════════
// 3. MIDDLE MAXIMISER
// ═══════════════════════════════════════════════════════════
async function extractMiddleMax(page: Page, conn: mysql.Connection | null, maxPages: number, runId: string): Promise<ModuleResult> {
  const start = Date.now();
  let rowsExtracted = 0;
  let rowsWritten = 0;
  let pageVerified = false;
  let diagnostics: string | null = null;

  const allRows: Array<{
    date: string; event: string; sport: string; league: string; market: string;
    bet1: string; bet2: string; bookie1: string; bookie2: string;
    odds1: number; odds2: number; risk: number; updated: string;
  }> = [];

  try {
    console.log('\n══ MIDDLE MAXIMISER (' + maxPages + ' pages) ══\n');

    for (let p = 1; p <= maxPages; p++) {
      console.log('--- Page ' + p + '/' + maxPages + ' ---');

      // ─── FIX #1: Actually navigate to the middle URL with page param ───
      const url = middleUrl(p);
      console.log(`  Navigating to: ${url}`);
      await withRetry(`Middle p${p}`, async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      });

      // ─── FIX #2: Proper wait-for-table-ready ───
      const tableState = await waitForTableOrEmpty(page, `Middle p${p}`, TABLE_WAIT_TIMEOUT);
      pageVerified = true;

      if (!tableState.hasRows) {
        diagnostics = await captureModuleEvidence(
          page,
          runId,
          'middle',
          p,
          `zero-rows explicitEmpty=${tableState.explicitEmpty} signals=${tableState.emptySignals.join('|') || 'none'}`,
        );
        if (!tableState.explicitEmpty) {
          throw new Error(`Middle page ${p} had zero rows without explicit empty-state. ${diagnostics}`);
        }
        console.log(`  Page ${p} has explicit empty state. ${p === 1 ? 'Legitimately empty.' : 'End of pagination.'}`);
        break;
      }

      const rows = await page.evaluate(() => {
        let trs = document.querySelectorAll('tbody.divide-y tr');
        if (trs.length === 0) trs = document.querySelectorAll('table tbody tr');
        const targetTable = (trs[0]?.closest('table') as HTMLTableElement | null) || document.querySelector('table');
        const ths = targetTable ? Array.from(targetTable.querySelectorAll('thead th')) : [];
        const headers = ths.map(th => (th.textContent || '').trim().toLowerCase());
        const idxDate = (() => { const i = headers.findIndex(h => h.includes('date')); return i >= 0 ? i : 0; })();
        const idxEvent = (() => { const i = headers.findIndex(h => h.includes('event')); return i >= 0 ? i : 1; })();
        const idxMarket = (() => { const i = headers.findIndex(h => h.includes('market')); return i >= 0 ? i : 2; })();
        const idxBets = (() => { const i = headers.findIndex(h => h.includes('bet')); return i >= 0 ? i : 3; })();
        const idxBookmakers = (() => { const i = headers.findIndex(h => h.includes('bookmaker')); return i >= 0 ? i : 4; })();
        const idxOdds = (() => { const i = headers.findIndex(h => h.includes('odds')); return i >= 0 ? i : 5; })();
        const idxUpdated = (() => { const i = headers.findIndex(h => h.includes('updated')); return i >= 0 ? i : 6; })();
        const idxRisk = (() => { const i = headers.findIndex(h => h.includes('risk')); return i >= 0 ? i : 7; })();
        const results: any[] = [];
        for (let i = 0; i < trs.length; i++) {
          const cells = trs[i].querySelectorAll('td');
          if (cells.length < 7) continue;
          const dateText = cells[idxDate]?.textContent?.trim() || '';
          if (!dateText || dateText.length < 5) continue;
          const eventParts = cells[idxEvent]?.textContent?.trim().split('\n').map((s: string) => s.trim()).filter(Boolean) || [];
          const marketParts = cells[idxMarket]?.textContent?.trim().split('\n').map((s: string) => s.trim()).filter(Boolean) || [];
          const betsCellText = cells[idxBets]?.textContent?.trim() || '';
          const betMatches = betsCellText.match(/(Over|Under)\s*[\d.]+/gi) || [];
          const betTexts = betMatches.length > 0
            ? betMatches.map((s: string) => s.replace(/\s+/g, ' ').trim())
            : betsCellText.split('\n').map((s: string) => s.trim()).filter(Boolean);
          const bookmakerImgs = cells[idxBookmakers]?.querySelectorAll('img[alt]');
          const bks: string[] = [];
          bookmakerImgs?.forEach(img => {
            const a = img.getAttribute('alt')?.trim();
            if (a && a.length > 1) bks.push(a);
          });
          const oddsCellText = cells[idxOdds]?.textContent?.trim() || '';
          const oddsNums = (oddsCellText.match(/-?\d+(?:\.\d+)?/g) || [])
            .map((s: string) => Number(s))
            .filter((n: number) => Number.isFinite(n) && n >= 1.01 && n <= 100);
          const updated = cells[idxUpdated]?.textContent?.trim() || '';
          const risk = parseFloat(cells[idxRisk]?.textContent?.trim().replace('%','')||'0')||0;
          const eventText = eventParts.join(' ').replace(/\s+/g, ' ').trim();
          const sportGuess = /(NRL|AFL|NBA|NFL|EPL|NHL|MLB|Tennis|Rugby|Soccer|Basketball|Cricket|Baseball|Ice Hockey)/i.exec(eventText)?.[0] || '';
          results.push({
            date: dateText, event: eventText || eventParts[0] || '', sport: sportGuess, league: '',
            market: marketParts.join(' / '),
            bet1: betTexts[0]||'', bet2: betTexts[1]||'',
            bookie1: bks[0]||'', bookie2: bks[1]||'',
            odds1: oddsNums[0] || 0,
            odds2: oddsNums[1] || 0,
            risk, updated,
          });
        }
        return results;
      });

      const validRows = rows.filter((r: any) =>
        r.event.length > 0 &&
        r.bet1.length > 0 &&
        r.bet2.length > 0 &&
        r.bookie1.length > 0 &&
        r.bookie2.length > 0 &&
        r.odds1 > 1.0 &&
        r.odds2 > 1.0 &&
        r.risk >= -200 &&
        r.risk <= 200
      );
      const rejected = rows.length - validRows.length;
      if (rejected > 0) console.log(`  Rejected ${rejected} malformed row(s).`);

      // If the table has rows but all parsed rows are invalid, treat as parser mismatch (failure).
      if (rows.length > 0 && validRows.length === 0) {
        const rowSample = JSON.stringify(rows.slice(0, 2));
        diagnostics = await captureModuleEvidence(
          page,
          runId,
          'middle',
          p,
          `parser-mismatch rows=${rows.length} valid=0 sample=${rowSample}`,
        );
        throw new Error(`Middle parser mismatch on page ${p}: rows=${rows.length}, valid=0, sample=${rowSample}. ${diagnostics}`);
      }

      allRows.push(...validRows);
      rowsExtracted += validRows.length;
      console.log('  Extracted ' + validRows.length + ' middle opportunities (page ' + p + ')');

      if (p < maxPages) {
        const nextExists = await page.locator(
          'button:has-text("Next"):not([disabled]), a:has-text("Next"):not([disabled]), a:has-text("›"):not([disabled])'
        ).count();
        if (nextExists === 0) {
          console.log('  No more pages available.');
          break;
        }
      }
    }

    // ─── FIX: Safe write ───
    if (conn && allRows.length > 0) {
      await conn.execute('DELETE FROM middle_maximiser');
      for (const r of allRows) {
        await conn.execute(
          'INSERT INTO middle_maximiser (event_date,event_name,sport,league,market,bet1_name,bet1_bookmaker,bet1_odds,bet2_name,bet2_bookmaker,bet2_odds,risk_pct,updated_ago) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [r.date, r.event, r.sport, r.league, r.market, r.bet1, r.bookie1, r.odds1, r.bet2, r.bookie2, r.odds2, r.risk, r.updated],
        );
        rowsWritten++;
      }
    } else if (conn && allRows.length === 0 && pageVerified) {
      await conn.execute('DELETE FROM middle_maximiser');
      console.log('[Middle Max] Zero opportunities confirmed (page verified). Cleared stale data.');
    }

    console.log('[Middle Max] Total stored: ' + rowsWritten);
    return { module: 'middle', status: 'success', rowsExtracted, rowsWritten, durationMs: Date.now() - start, error: null, pageVerified, diagnostics };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Middle Max] ERROR:', msg);
    if (!diagnostics) {
      diagnostics = await captureModuleEvidence(page, runId, 'middle', 0, `failure: ${msg}`).catch(() => null);
    }
    return { module: 'middle', status: 'failure', rowsExtracted, rowsWritten, durationMs: Date.now() - start, error: msg, pageVerified, diagnostics };
  }
}

// ═══════════════════════════════════════════════════════════
// 4. PROMOTION FINDER
// ═══════════════════════════════════════════════════════════
async function extractPromos(page: Page, conn: mysql.Connection | null): Promise<ModuleResult> {
  const start = Date.now();
  let rowsExtracted = 0;
  let rowsWritten = 0;
  let pageVerified = false;
  const allPromos: Array<{ type: string; track: string; races: string; promotion: string; bookmaker: string; accountSpecific: number }> = [];

  try {
    console.log('\n══ PROMOTION FINDER ══\n');

    for (const type of ['racing', 'sports'] as const) {
      const url = type === 'racing' ? URLS.promos_racing : URLS.promos_sports;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await page.waitForTimeout(5000);
      pageVerified = true;

      const promos = await page.evaluate((promoType: string) => {
        const results: any[] = [];
        const lis = document.querySelectorAll('ul.divide-y li');
        lis.forEach(li => {
          const headings = li.querySelectorAll('.font-bold, .font-semibold, .text-lg');
          let track = '';
          headings.forEach(h => { const t = h.textContent?.trim()||''; if (t.length > 2 && !t.includes('Promotion') && !t.includes('Races')) track = t; });
          const rows = li.querySelectorAll('tbody tr');
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) return;
            const img = cells[0]?.querySelector('img[alt]');
            const bookmaker = img?.getAttribute('alt')?.trim() || '';
            const races = cells[1]?.textContent?.trim() || '';
            const promotion = cells[2]?.textContent?.trim() || '';
            const acct = (cells[3]?.textContent?.trim()||'').includes('Account Specific') ? 1 : 0;
            if (promotion) results.push({ type: promoType, track, races, promotion, bookmaker, accountSpecific: acct });
          });
        });
        return results;
      }, type);

      allPromos.push(...promos);
      rowsExtracted += promos.length;
      console.log('  ' + type + ': ' + promos.length + ' promotions');
    }

    // Safe write
    if (conn && allPromos.length > 0) {
      await conn.execute('DELETE FROM promotions');
      for (const pr of allPromos) {
        await conn.execute(
          'INSERT INTO promotions (promo_type,track,races,promotion,bookmaker,account_specific) VALUES (?,?,?,?,?,?)',
          [pr.type, pr.track, pr.races, pr.promotion, pr.bookmaker, pr.accountSpecific],
        );
        rowsWritten++;
      }
    } else if (conn && allPromos.length === 0 && pageVerified) {
      await conn.execute('DELETE FROM promotions');
      console.log('[Promos] Zero promotions confirmed (page verified). Cleared stale data.');
    }

    console.log('[Promos] Done. Written: ' + rowsWritten);
    return { module: 'promos', status: 'success', rowsExtracted, rowsWritten, durationMs: Date.now() - start, error: null, pageVerified };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Promos] ERROR:', msg);
    return { module: 'promos', status: 'failure', rowsExtracted, rowsWritten, durationMs: Date.now() - start, error: msg, pageVerified };
  }
}

// ═══════════════════════════════════════════════════════════
// 5. BOOKMAKER INTELLIGENCE
// ═══════════════════════════════════════════════════════════
async function extractIntel(page: Page, conn: mysql.Connection | null): Promise<ModuleResult> {
  const start = Date.now();
  let rowsExtracted = 0;
  let rowsWritten = 0;
  let pageVerified = false;

  try {
    console.log('\n══ BOOKMAKER INTELLIGENCE ══\n');
    await page.goto(URLS.intel, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(5000);
    pageVerified = true;

    const sel = page.locator('select').filter({ hasText: 'Per Page' }).first();
    if (await sel.count() > 0) {
      await sel.selectOption('100 Per Page');
      await page.waitForTimeout(5000);
    }

    const bookmakers = await page.evaluate(() => {
      const cards = document.querySelectorAll('div.bg-white.shadow.w-full, div.shadow.w-full');
      const results: any[] = [];
      cards.forEach(card => {
        const text = card.textContent || '';
        if (text.length < 50) return;
        const headerDiv = card.querySelector('.m-4.flex');
        if (!headerDiv) return;

        const nameNodes = headerDiv.querySelectorAll('span, p, a, div');
        let name = '';
        nameNodes.forEach(n => {
          const t = n.textContent?.trim() || '';
          if (t.length >= 2 && t.length <= 40 && !t.includes('.com') && !t.includes('AU') && !t.includes('RELATED')) {
            if (!name) name = t;
          }
        });
        if (!name) {
          const allText = headerDiv.textContent?.trim() || '';
          name = allText.split('\n')[0]?.trim().split('AU')[0]?.trim() || '';
        }
        if (!name || name.length < 2) return;

        const linkEl = headerDiv.querySelector('a');
        const website = linkEl?.textContent?.trim() || '';

        const gridDivs = card.querySelectorAll('.grid > div');
        const attrs: Record<string, string> = {};
        gridDivs.forEach(div => {
          const lines = div.textContent?.trim().split('\n').map(s => s.trim()).filter(Boolean) || [];
          if (lines.length >= 2) attrs[lines[0].toLowerCase()] = lines.slice(1).join(' ');
        });

        const sections: Record<string, string> = {};
        card.querySelectorAll('h4, h3, .font-semibold').forEach(h => {
          const key = h.textContent?.trim().toLowerCase() || '';
          const sib = h.nextElementSibling;
          if (sib && key) sections[key] = sib.textContent?.trim().substring(0, 2000) || '';
        });

        const tierMatch = text.match(/Tier\s*(\d)/);
        results.push({
          name, website,
          platform: attrs['platform'] || '',
          tier: tierMatch ? tierMatch[0] : '',
          importance: attrs['importance'] || '',
          signup_bonus: attrs['sign-up bonus?'] || '',
          promo_offering: attrs['promo offering'] || '',
          promo_ban_risk: attrs['promo ban risk'] || '',
          optin_racing: attrs['opt-in racing'] || '',
          optin_sports: attrs['opt-in sports'] || '',
          same_race_multi: attrs['same race multi'] || '',
          same_game_multi: attrs['same game multi'] || '',
          odds_boost: attrs['odds boost'] || '',
          more_places: attrs['more places'] || '',
          about: sections['about'] || '',
          signup_offers: sections['sign-up offers'] || sections['signup offers'] || '',
          sustainability: sections['sustainability'] || '',
          last_updated: sections['last updated'] || '',
        });
      });
      return results;
    });

    if (bookmakers.length === 0) {
      throw new Error('Bookmaker intelligence parser returned zero rows.');
    }

    rowsExtracted = bookmakers.length;
    if (conn) {
      for (const b of bookmakers) {
        await conn.execute(
          `INSERT INTO bookmaker_intelligence (bookmaker_name,website,platform,tier,importance,signup_bonus,promo_offering,promo_ban_risk,optin_racing,optin_sports,same_race_multi,same_game_multi,odds_boost,more_places,about,signup_offers,sustainability,last_updated)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE website=VALUES(website),platform=VALUES(platform),tier=VALUES(tier),importance=VALUES(importance),signup_bonus=VALUES(signup_bonus),promo_offering=VALUES(promo_offering),promo_ban_risk=VALUES(promo_ban_risk),optin_racing=VALUES(optin_racing),optin_sports=VALUES(optin_sports),same_race_multi=VALUES(same_race_multi),same_game_multi=VALUES(same_game_multi),odds_boost=VALUES(odds_boost),more_places=VALUES(more_places),about=VALUES(about),signup_offers=VALUES(signup_offers),sustainability=VALUES(sustainability),last_updated=VALUES(last_updated),extracted_at=CURRENT_TIMESTAMP`,
          [b.name,b.website,b.platform,b.tier,b.importance,b.signup_bonus,b.promo_offering,b.promo_ban_risk,b.optin_racing,b.optin_sports,b.same_race_multi,b.same_game_multi,b.odds_boost,b.more_places,b.about,b.signup_offers,b.sustainability,b.last_updated],
        );
        rowsWritten++;
      }
    }

    console.log('[Intel] ' + bookmakers.length + ' bookmakers stored');
    return { module: 'intel', status: 'success', rowsExtracted, rowsWritten, durationMs: Date.now() - start, error: null, pageVerified };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Intel] ERROR:', msg);
    return { module: 'intel', status: 'failure', rowsExtracted, rowsWritten, durationMs: Date.now() - start, error: msg, pageVerified };
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN — structured output + deterministic exit code
// ═══════════════════════════════════════════════════════════
async function main(): Promise<void> {
  const tool = (process.argv[2] || 'all') as 'all' | ModuleName;
  const pages = parseInt(process.argv[3] || '3');
  const runId = generateRunId();
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║        SICK PUNT — FULL SCOUT            ║');
  console.log('║        AU Bookmakers Only                 ║');
  console.log('║        Tool: ' + tool.padEnd(28) + '║');
  console.log('║        RunID: ' + runId.slice(0, 27).padEnd(27) + '║');
  if (['all','odds','sports','middle'].includes(tool)) {
    console.log('║        Pages: ' + String(pages).padEnd(27) + '║');
  }
  console.log('╚══════════════════════════════════════════╝\n');

  const conn = await setupDB();
  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: 200,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--no-zygote',
      '--single-process',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT);

  if (!(await login(page))) {
    const output: ScoutOutput = {
      runId, tool, startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      modules: [],
      overallSuccess: false,
    };
    console.log('\n__SCOUT_OUTPUT_START__');
    console.log(JSON.stringify(output));
    console.log('__SCOUT_OUTPUT_END__');
    await browser.close();
    if (conn) await conn.end().catch(() => undefined);
    process.exit(1);
  }

  const results: ModuleResult[] = [];

  if (tool === 'all' || tool === 'odds') {
    const r = await extractOdds(page, conn, pages, runId);
    results.push(r);
    if (conn) await writeRunRecord(conn, runId, r);
  }
  if (tool === 'all' || tool === 'sports') {
    const r = await extractSportsMax(page, conn, pages, runId);
    results.push(r);
    if (conn) await writeRunRecord(conn, runId, r);
  }
  if (tool === 'all' || tool === 'middle') {
    const r = await extractMiddleMax(page, conn, pages, runId);
    results.push(r);
    if (conn) await writeRunRecord(conn, runId, r);
  }
  if (tool === 'all' || tool === 'promos') {
    const r = await extractPromos(page, conn);
    results.push(r);
    if (conn) await writeRunRecord(conn, runId, r);
  }
  if (tool === 'all' || tool === 'intel') {
    const r = await extractIntel(page, conn);
    results.push(r);
    if (conn) await writeRunRecord(conn, runId, r);
  }

  // ─── Determine overall success ───
  const failedModules = results.filter(r => r.status === 'failure');
  const overallSuccess = failedModules.length === 0;

  // ─── Summary ───
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║           EXTRACTION SUMMARY             ║');
  console.log('╠══════════════════════════════════════════╣');
  for (const r of results) {
    const statusIcon = r.status === 'success' ? '✓' : '✗';
    console.log('║  ' + statusIcon + ' ' + r.module.padEnd(12) + String(r.rowsWritten + ' written').padStart(12) + (' (' + r.durationMs + 'ms)').padStart(14) + ' ║');
    if (r.error) {
      console.log('║    └─ ' + r.error.substring(0, 34).padEnd(34) + ' ║');
    }
  }
  console.log('║                                          ║');
  console.log('║  Overall: ' + (overallSuccess ? 'SUCCESS' : 'FAILURE').padEnd(30) + ' ║');
  console.log('║  Completed in ' + (elapsed + 's').padEnd(27) + '║');
  console.log('╚══════════════════════════════════════════╝\n');

  if (conn) await conn.end().catch(() => undefined);
  await browser.close();

  // ─── Structured output for orchestrator ───
  const output: ScoutOutput = {
    runId, tool, startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    modules: results,
    overallSuccess,
  };
  console.log('\n__SCOUT_OUTPUT_START__');
  console.log(JSON.stringify(output));
  console.log('__SCOUT_OUTPUT_END__');

  console.log('[Scout] Done.');
  // ─── FIX: Deterministic exit code ───
  process.exit(overallSuccess ? 0 : 1);
}

main().catch(err => {
  console.error('[Scout] Fatal error:', err);
  process.exit(1);
});

// ─── Exports for testing ───
export {
  isAU,
  generateRunId,
  sportsUrl,
  middleUrl,
  type ModuleResult,
  type ScoutOutput,
  type ModuleName,
};
