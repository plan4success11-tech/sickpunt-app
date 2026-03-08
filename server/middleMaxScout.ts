import { chromium } from 'playwright';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const IW_EMAIL = process.env.IW_EMAIL || '';
const IW_PASSWORD = process.env.IW_PASSWORD || '';
const DB_URL = process.env.DATABASE_URL || '';
const maxPages = parseInt(process.argv[2] || '3');
const HEADLESS = process.env.IW_HEADLESS !== 'false';

function requireCredentials() {
  if (!IW_EMAIL || !IW_PASSWORD) {
    throw new Error('Missing required credentials: set IW_EMAIL and IW_PASSWORD');
  }
}

async function main() {
  console.log('\n== MIDDLE MAXIMISER (' + maxPages + ' pages) ==\n');
  requireCredentials();
  const conn = DB_URL ? await mysql.createConnection(DB_URL) : null;
  if (conn) {
    await conn.execute(`CREATE TABLE IF NOT EXISTS middle_maximiser (
      id INT AUTO_INCREMENT PRIMARY KEY, event_date VARCHAR(100), event_name VARCHAR(255),
      sport VARCHAR(100), league VARCHAR(200), market VARCHAR(200),
      bet1_name VARCHAR(200), bet1_bookmaker VARCHAR(100), bet1_odds DECIMAL(10,2),
      bet2_name VARCHAR(200), bet2_bookmaker VARCHAR(100), bet2_odds DECIMAL(10,2),
      risk_pct DECIMAL(10,2), updated_ago VARCHAR(100),
      extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX idx_risk (risk_pct))`);
    await conn.execute('DELETE FROM middle_maximiser');
  }
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('https://imperialwealth.com/signin', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.fill('input[name="email"]', IW_EMAIL);
  await page.fill('input[name="password"]', IW_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL('**/app**', { timeout: 20000 });
  console.log('[Scout] Logged in.');

  let totalStored = 0;
  for (let p = 1; p <= maxPages; p++) {
    const url = 'https://imperialwealth.com/app/betting/middle-maximiser?perPage=100&refresh=true&page=' + p;
    console.log('--- Page ' + p + ' ---');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);

    const rows = await page.evaluate(() => {
      const trs = document.querySelectorAll('tbody.divide-y tr');
      const out: any[] = [];
      for (let i = 0; i < trs.length; i++) {
        const row = trs[i];
        if (row.querySelector('[class*="blur"]')) continue;
        const cells = row.querySelectorAll('td');
        if (cells.length < 8) continue;

        const date = cells[0]?.textContent?.trim().replace(/\s+/g, ' ') || '';
        if (date.length < 5) continue;

        const evParts = cells[1]?.textContent?.trim().split('\n').map(s => s.trim()).filter(Boolean) || [];
        const mktParts = cells[2]?.textContent?.trim().split('\n').map(s => s.trim()).filter(Boolean) || [];

        // Bets - two <p> tags
        const betPs = cells[3]?.querySelectorAll('p');
        const bet1 = betPs?.[0]?.textContent?.trim() || '';
        const bet2 = betPs?.[1]?.textContent?.trim() || '';

        // Bookmakers - look for img alt or data-original-title
        let bk1 = '', bk2 = '';
        const bkImgs = cells[4]?.querySelectorAll('img[alt]');
        if (bkImgs && bkImgs.length >= 1) bk1 = bkImgs[0].getAttribute('alt') || '';
        if (bkImgs && bkImgs.length >= 2) bk2 = bkImgs[1].getAttribute('alt') || '';
        const bkTooltips = cells[4]?.querySelectorAll('[data-original-title]');
        if (bkTooltips && bkTooltips.length >= 1 && !bk1) bk1 = bkTooltips[0].getAttribute('data-original-title') || '';
        if (bkTooltips && bkTooltips.length >= 2 && !bk2) bk2 = bkTooltips[1].getAttribute('data-original-title') || '';

        // Odds - leaf divs with $ values
        const allLeafs: number[] = [];
        cells[5]?.querySelectorAll('div').forEach(d => {
          const t = d.textContent?.trim() || '';
          if (t.startsWith('$') && d.children.length === 0) allLeafs.push(parseFloat(t.replace('$', '')) || 0);
        });
        const odds1 = allLeafs[0] || 0;
        const odds2 = allLeafs[1] || 0;

        const updated = cells[6]?.textContent?.trim().replace(/\s+/g, ' ') || '';
        const riskText = cells[7]?.textContent?.trim() || '';
        const risk = parseFloat(riskText.replace('%', '')) || 0;

        out.push({
          date, event: evParts[0]||'', sport: evParts[1]||'', league: evParts[2]||'',
          market: mktParts.join(' / '), bet1, bet2, bk1, bk2, odds1, odds2, risk, updated,
        });
      }
      return out;
    });

    if (conn) {
      for (const r of rows) {
        await conn.execute('INSERT INTO middle_maximiser (event_date,event_name,sport,league,market,bet1_name,bet1_bookmaker,bet1_odds,bet2_name,bet2_bookmaker,bet2_odds,risk_pct,updated_ago) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [r.date,r.event,r.sport,r.league,r.market,r.bet1,r.bk1,r.odds1,r.bet2,r.bk2,r.odds2,r.risk,r.updated]);
      }
      totalStored += rows.length;
    }
    console.log('  ' + rows.length + ' opportunities');
  }
  console.log('\nTotal stored: ' + totalStored);
  if (conn) { const [r] = await conn.execute('SELECT COUNT(*) as c FROM middle_maximiser') as any; console.log('DB rows: ' + r[0].c); await conn.end(); }
  await browser.close();
}
main().catch(console.error);
