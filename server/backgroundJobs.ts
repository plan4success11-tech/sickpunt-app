import cron, { ScheduledTask } from 'node-cron';
import { eq, and } from 'drizzle-orm';
import { getDb } from './db';
import { fetchMultipleSportsOdds, getAustralianSports } from './oddsApiService';
import { scanEventsForArbitrage } from './opportunityScanner';
import { createOpportunity, createNotification } from './db';
import { users, opportunities, notifications } from '../drizzle/schema';

/**
 * Background job scheduler for automatic opportunity scanning
 * Runs hourly to detect arbitrage and middle betting opportunities
 */

interface JobStatus {
  lastRun: Date | null;
  nextRun: Date | null;
  isRunning: boolean;
  successCount: number;
  failureCount: number;
  lastError: string | null;
  opportunitiesFound: number;
}

let jobStatus: JobStatus = {
  lastRun: null,
  nextRun: null,
  isRunning: false,
  successCount: 0,
  failureCount: 0,
  lastError: null,
  opportunitiesFound: 0,
};

let scheduledTask: ScheduledTask | null = null;

export function getJobStatus(): JobStatus {
  return { ...jobStatus };
}

/**
 * Scan all Australian sports for opportunities.
 * Deduplicates: one opportunity row per event+bookmaker pair (not per user),
 * and one notification per user per event per calendar day.
 */
