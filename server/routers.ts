import { z } from "zod";
import { jwtVerify } from "jose";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { BETTING_KNOWLEDGE_BASE, SYSTEM_PROMPT } from "./bettingKnowledgeBase";
import {
  calculateArbitrage,
  calculateMiddleBetting,
  calculateDutching,
  calculateBackLay,
  analyzeOpportunityQuality,
  convertToDecimal
} from "./bettingCalculations";
import {
  createOpportunity,
  getActiveOpportunities,
  getOpportunitiesByType,
  getOpportunityById,
  createBet,
  getUserBets,
  getPendingBets,
  updateBetStatus,
  createBookmakerAccount,
  getUserBookmakerAccounts,
  updateBookmakerAccountHealth,
  createNotification,
  getUserNotifications,
  getUnreadNotifications,
  markNotificationAsRead,
  createChatMessage,
  getUserChatHistory,
  upsertAlertPreferences,
  getUserAlertPreferences
} from "./db";
import {
  fetchSports,
  fetchOdds,
  fetchMultipleSportsOdds,
  getAustralianSports
} from "./oddsApiService";
import {
  scanEventsForArbitrage,
  scanEventForMiddles,
  filterOpportunitiesByQuality,
  filterOpportunitiesByTime
} from "./opportunityScanner";
import {
  getJobStatus,
  triggerScanManually
} from "./backgroundJobs";
import {
  getImperialIngestionStatus,
  runImperialIngestion,
} from "./imperialIngestion";
import {
  getBookmakerIntelligence,
  getPromotions,
  getSportsMaximiser,
  getMiddleMaximiser,
} from "./imperialQueries";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(async (opts) => {
      // Fast path: SDK authenticated the user via DB lookup
      if (opts.ctx.user) return opts.ctx.user;

      // Fallback: verify JWT directly (handles DB-unavailable scenarios)
      try {
        const cookieHeader = opts.ctx.req.headers.cookie || "";
        const sessionPart = cookieHeader.split(";").map(s => s.trim()).find(p => p.startsWith(COOKIE_NAME + "="));
        if (!sessionPart) return null;
        const sessionValue = sessionPart.slice(COOKIE_NAME.length + 1);

        const rawSecret = process.env.JWT_SECRET || "sickpunt_jwt_fallback_x9k2mPqR7vLnW4sT8uY3zA6bE1cF5gH0jK";
        const secretKey = new TextEncoder().encode(rawSecret);
        const { payload } = await jwtVerify(sessionValue, secretKey, { algorithms: ["HS256"] });
        const openId = payload.openId as string;
        const name = payload.name as string | undefined;
        if (!openId) return null;

        // Try DB lookup — might work if DB is up
        const { getUserByOpenId, upsertUser } = await import("./db");
        let user = await getUserByOpenId(openId).catch(() => null);
        if (!user) {
          await upsertUser({ openId, name: name || null, lastSignedIn: new Date() }).catch(() => {});
          user = await getUserByOpenId(openId).catch(() => null);
        }
        if (user) return user;

        // DB unavailable — return minimal user from JWT so the session still works
        return { id: 0, openId, name: name || null, email: null, role: "user" as const, loginMethod: "google", lastSignedIn: new Date() };
      } catch {
        return null;
      }
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ==================== BETTING CALCULATIONS ====================
  calculator: router({
    arbitrage: protectedProcedure
      .input(z.object({
        odds1: z.number(),
        odds2: z.number(),
        totalStake: z.number().default(100)
      }))
      .mutation(async ({ input }) => {
        return calculateArbitrage(input.odds1, input.odds2, input.totalStake);
      }),

    middleBetting: protectedProcedure
      .input(z.object({
        odds1: z.number(),
        line1: z.number(),
        odds2: z.number(),
        line2: z.number(),
        totalStake: z.number().default(100)
      }))
      .mutation(async ({ input }) => {
        return calculateMiddleBetting(
          input.odds1,
          input.line1,
          input.odds2,
          input.line2,
          input.totalStake
        );
      }),

    dutching: protectedProcedure
      .input(z.object({
        odds: z.array(z.number()).min(2).max(3),
        totalStake: z.number().default(100)
      }))
      .mutation(async ({ input }) => {
        return calculateDutching(input.odds, input.totalStake);
      }),

    backLay: protectedProcedure
      .input(z.object({
        backOdds: z.number(),
        layOdds: z.number(),
        backStake: z.number(),
        commission: z.number().default(0)
      }))
      .mutation(async ({ input }) => {
        return calculateBackLay(
          input.backOdds,
          input.layOdds,
          input.backStake,
          input.commission
        );
      }),

    convertOdds: protectedProcedure
      .input(z.object({
        odds: z.union([z.string(), z.number()]),
        format: z.enum(['decimal', 'american', 'fractional']).default('decimal')
      }))
      .mutation(async ({ input }) => {
        const decimal = convertToDecimal(input.odds, input.format);
        const american = decimal >= 2 
          ? (decimal - 1) * 100 
          : -100 / (decimal - 1);
        const fractional = `${((decimal - 1) * 100).toFixed(0)}/100`;
        
        return {
          decimal: decimal.toFixed(2),
          american: american.toFixed(0),
          fractional
        };
      }),
  }),

  // ==================== OPPORTUNITIES ====================
  opportunities: router({
    list: protectedProcedure
      .input(z.object({
        type: z.enum(['arbitrage', 'middle', 'matched']).optional()
      }).optional())
      .query(async ({ input }) => {
        if (input?.type) {
          return await getOpportunitiesByType(input.type);
        }
        return await getActiveOpportunities();
      }),

    create: protectedProcedure
      .input(z.object({
        type: z.enum(['arbitrage', 'middle', 'matched']),
        sport: z.string(),
        event: z.string(),
        market: z.string(),
        bookmaker1: z.string(),
        odds1: z.string(),
        outcome1: z.string(),
        bookmaker2: z.string(),
        odds2: z.string(),
        outcome2: z.string(),
        bookmaker3: z.string().optional(),
        odds3: z.string().optional(),
        outcome3: z.string().optional(),
        roi: z.string(),
        riskPercentage: z.string().optional(),
        recommendedStake: z.string(),
        eventStartTime: z.date().optional(),
        notes: z.string().optional()
      }))
      .mutation(async ({ input }) => {
        return await createOpportunity(input);
      }),

    analyze: protectedProcedure
      .input(z.object({
        opportunityId: z.number()
      }))
      .query(async ({ input }) => {
        const opportunity = await getOpportunityById(input.opportunityId);
        if (!opportunity) {
          throw new Error("Opportunity not found");
        }

        const roi = parseFloat(opportunity.roi);
        const riskPercentage = opportunity.riskPercentage 
          ? parseFloat(opportunity.riskPercentage) 
          : null;
        
        const hoursToEvent = opportunity.eventStartTime
          ? (opportunity.eventStartTime.getTime() - Date.now()) / (1000 * 60 * 60)
          : 4;

        const analysis = analyzeOpportunityQuality(roi, riskPercentage, hoursToEvent);

        return {
          opportunity,
          analysis
        };
      }),
  }),

  // ==================== BETS ====================
  bets: router({
    create: protectedProcedure
      .input(z.object({
        opportunityId: z.number().optional(),
        bookmaker: z.string(),
        sport: z.string(),
        event: z.string(),
        market: z.string(),
        outcome: z.string(),
        odds: z.string(),
        stake: z.string(),
        notes: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        return await createBet({
          userId: ctx.user.id,
          ...input
        });
      }),

    list: protectedProcedure
      .query(async ({ ctx }) => {
        return await getUserBets(ctx.user.id);
      }),

    pending: protectedProcedure
      .query(async ({ ctx }) => {
        return await getPendingBets(ctx.user.id);
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        betId: z.number(),
        status: z.enum(['pending', 'won', 'lost', 'void', 'cashed_out']),
        result: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        return await updateBetStatus(ctx.user.id, input.betId, input.status, input.result);
      }),

    stats: protectedProcedure
      .query(async ({ ctx }) => {
        const allBets = await getUserBets(ctx.user.id);
        
        const totalBets = allBets.length;
        const wonBets = allBets.filter(b => b.status === 'won').length;
        const lostBets = allBets.filter(b => b.status === 'lost').length;
        const pendingBets = allBets.filter(b => b.status === 'pending').length;
        
        const totalStaked = allBets.reduce((sum, bet) => sum + parseFloat(bet.stake), 0);
        const totalProfit = allBets
          .filter(b => b.result)
          .reduce((sum, bet) => sum + parseFloat(bet.result!), 0);
        
        const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
        const winRate = (wonBets + lostBets) > 0 ? (wonBets / (wonBets + lostBets)) * 100 : 0;

        return {
          totalBets,
          wonBets,
          lostBets,
          pendingBets,
          totalStaked: totalStaked.toFixed(2),
          totalProfit: totalProfit.toFixed(2),
          roi: roi.toFixed(2),
          winRate: winRate.toFixed(2)
        };
      }),
  }),

  // ==================== BOOKMAKER ACCOUNTS ====================
  bookmakers: router({
    create: protectedProcedure
      .input(z.object({
        bookmaker: z.string(),
        currentBalance: z.string().optional(),
        accountCreatedAt: z.date().optional(),
        notes: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        return await createBookmakerAccount({
          userId: ctx.user.id,
          ...input
        });
      }),

    list: protectedProcedure
      .query(async ({ ctx }) => {
        return await getUserBookmakerAccounts(ctx.user.id);
      }),

    updateHealth: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        healthScore: z.number().min(0).max(100),
        detectionRisk: z.enum(['low', 'medium', 'high'])
      }))
      .mutation(async ({ input, ctx }) => {
        return await updateBookmakerAccountHealth(
          ctx.user.id,
          input.accountId,
          input.healthScore,
          input.detectionRisk
        );
      }),
  }),

  // ==================== NOTIFICATIONS ====================
  notifications: router({
    list: protectedProcedure
      .query(async ({ ctx }) => {
        return await getUserNotifications(ctx.user.id);
      }),

    unread: protectedProcedure
      .query(async ({ ctx }) => {
        return await getUnreadNotifications(ctx.user.id);
      }),

    markAsRead: protectedProcedure
      .input(z.object({
        notificationId: z.number()
      }))
      .mutation(async ({ input, ctx }) => {
        return await markNotificationAsRead(ctx.user.id, input.notificationId);
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string(),
        message: z.string(),
        type: z.enum(['opportunity', 'bet_settled', 'account_alert', 'system']),
        opportunityId: z.number().optional(),
        betId: z.number().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        return await createNotification({
          userId: ctx.user.id,
          ...input
        });
      }),
  }),

  // ==================== AI CHATBOT ====================
  chat: router({
    sendMessage: protectedProcedure
      .input(z.object({
        message: z.string(),
        opportunityId: z.number().optional(),
        betId: z.number().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        // Save user message
        await createChatMessage({
          userId: ctx.user.id,
          role: 'user',
          content: input.message,
          opportunityId: input.opportunityId,
          betId: input.betId
        });

        // Get recent chat history
        const history = await getUserChatHistory(ctx.user.id, 20);

        // Inject live data so AI can give specific advice
        const [liveOpps, livePromos, liveSportsMax, liveMiddles, userAccounts] = await Promise.all([
          getActiveOpportunities().catch(() => []),
          getPromotions(50).catch(() => []),
          getSportsMaximiser(20).catch(() => []),
          getMiddleMaximiser(20).catch(() => []),
          getUserBookmakerAccounts(ctx.user.id).catch(() => []),
        ]);

        const liveDataContext = [
          `== LIVE DATA (as of ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} AEDT) ==`,
          `User accounts: ${userAccounts.length > 0 ? userAccounts.map(a => `${a.bookmaker} (balance: $${a.currentBalance ?? 'unknown'})`).join(', ') : 'None registered yet'}`,
          `Arbitrage opportunities in DB: ${liveOpps.length}${liveOpps.length > 0 ? '\n' + liveOpps.slice(0, 5).map(o => `  - ${o.event} | ${o.bookmaker1} vs ${o.bookmaker2} | ${o.odds1}/${o.odds2} | ROI: ${o.roi}% | Stake: $${o.recommendedStake}`).join('\n') : ''}`,
          `Sports Maximiser (top opportunities): ${liveSportsMax.length > 0 ? '\n' + liveSportsMax.slice(0, 5).map(r => `  - ${r.event_name} | ${r.bet1_bookmaker}(${r.bet1_odds}) vs ${r.bet2_bookmaker}(${r.bet2_odds}) | ROI: ${r.roi}%`).join('\n') : 'No data yet'}`,
          `Middle Maximiser (top opportunities): ${liveMiddles.length > 0 ? '\n' + liveMiddles.slice(0, 5).map(r => `  - ${r.event_name} | ${r.bet1_bookmaker}(${r.bet1_odds}) vs ${r.bet2_bookmaker}(${r.bet2_odds}) | Risk: ${r.risk_pct}%`).join('\n') : 'No data yet'}`,
          `Active promotions: ${livePromos.length} total${livePromos.length > 0 ? '\n' + [...new Set(livePromos.map(p => p.bookmaker))].filter(Boolean).map(bk => { const bkPromos = livePromos.filter(p => p.bookmaker === bk); return `  ${bk}: ${bkPromos.length} promo(s)`; }).join('\n') : ''}`,
        ].join('\n');

        // Build context with knowledge base
        const messages = [
          { role: 'system' as const, content: SYSTEM_PROMPT },
          {
            role: 'system' as const,
            content:
              "Formatting rule: respond in plain text only. Do not use markdown syntax (no #, *, backticks, tables, or fenced code blocks). Keep responses clean, structured, and concise.",
          },
          { role: 'system' as const, content: `Knowledge Base:\n${BETTING_KNOWLEDGE_BASE}` },
          { role: 'system' as const, content: liveDataContext },
          ...history.map(msg => ({
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content
          }))
        ];

        // Get AI response
        console.log(`[Chat] Calling LLM for user ${ctx.user.id}, message: "${input.message.substring(0, 50)}..."`);
        let response;
        try {
          response = await invokeLLM({ messages });
        } catch (llmError) {
          console.error('[Chat] LLM call failed:', llmError);
          throw llmError;
        }
        console.log(`[Chat] LLM responded, finish_reason: ${response.choices[0]?.finish_reason}`);
        const rawContent = response.choices[0]?.message?.content;
        const assistantMessage = typeof rawContent === 'string'
          ? rawContent
          : "I apologize, but I couldn't generate a response. Please try again.";

        // Save assistant message
        await createChatMessage({
          userId: ctx.user.id,
          role: 'assistant',
          content: assistantMessage,
          opportunityId: input.opportunityId,
          betId: input.betId
        });

        return {
          message: assistantMessage
        };
      }),

    history: protectedProcedure
      .input(z.object({
        limit: z.number().default(50)
      }))
      .query(async ({ input, ctx }) => {
        return await getUserChatHistory(ctx.user.id, input.limit);
      }),
  }),

  // ==================== ALERT PREFERENCES ====================
  alertPreferences: router({
    get: protectedProcedure
      .query(async ({ ctx }) => {
        return await getUserAlertPreferences(ctx.user.id);
      }),

    update: protectedProcedure
      .input(z.object({
        minRoi: z.string().optional(),
        maxRisk: z.string().optional(),
        enabledSports: z.string().optional(),
        enabledBookmakers: z.string().optional(),
        emailNotifications: z.boolean().optional(),
        pushNotifications: z.boolean().optional(),
        alertStartTime: z.string().optional(),
        alertEndTime: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        return await upsertAlertPreferences({
          userId: ctx.user.id,
          ...input
        });
      }),
  }),

  // ==================== BACKGROUND JOBS ====================
  jobs: router({
    // Get current job status
    status: protectedProcedure
      .query(() => {
        return getJobStatus();
      }),

    // Manually trigger a scan (useful for testing)
    triggerScan: adminProcedure
      .mutation(async () => {
        return await triggerScanManually();
      }),
  }),

  imperial: router({
    status: protectedProcedure.query(async () => {
      return getImperialIngestionStatus();
    }),
    trigger: protectedProcedure
      .input(
        z.object({
          mode: z.enum(["all", "odds", "sports", "middle", "promos", "intel"]).default("all"),
          pages: z.number().min(1).max(20).default(3),
        })
      )
      .mutation(async ({ input }) => {
        return runImperialIngestion(input.mode, input.pages);
      }),
    bookmakerIntel: protectedProcedure.query(async () => {
      return getBookmakerIntelligence();
    }),
    promotions: protectedProcedure
      .input(z.object({ limit: z.number().default(200) }).optional())
      .query(async ({ input }) => {
        return getPromotions(input?.limit ?? 200);
      }),
    sportsMax: protectedProcedure
      .input(z.object({ limit: z.number().default(100) }).optional())
      .query(async ({ input }) => {
        return getSportsMaximiser(input?.limit ?? 100);
      }),
    middleMax: protectedProcedure
      .input(z.object({ limit: z.number().default(100) }).optional())
      .query(async ({ input }) => {
        return getMiddleMaximiser(input?.limit ?? 100);
      }),
  }),

  // ==================== LIVE ODDS & SCANNING ====================
  liveOdds: router({
    // Get list of available sports
    sports: protectedProcedure
      .query(async () => {
        const sports = await fetchSports();
        return sports.filter(s => s.active);
      }),

    // Get live odds for a specific sport
    fetch: protectedProcedure
      .input(z.object({
        sportKey: z.string(),
        regions: z.string().default("au"),
        markets: z.string().default("h2h,spreads,totals")
      }))
      .query(async ({ input }) => {
        return await fetchOdds(input.sportKey, input.regions, input.markets);
      }),

    // Get odds for multiple Australian sports at once
    fetchAustralianSports: protectedProcedure
      .query(async () => {
        const sportKeys = getAustralianSports();
        return await fetchMultipleSportsOdds(sportKeys, "au");
      }),

    // Scan for arbitrage opportunities
    scanArbitrage: protectedProcedure
      .input(z.object({
        sportKey: z.string(),
        minRoi: z.number().default(1.0),
        recommendedStake: z.number().default(100),
        minQuality: z.enum(["excellent", "good", "fair", "poor"]).default("fair"),
        minHours: z.number().default(1),
        maxHours: z.number().default(48)
      }))
      .mutation(async ({ input }) => {
        const { data } = await fetchOdds(input.sportKey, "au");
        let opportunities = scanEventsForArbitrage(data, input.minRoi, input.recommendedStake);
        
        // Apply filters
        opportunities = filterOpportunitiesByQuality(opportunities, input.minQuality);
        opportunities = filterOpportunitiesByTime(opportunities, input.minHours, input.maxHours);
        
        return opportunities;
      }),

    // Scan for middle betting opportunities
    scanMiddles: protectedProcedure
      .input(z.object({
        sportKey: z.string(),
        minGap: z.number().default(2.0),
        recommendedStake: z.number().default(100)
      }))
      .mutation(async ({ input }) => {
        const { data } = await fetchOdds(input.sportKey, "au", "totals");
        const allMiddles = [];
        
        for (const event of data) {
          const middles = scanEventForMiddles(event, input.minGap, input.recommendedStake);
          allMiddles.push(...middles);
        }
        
        return allMiddles.sort((a, b) => b.qualityScore - a.qualityScore);
      }),

    // Scan all Australian sports for opportunities
    scanAllSports: protectedProcedure
      .input(z.object({
        minRoi: z.number().default(1.0),
        recommendedStake: z.number().default(100),
        minQuality: z.enum(["excellent", "good", "fair", "poor"]).default("good")
      }))
      .mutation(async ({ input, ctx }) => {
        const sportKeys = getAustralianSports();
        const allOpportunities = [];
        
        for (const sportKey of sportKeys) {
          try {
            // Only request h2h to conserve API quota (free plan: 500 req/month)
            const { data } = await fetchOdds(sportKey, "au", "h2h");
            let opportunities = scanEventsForArbitrage(data, input.minRoi, input.recommendedStake);
            opportunities = filterOpportunitiesByQuality(opportunities, input.minQuality);
            allOpportunities.push(...opportunities);
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`Failed to scan ${sportKey}:`, error);
          }
        }
        
        // Sort by ROI and return top opportunities
        const sortedOpportunities = allOpportunities.sort((a, b) => b.roi - a.roi);
        
        // Auto-create opportunities in database for top finds
        for (const opp of sortedOpportunities.slice(0, 10)) {
          try {
            await createOpportunity({
              type: "arbitrage",
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
              isActive: true
            });
            
            // Create notification
            await createNotification({
              userId: ctx.user.id,
              type: "opportunity",
              title: `New ${opp.quality} arbitrage opportunity!`,
              message: `${opp.event} - ${opp.roi.toFixed(2)}% ROI - $${opp.guaranteedProfit.toFixed(2)} profit`,
              isRead: false
            });
          } catch (error) {
            console.error("Failed to create opportunity:", error);
          }
        }
        
        return sortedOpportunities;
      }),
  }),
});

export type AppRouter = typeof appRouter;
