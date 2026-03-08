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
  console.log('\n== SPORTS MAXIMISER (' + maxPages + ' pages) ==\n');
  requireCredentials();
  const conn = DB_URL ? await mysql.createConnection(DB_URL) : null;
  if (conn) {
    await conn.execute(`CREATE TABLE IF NOT EXISTS sports_maximiser (
      id INT AUTO_INCREMENT PRIMARY KEY, event_date VARCHAR(100),
      sport VARCHAR(100), league VARCHAR(200), event_name VARCHAR(255), market VARCHAR(200),
      bet1_name VARCHAR(200), bet1_odds DECIMAL(10,2), bet1_bookmaker VARCHAR(100),
      bet2_name VARCHAR(200), bet2_odds DECIMAL(10,2), bet2_bookmaker VARCHAR(100),
      roi DECIMAL(10,2), conversion DECIMAL(10,2), updated_ago VARCHAR(100),
      extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX idx_roi (roi))`);
    await conn.execute('DELETE FROM sports_maximiser');
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
    const url = 'https://imperialwealth.com/app/betting/sports-maximiser?report=b2b&type=advance&oddType=2-way&perPage=100&refresh=true&page=' + p;
    console.log('--- Page ' + p + ' ---');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);

    const rows = await page.evaluate(() => {
      const trs = document.querySelectorAll('tbody.divide-y tr');
      const out: any[] = [];
      for (let i = 0; i < trs.length; i++) {
        const row = trs[i];
        // Skip blurred premium rows
        if (row.querySelector('[class*="blur"]')) continue;
        const cells = row.querySelectorAll('td');
        if (cells.length < 8) continue;

        // Cell 0: Date
        const date = cells[0]?.textContent?.trim().replace(/\s+/g, ' ') || '';
        if (date.length < 5) continue;

        // Cell 1: Sport + League (two lines)
        const sportParts = cells[1]?.textContent?.trim().split('\n').map(s => s.trim()).filter(Boolean) || [];

        // Cell 2: Event name
        const event = cells[2]?.textContent?.trim().replace(/\s+/g, ' ') || '';

        // Cell 3: Market
        const market = cells[3]?.textContent?.trim().replace(/\s+/g, ' ') || '';

        // Cell 4: Bets - two <p> tags
        const betPs = cells[4]?.querySelectorAll('p');
        const bet1 = betPs?.[0]?.textContent?.trim() || '';
        const bet2 = betPs?.[1]?.textContent?.trim() || '';

        // Cell 5: Odds - each odd has img[alt] for bookmaker + div with price
        const oddsBlocks = cells[5]?.querySelectorAll('.flex.items-center.gap-1');
        let odds1 = 0, odds2 = 0, bk1 = '', bk2 = '';
        if (oddsBlocks && oddsBlocks.length >= 1) {
          const img1 = oddsBlocks[0].querySelector('img[alt]');
          const tooltip1 = oddsBlocks[0].querySelector('[data-original-title]');
          bk1 = tooltip1?.getAttribute('data-original-title') || img1?.getAttribute('alt') || '';
          const leafDivs1 = oddsBlocks[0].querySelectorAll('div');
          leafDivs1.forEach(d => {
            const t = d.textContent?.trim() || '';
            if (t.startsWith('$') && d.children.length === 0 && odds1 === 0) {
              odds1 = parseFloat(t.replace('$', '')) || 0;
            }
          });
        }
        if (oddsBlocks && oddsBlocks.length >= 2) {
          const img2 = oddsBlocks[1].querySelector('img[alt]');
          const tooltip2 = oddsBlocks[1].querySelector('[data-original-title]');
          bk2 = tooltip2?.getAttribute('data-original-title') || img2?.getAttribute('alt') || '';
          const leafDivs2 = oddsBlocks[1].querySelectorAll('div');
          leafDivs2.forEach(d => {
            const t = d.textContent?.trim() || '';
            if (t.startsWith('$') && d.children.length === 0 && odds2 === 0) {
              odds2 = parseFloat(t.replace('$', '')) || 0;
            }
          });
        }

        // Cell 6: ROI / Conversion
        const roiDivs = cells[6]?.querySelectorAll('.flex.flex-col > div');
        const roiText = roiDivs?.[0]?.textContent?.trim() || '';
        const convText = roiDivs?.[1]?.textContent?.trim() || '';
        const roi = parseFloat(roiText.replace('%', '')) || 0;
        const conv = parseFloat(convText.replace('%', '')) || 0;

        // Cell 7: Updated
        const updated = cells[7]?.textContent?.trim().replace(/\s+/g, ' ') || '';

        out.push({ date, sport: sportParts[0]||'', league: sportParts[1]||'', event, market, bet1, bet2, odds1, odds2, bk1, bk2, roi, conv, updated });
      }
      return out;
    });

    if (conn) {
      for (const r of rows) {
        await conn.execute('INSERT INTO sports_maximiser (event_date,sport,league,event_name,market,bet1_name,bet1_odds,bet1_bookmaker,bet2_name,bet2_odds,bet2_bookmaker,roi,conversion,updated_ago) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [r.date,r.sport,r.league,r.event,r.market,r.bet1,r.odds1,r.bk1,r.bet2,r.odds2,r.bk2,r.roi,r.conv,r.updated]);
      }
      totalStored += rows.length;
    }
    console.log('  ' + rows.length + ' opportunities (with bookmakers + odds)');
  }
  console.log('\nTotal stored: ' + totalStored);
  if (conn) { const [r] = await conn.execute('SELECT COUNT(*) as c FROM sports_maximiser') as any; console.log('DB rows: ' + r[0].c); await conn.end(); }
  await browser.close();
}
main().catch(console.error);