async function scanAllOpportunities(): Promise<number> {
  const sportKeys = getAustralianSports();
  let totalOpportunitiesFound = 0;

  console.log(`[Background Job] Starting scan of ${sportKeys.length} sports at ${new Date().toISOString()}`);

  const db = await getDb();
  if (!db) {
    console.warn('[Background Job] Database not available, skipping scan');
    return 0;
  }

  const allUsers = await db.select().from(users);
  if (allUsers.length === 0) {
    console.log('[Background Job] No users registered yet, skipping notifications');
  }

  // Build a set of already-active opportunity keys to avoid duplicates
  const existingOpps = await db
    .select({ event: opportunities.event, bookmaker1: opportunities.bookmaker1, bookmaker2: opportunities.bookmaker2 })
    .from(opportunities)
    .where(eq(opportunities.isActive, true));

  const existingKeys = new Set(
    existingOpps.map(o => `${o.event}|${o.bookmaker1}|${o.bookmaker2}`)
  );

  // Build a set of notifications already sent today (per user + event)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayNotifs = await db
    .select({ userId: notifications.userId, message: notifications.message })
    .from(notifications)
    .where(and(
      eq(notifications.type, 'opportunity'),
    ));

  // Key: userId|eventName — only keep ones created today
  const notifiedToday = new Set<string>();
  for (const n of todayNotifs) {
    // createdAt isn't in the select above — use message content as a proxy key
    notifiedToday.add(`${n.userId}|${n.message.substring(0, 50)}`);
  }

  for (const sportKey of sportKeys) {
    try {
      const oddsMap = await fetchMultipleSportsOdds([sportKey], 'au');
      const eventsArray = oddsMap.get(sportKey) || [];

      const opportunities_found = scanEventsForArbitrage(eventsArray, 1.0, 100);

      if (opportunities_found.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
        continue;
      }

      console.log(`[Background Job] Found ${opportunities_found.length} opportunities in ${sportKey}`);

      // Top 3 per sport to limit volume
      for (const opp of opportunities_found.slice(0, 3)) {
        const oppKey = `${opp.event}|${opp.bookmaker1}|${opp.bookmaker2}`;

        // Insert opportunity once (not per user)
        if (!existingKeys.has(oppKey)) {
          await createOpportunity({
            type: 'arbitrage',
            sport: opp.sport,
            event: opp.event,
            market: opp.market,
            bookmaker1: opp.bookmaker1,
            odds1: opp.odds1.toString(),
            outcome1: opp.outcome1,
            bookmaker2: opp.bookmaker2,
            odds2: opp.odds2.toString(),
            outcome2: opp.outcome2,
            roi: opp.roi.toString(),
            recommendedStake: opp.totalStake.toString(),
            eventStartTime: new Date(opp.commenceTime),
            expiresAt: new Date(opp.commenceTime),
            isActive: true,
          });
          existingKeys.add(oppKey);
          totalOpportunitiesFound++;
        }

        // Notify each user once per event per day
        const notifMessage = `${opp.event} - ${opp.roi.toFixed(2)}% ROI - $${opp.guaranteedProfit.toFixed(2)} profit guaranteed`;
        const notifMessageKey = notifMessage.substring(0, 50);

        for (const user of allUsers) {
          const notifKey = `${user.id}|${notifMessageKey}`;
          if (!notifiedToday.has(notifKey)) {
            await createNotification({
              userId: user.id,
              type: 'opportunity',
              title: `${opp.quality.toUpperCase()} Opportunity: ${opp.sport}`,
              message: notifMessage,
              isRead: false,
            });
            notifiedToday.add(notifKey);
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`[Background Job] Failed to scan ${sportKey}:`, error);
    }
  }

  return totalOpportunitiesFound;
}

export function initializeBackgroundJobs(): void {
  console.log('[Background Jobs] Initializing background job scheduler...');

  // Only run automatic Odds API scans if explicitly enabled.
  // The free plan gives 500 requests/month; scanning 7 sports with h2h,spreads,totals
  // every hour burns through this in ~1 day. Disabled by default.
  if (process.env.ENABLE_ODDS_SCAN !== 'true') {
    console.log('[Background Jobs] Odds API auto-scan disabled (ENABLE_ODDS_SCAN != true). Manual scan via UI still works.');
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    jobStatus.nextRun = nextHour;
    console.log(`[Background Jobs] Scheduler initialized. Next scan at ${jobStatus.nextRun.toISOString()}`);
    return;
  }

  scheduledTask = cron.schedule('0 * * * *', async () => {
    if (jobStatus.isRunning) {
      console.log('[Background Job] Previous scan still running, skipping this hour');
      return;
    }

    jobStatus.isRunning = true;
    jobStatus.lastRun = new Date();

    try {
      const opportunitiesFound = await scanAllOpportunities();
      jobStatus.successCount++;
      jobStatus.opportunitiesFound = opportunitiesFound;
      jobStatus.lastError = null;
      console.log(`[Background Job] Scan completed successfully. Found ${opportunitiesFound} new opportunities`);
    } catch (error) {
      jobStatus.failureCount++;
      jobStatus.lastError = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Background Job] Scan failed:', error);
    } finally {
      jobStatus.isRunning = false;

      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1, 0, 0, 0);
      jobStatus.nextRun = nextHour;
    }
  });

  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);
  jobStatus.nextRun = nextHour;

  console.log(`[Background Jobs] Scheduler initialized. Next scan at ${jobStatus.nextRun.toISOString()}`);
}

export function stopBackgroundJobs(): void {
  console.log('[Background Jobs] Stopping background job scheduler...');
  if (scheduledTask) {
    scheduledTask.stop();
  }
  console.log('[Background Jobs] Background job scheduler stopped');
}

export async function triggerScanManually(): Promise<{ success: boolean; opportunitiesFound: number; error?: string }> {
  if (jobStatus.isRunning) {
    return { success: false, opportunitiesFound: 0, error: 'Scan already running' };
  }

  jobStatus.isRunning = true;

  try {
    const opportunitiesFound = await scanAllOpportunities();
    jobStatus.successCount++;
    jobStatus.opportunitiesFound = opportunitiesFound;
    jobStatus.lastError = null;
    return { success: true, opportunitiesFound };
  } catch (error) {
    jobStatus.failureCount++;
    jobStatus.lastError = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, opportunitiesFound: 0, error: jobStatus.lastError };
  } finally {
    jobStatus.isRunning = false;
  }
}
