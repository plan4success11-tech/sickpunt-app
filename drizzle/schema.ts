import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Betting opportunities discovered by the system
 */
export const opportunities = mysqlTable("opportunities", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["arbitrage", "middle", "matched"]).notNull(),
  sport: varchar("sport", { length: 100 }).notNull(),
  event: text("event").notNull(),
  market: varchar("market", { length: 200 }).notNull(),
  
  // Bet details
  bookmaker1: varchar("bookmaker1", { length: 100 }).notNull(),
  odds1: varchar("odds1", { length: 20 }).notNull(),
  outcome1: text("outcome1").notNull(),
  
  bookmaker2: varchar("bookmaker2", { length: 100 }).notNull(),
  odds2: varchar("odds2", { length: 20 }).notNull(),
  outcome2: text("outcome2").notNull(),
  
  // Optional third bet for 3-way markets
  bookmaker3: varchar("bookmaker3", { length: 100 }),
  odds3: varchar("odds3", { length: 20 }),
  outcome3: text("outcome3"),
  
  // Calculations
  roi: varchar("roi", { length: 20 }).notNull(), // Return on Investment percentage
  riskPercentage: varchar("riskPercentage", { length: 20 }), // For middle betting
  recommendedStake: varchar("recommendedStake", { length: 20 }).notNull(),
  
  // Metadata
  eventStartTime: timestamp("eventStartTime"),
  discoveredAt: timestamp("discoveredAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  isActive: boolean("isActive").default(true).notNull(),
  
  // Additional info
  notes: text("notes"),
});

export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = typeof opportunities.$inferInsert;

/**
 * User's placed bets tracking
 */
export const bets = mysqlTable("bets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  opportunityId: int("opportunityId"),
  
  // Bet details
  bookmaker: varchar("bookmaker", { length: 100 }).notNull(),
  sport: varchar("sport", { length: 100 }).notNull(),
  event: text("event").notNull(),
  market: varchar("market", { length: 200 }).notNull(),
  outcome: text("outcome").notNull(),
  odds: varchar("odds", { length: 20 }).notNull(),
  stake: varchar("stake", { length: 20 }).notNull(),
  
  // Status and results
  status: mysqlEnum("status", ["pending", "won", "lost", "void", "cashed_out"]).default("pending").notNull(),
  result: varchar("result", { length: 20 }), // Profit or loss amount
  
  // Timestamps
  placedAt: timestamp("placedAt").defaultNow().notNull(),
  settledAt: timestamp("settledAt"),
  
  // Notes
  notes: text("notes"),
});

export type Bet = typeof bets.$inferSelect;
export type InsertBet = typeof bets.$inferInsert;

/**
 * User's bookmaker accounts tracking
 */
export const bookmakerAccounts = mysqlTable("bookmaker_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  bookmaker: varchar("bookmaker", { length: 100 }).notNull(),
  
  // Account status
  isActive: boolean("isActive").default(true).notNull(),
  isLimited: boolean("isLimited").default(false).notNull(),
  isBanned: boolean("isBanned").default(false).notNull(),
  
  // Health metrics
  healthScore: int("healthScore").default(100), // 0-100
  detectionRisk: mysqlEnum("detectionRisk", ["low", "medium", "high"]).default("low"),
  
  // Balance tracking
  currentBalance: varchar("currentBalance", { length: 20 }),
  totalDeposited: varchar("totalDeposited", { length: 20 }),
  totalWithdrawn: varchar("totalWithdrawn", { length: 20 }),
  
  // Metadata
  accountCreatedAt: timestamp("accountCreatedAt"),
  lastBetAt: timestamp("lastBetAt"),
  notes: text("notes"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BookmakerAccount = typeof bookmakerAccounts.$inferSelect;
export type InsertBookmakerAccount = typeof bookmakerAccounts.$inferInsert;

/**
 * User notification preferences and alerts
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Notification content
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", ["opportunity", "bet_settled", "account_alert", "system"]).notNull(),
  
  // Related entities
  opportunityId: int("opportunityId"),
  betId: int("betId"),
  
  // Status
  isRead: boolean("isRead").default(false).notNull(),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  readAt: timestamp("readAt"),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * AI chat conversation history
 */
export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Message content
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  
  // Context
  opportunityId: int("opportunityId"),
  betId: int("betId"),
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

/**
 * User alert preferences
 */
export const alertPreferences = mysqlTable("alert_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  
  // Alert thresholds
  minRoi: varchar("minRoi", { length: 20 }).default("5"), // Minimum ROI to alert
  maxRisk: varchar("maxRisk", { length: 20 }).default("15"), // Maximum risk percentage for middle bets
  
  // Sport preferences
  enabledSports: text("enabledSports"), // JSON array of enabled sports
  
  // Bookmaker preferences
  enabledBookmakers: text("enabledBookmakers"), // JSON array of enabled bookmakers
  
  // Notification channels
  emailNotifications: boolean("emailNotifications").default(true).notNull(),
  pushNotifications: boolean("pushNotifications").default(true).notNull(),
  
  // Timing
  alertStartTime: varchar("alertStartTime", { length: 10 }), // e.g., "09:00"
  alertEndTime: varchar("alertEndTime", { length: 10 }), // e.g., "22:00"
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AlertPreference = typeof alertPreferences.$inferSelect;
export type InsertAlertPreference = typeof alertPreferences.$inferInsert;

/**
 * Imperial ingestion run metadata for auditability and failure diagnostics.
 */
export const ingestionRuns = mysqlTable("ingestion_runs", {
  id: int("id").autoincrement().primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull(),
  module: varchar("module", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["success", "failure", "skipped"]).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
  rowsExtracted: int("rows_extracted").default(0).notNull(),
  rowsWritten: int("rows_written").default(0).notNull(),
  errorSummary: text("error_summary"),
  pageVerified: boolean("page_verified").default(false).notNull(),
});

export type IngestionRun = typeof ingestionRuns.$inferSelect;
export type InsertIngestionRun = typeof ingestionRuns.$inferInsert;
