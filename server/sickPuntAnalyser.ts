import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DB_URL = process.env.DATABASE_URL || '';
const N = (v: any) => Number(v) || 0;

async function main() {
  const mode = process.argv[2] || 'all';
  console.log('\n== SICK PUNT ANALYSER == Mode: ' + mode + '\n');
  const conn = await mysql.createConnection(DB_URL);

  const risk = new Map<string, string>();
  try {
    const [bks] = await conn.execute('SELECT bookmaker_name, promo_ban_risk, tier FROM bookmaker_intelligence') as any;
    for (const b of bks) risk.set(b.bookmaker_name.toLowerCase().trim(), b.promo_ban_risk || '?');
    console.log('Loaded ' + risk.size + ' bookmaker risk profiles.\n');
  } catch {}

  for (const t of ['odds_comparison','sports_maximiser','middle_maximiser','promotions','bookmaker_intelligence']) {
    try { const [r] = await conn.execute('SELECT COUNT(*) as c FROM ' + t) as any;
      console.log('  ' + t.padEnd(25) + r[0].c + ' rows'); } catch {}
  }

  // ═══ ARBITRAGE FROM ODDS ═══
  if (mode === 'all' || mode === 'arb') {
    console.log('\n== ARBITRAGE OPPORTUNITIES ==\n');
    const [events] = await conn.execute('SELECT event_name, sport, league, COUNT(DISTINCT bookmaker) as bc FROM odds_comparison GROUP BY event_name, sport, league HAVING bc >= 3') as any;
    let arbCount = 0;
    for (const ev of events) {
      const [ocs] = await conn.execute('SELECT DISTINCT outcome FROM odds_comparison WHERE event_name = ?', [ev.event_name]) as any;
      const bests: any[] = [];
      for (const oc of ocs) {
        const [b] = await conn.execute('SELECT outcome, bookmaker, MAX(price) as best_price FROM odds_comparison WHERE event_name = ? AND outcome = ? GROUP BY outcome, bookmaker ORDER BY best_price DESC LIMIT 1', [ev.event_name, oc.outcome]) as any;
        if (b.length) bests.push(b[0]);
      }
      if (bests.length < 2) continue;
      const totalImp = bests.reduce((s: number, b: any) => s + 1 / N(b.best_price), 0);
      const roi = ((1 / totalImp - 1) * 100);
      if (roi > -3) {
        const tag = roi > 0 ? '*** ARB ***' : 'Near-arb';
        if (roi > 0) arbCount++;
        console.log(tag + '  ' + ev.event_name + '  (' + ev.sport + ' | ' + ev.league + ')');
        for (const b of bests) {
          const stake = (100 * (1 / N(b.best_price)) / totalImp);
          const r1 = risk.get((b.bookmaker||'').toLowerCase().trim()) || '?';
          console.log('  ' + (b.outcome||'').padEnd(25) + (b.bookmaker||'').padEnd(15) + '$' + N(b.best_price).toFixed(2) + '  stake $' + stake.toFixed(2) + '  [ban risk: ' + r1 + ']');
        }
        console.log('  ROI: ' + roi.toFixed(2) + '%  |  Profit: $' + (100 / totalImp - 100).toFixed(2) + ' on $100\n');
      }
    }
    console.log('Found ' + arbCount + ' pure arbitrage opportunities.');
  }

  // ═══ SPORTS MAX TOP 20 ═══
  if (mode === 'all' || mode === 'sports') {
    console.log('\n== TOP SPORTS MAX OPPORTUNITIES ==\n');
    const [rows] = await conn.execute('SELECT * FROM sports_maximiser ORDER BY roi DESC LIMIT 20') as any;
    for (const r of rows) {
      const r1 = risk.get((r.bet1_bookmaker||'').toLowerCase().trim()) || '?';
      const r2 = risk.get((r.bet2_bookmaker||'').toLowerCase().trim()) || '?';
      console.log((r.event_name||'?') + (N(r.roi) > 0 ? '  POSITIVE' : ''));
      console.log('  ' + r.sport + ' | ' + r.league + ' | ' + r.event_date);
      console.log('  Market: ' + r.market);
      console.log('  ' + (r.bet1_name||'Bet 1').padEnd(25) + (r.bet1_bookmaker||'?').padEnd(15) + '$' + N(r.bet1_odds).toFixed(2) + '  [risk: ' + r1 + ']');
      console.log('  ' + (r.bet2_name||'Bet 2').padEnd(25) + (r.bet2_bookmaker||'?').padEnd(15) + '$' + N(r.bet2_odds).toFixed(2) + '  [risk: ' + r2 + ']');
      console.log('  ROI: ' + N(r.roi).toFixed(2) + '%  |  Conv: ' + N(r.conversion).toFixed(2) + '%\n');
    }
  }

  // ═══ MIDDLE MAX TOP 20 ═══
  if (mode === 'all' || mode === 'middle') {
    console.log('\n== TOP MIDDLE OPPORTUNITIES ==\n');
    const [rows] = await conn.execute('SELECT * FROM middle_maximiser ORDER BY risk_pct ASC LIMIT 20') as any;
    for (const r of rows) {
      const r1 = risk.get((r.bet1_bookmaker||'').toLowerCase().trim()) || '?';
      const r2 = risk.get((r.bet2_bookmaker||'').toLowerCase().trim()) || '?';
      const o1 = N(r.bet1_odds); const o2 = N(r.bet2_odds);
      console.log(r.event_name);
      console.log('  ' + r.sport + ' | ' + r.league + ' | ' + r.event_date);
      console.log('  Market: ' + r.market);
      console.log('  ' + (r.bet1_name||'Bet 1').padEnd(25) + (r.bet1_bookmaker||'?').padEnd(15) + '$' + o1.toFixed(2) + '  [risk: ' + r1 + ']');
      console.log('  ' + (r.bet2_name||'Bet 2').padEnd(25) + (r.bet2_bookmaker||'?').padEnd(15) + '$' + o2.toFixed(2) + '  [risk: ' + r2 + ']');
      console.log('  Risk: ' + N(r.risk_pct).toFixed(2) + '%');
      if (o1 > 0 && o2 > 0) {
        const s2 = (100 * o1) / o2;
        const worst = Math.min(100 * o1 - 100 - s2, s2 * o2 - 100 - s2);
        console.log('  $100 play: hedge $' + s2.toFixed(2) + ' | worst case $' + worst.toFixed(2));
      }
      console.log('');
    }
  }

  // ═══ PROMOS SUMMARY ═══
  if (mode === 'all' || mode === 'promos') {
    console.log('\n== ACTIVE PROMOTIONS ==\n');
    const [byBk] = await conn.execute('SELECT bookmaker, COUNT(*) as c, promo_type FROM promotions GROUP BY bookmaker, promo_type ORDER BY c DESC LIMIT 15') as any;
    for (const b of byBk) console.log('  ' + (b.bookmaker||'?').padEnd(20) + b.c + ' promos (' + b.promo_type + ')');
    const [byTrack] = await conn.execute('SELECT track, COUNT(*) as c FROM promotions WHERE promo_type = \'racing\' GROUP BY track ORDER BY c DESC LIMIT 10') as any;
    console.log('\nTop tracks:');
    for (const t of byTrack) console.log('  ' + (t.track||'?').padEnd(25) + t.c + ' promos');
  }

  await conn.end();
  console.log('\n[Analyser] Done.');
}
main().catch(console.error);
