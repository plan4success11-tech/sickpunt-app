import { eq, and, desc, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2";
import mysqlPromise from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import {
  InsertUser,
  users,
  opportunities,
  InsertOpportunity,
  bets,
  InsertBet,
  bookmakerAccounts,
  InsertBookmakerAccount,
  notifications,
  InsertNotification,
  chatMessages,
  InsertChatMessage,
  alertPreferences,
  InsertAlertPreference
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: ReturnType<typeof mysql.createPool> | null = null;
let _migrated = false;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createPool() {
  const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    maxIdle: 5,
    idleTimeout: 30000,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    ssl: { rejectUnauthorized: false },
  });
  // Auto-reconnect on connection loss
  pool.on("connection", (conn) => {
    conn.on("error", (err) => {
      if (err.code === "PROTOCOL_CONNECTION_LOST") {
        console.warn("[Database] Connection lost, pool will reconnect automatically");
      }
    });
  });
  return pool;
}

export function resetDb() {
  if (_pool) {
    try { _pool.end(() => {}); } catch {}
  }
  _pool = null;
  _db = null;
  _migrated = false;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = createPool();
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  if (_db && !_migrated) {
    _migrated = true;
    try {
      const migrationsFolder = path.resolve(__dirname, "../drizzle");
      await migrate(_db, { migrationsFolder });
      console.log("[Database] Migrations applied successfully");
    } catch (error) {
      console.warn("[Database] Migration failed (non-fatal):", error);
    }
  }
  return _db;
}

