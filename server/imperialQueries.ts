import mysql from "mysql2/promise";

function getDbUrl(): string | null {
  return process.env.DATABASE_URL || null;
}

async function withConn<T>(fn: (conn: mysql.Connection) => Promise<T>): Promise<T | null> {
  const dbUrl = getDbUrl();
  if (!dbUrl) return null;
  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection(dbUrl);
    return await fn(conn);
  } catch (err) {
    console.error("[ImperialQueries] DB error:", err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    if (conn) await conn.end().catch(() => undefined);
  }
}

export type BookmakerIntelRow = {
  id: number;
  bookmaker_name: string;
  website: string | null;
  platform: string | null;
  tier: string | null;
  importance: string | null;
  signup_bonus: string | null;
  promo_offering: string | null;
  promo_ban_risk: string | null;
  optin_racing: string | null;
  optin_sports: string | null;
  same_race_multi: string | null;
  same_game_multi: string | null;
  odds_boost: string | null;
  more_places: string | null;
  about: string | null;
  signup_offers: string | null;
  sustainability: string | null;
  last_updated: string | null;
  extracted_at: string | null;
};

export type PromotionRow = {
  id: number;
  promo_type: string | null;
  track: string | null;
  races: string | null;
  promotion: string | null;
  bookmaker: string | null;
  account_specific: number | null;
  extracted_at: string | null;
};

export type SportsMaxRow = {
  id: number;
  event_date: string | null;
  event_name: string | null;
  sport: string | null;
  league: string | null;
  market: string | null;
  bet1_name: string | null;
  bet1_bookmaker: string | null;
  bet1_odds: number | null;
  bet2_name: string | null;
  bet2_bookmaker: string | null;
  bet2_odds: number | null;
  roi: number | null;
  conversion: number | null;
  updated_ago: string | null;
  extracted_at: string | null;
};

export type MiddleMaxRow = {
  id: number;
  event_date: string | null;
  event_name: string | null;
  sport: string | null;
  league: string | null;
  market: string | null;
  bet1_name: string | null;
  bet1_bookmaker: string | null;
  bet1_odds: number | null;
  bet2_name: string | null;
  bet2_bookmaker: string | null;
  bet2_odds: number | null;
  risk_pct: number | null;
  updated_ago: string | null;
  extracted_at: string | null;
};

/**
 * Derive a clean display name from a bookmaker website domain.
 * The scraper sometimes writes "PlatformCorporateTier 1" into bookmaker_name
 * due to DOM parsing issues. The website field reliably has the domain.
 */
function cleanBookmakerName(raw: string, website: string | null): string {
  // If name looks like a real bookmaker (short, no generic words), use it
  const bad = /platform|corporate|related|tier\s*\d/i;
  if (!bad.test(raw) && raw.length <= 30 && raw.length >= 2) return raw;

  // Fall back to domain-derived name
  if (website) {
    const domain = website
      .replace(/^(https?:\/\/)?(www\.|m\.)?/, "")
      .replace(/\.(com\.au|net\.au|au|com).*$/, "");
    if (domain.length >= 2) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  }

  return raw;
}

export async function getBookmakerIntelligence(): Promise<BookmakerIntelRow[]> {
  const result = await withConn(async (conn) => {
    const [rows] = await conn.query(
      `SELECT * FROM bookmaker_intelligence ORDER BY tier ASC, bookmaker_name ASC LIMIT 100`
    );
    const raw = rows as BookmakerIntelRow[];
    // Clean up the parsed bookmaker names
    return raw.map(r => ({
      ...r,
      bookmaker_name: cleanBookmakerName(r.bookmaker_name, r.website),
    }));
  });
  return result ?? [];
}

export async function getPromotions(limit = 200): Promise<PromotionRow[]> {
  const result = await withConn(async (conn) => {
    const [rows] = await conn.query(
      `SELECT * FROM promotions ORDER BY extracted_at DESC LIMIT ?`,
      [limit]
    );
    return rows as PromotionRow[];
  });
  return result ?? [];
}

export async function getSportsMaximiser(limit = 100): Promise<SportsMaxRow[]> {
  const result = await withConn(async (conn) => {
    const [rows] = await conn.query(
      `SELECT * FROM sports_maximiser ORDER BY roi DESC LIMIT ?`,
      [limit]
    );
    return rows as SportsMaxRow[];
  });
  return result ?? [];
}

export async function getMiddleMaximiser(limit = 100): Promise<MiddleMaxRow[]> {
  const result = await withConn(async (conn) => {
    const [rows] = await conn.query(
      `SELECT * FROM middle_maximiser ORDER BY risk_pct ASC LIMIT ?`,
      [limit]
    );
    return rows as MiddleMaxRow[];
  });
  return result ?? [];
}