// ==================== USER QUERIES ====================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  if (!process.env.DATABASE_URL) { console.warn("[Database] No DATABASE_URL"); return; }

  const role = user.role ?? (user.openId === ENV.ownerOpenId ? 'admin' : 'user');
  const now = new Date();
  const name = user.name ?? null;
  const email = user.email ?? null;
  const loginMethod = user.loginMethod ?? null;
  const lastSignedIn = user.lastSignedIn ?? now;

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Database] upsertUser attempt ${attempt}:`, user.openId);
    const conn = await mysqlPromise.createConnection({ uri: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
      await conn.execute(
        `INSERT INTO users (openId, name, email, loginMethod, role, lastSignedIn)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=?, email=?, loginMethod=?, role=?, lastSignedIn=?`,
        [user.openId, name, email, loginMethod, role, lastSignedIn,
         name, email, loginMethod, role, lastSignedIn]
      );
      console.log("[Database] upsertUser success:", user.openId);
      return;
    } catch (error: any) {
      await conn.end().catch(() => {});
      const isConnError =
        error.message?.includes('Connection lost') ||
        error.message?.includes('ECONNRESET') ||
        error.message?.includes('PROTOCOL_CONNECTION_LOST') ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'PROTOCOL_CONNECTION_LOST';
      if (isConnError && attempt < MAX_RETRIES) {
        console.warn(`[Database] upsertUser connection error attempt ${attempt}, retrying in ${attempt * 1000}ms...`);
        await new Promise(r => setTimeout(r, attempt * 1000));
        continue;
      }
      throw error;
    } finally {
      await conn.end().catch(() => {});
    }
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ==================== OPPORTUNITY QUERIES ====================

export async function clearOpportunities() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(opportunities);
}

export async function createOpportunity(opportunity: InsertOpportunity) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(opportunities).values(opportunity);
  return result;
}

export async function getActiveOpportunities() {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.isActive, true))
    .orderBy(desc(opportunities.discoveredAt));
  
  return result;
}

export async function getOpportunitiesByType(type: "arbitrage" | "middle" | "matched") {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(opportunities)
    .where(and(
      eq(opportunities.type, type),
      eq(opportunities.isActive, true)
    ))
    .orderBy(desc(opportunities.roi));
  
  return result;
}

export async function getOpportunityById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, id))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

export async function deactivateOpportunity(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(opportunities)
    .set({ isActive: false })
    .where(eq(opportunities.id, id));
}

// ==================== BET QUERIES ====================

export async function createBet(bet: InsertBet) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(bets).values(bet);
  return result;
}

export async function getUserBets(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(bets)
    .where(eq(bets.userId, userId))
    .orderBy(desc(bets.placedAt));
  
  return result;
}

export async function getPendingBets(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(bets)
    .where(and(
      eq(bets.userId, userId),
      eq(bets.status, "pending")
    ))
    .orderBy(desc(bets.placedAt));
  
  return result;
}

export async function updateBetStatus(
  userId: number,
  betId: number, 
  status: "pending" | "won" | "lost" | "void" | "cashed_out",
  result?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(bets)
    .set({ 
      status, 
      result,
      settledAt: new Date()
    })
    .where(and(
      eq(bets.id, betId),
      eq(bets.userId, userId)
    ));
}

// ==================== BOOKMAKER ACCOUNT QUERIES ====================

export async function createBookmakerAccount(account: InsertBookmakerAccount) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(bookmakerAccounts).values(account);
  return result;
}

export async function getUserBookmakerAccounts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(bookmakerAccounts)
    .where(eq(bookmakerAccounts.userId, userId))
    .orderBy(desc(bookmakerAccounts.healthScore));
  
  return result;
}

export async function updateBookmakerAccountHealth(
  userId: number,
  accountId: number,
  healthScore: number,
  detectionRisk: "low" | "medium" | "high"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(bookmakerAccounts)
    .set({ 
      healthScore,
      detectionRisk,
      updatedAt: new Date()
    })
    .where(and(
      eq(bookmakerAccounts.id, accountId),
      eq(bookmakerAccounts.userId, userId)
    ));
}

// ==================== NOTIFICATION QUERIES ====================

export async function createNotification(notification: InsertNotification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(notifications).values(notification);
  return result;
}

/**
 * Create a system notification for all admin users.
 * Returns number of inserted notifications.
 */
export async function createAdminSystemNotifications(
  title: string,
  message: string
): Promise<number> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot notify admins: database not available");
    return 0;
  }

  let targetUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"));

  // Fallback target when no admin role users exist yet.
  if (targetUsers.length === 0 && ENV.ownerOpenId) {
    const ownerUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.openId, ENV.ownerOpenId))
      .limit(1);
    targetUsers = ownerUsers;
  }

  if (targetUsers.length === 0) {
    return 0;
  }

  for (const target of targetUsers) {
    await db.insert(notifications).values({
      userId: target.id,
      type: "system",
      title,
      message,
      isRead: false,
    });
  }

  return targetUsers.length;
}

export async function getUserNotifications(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  
  return result;
}

export async function getUnreadNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, false)
    ))
    .orderBy(desc(notifications.createdAt));
  
  return result;
}

export async function markNotificationAsRead(userId: number, notificationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(notifications)
    .set({ 
      isRead: true,
      readAt: new Date()
    })
    .where(and(
      eq(notifications.id, notificationId),
      eq(notifications.userId, userId)
    ));
}

// ==================== CHAT MESSAGE QUERIES ====================

export async function createChatMessage(message: InsertChatMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(chatMessages).values(message);
  return result;
}

export async function getUserChatHistory(userId: number, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  
  return result.reverse(); // Return in chronological order
}

// ==================== ALERT PREFERENCE QUERIES ====================

export async function upsertAlertPreferences(preferences: InsertAlertPreference) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .insert(alertPreferences)
    .values(preferences)
    .onDuplicateKeyUpdate({
      set: {
        minRoi: preferences.minRoi,
        maxRisk: preferences.maxRisk,
        enabledSports: preferences.enabledSports,
        enabledBookmakers: preferences.enabledBookmakers,
        emailNotifications: preferences.emailNotifications,
        pushNotifications: preferences.pushNotifications,
        alertStartTime: preferences.alertStartTime,
        alertEndTime: preferences.alertEndTime,
        updatedAt: new Date()
      }
    });
}

export async function getUserAlertPreferences(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db
    .select()
    .from(alertPreferences)
    .where(eq(alertPreferences.userId, userId))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}
