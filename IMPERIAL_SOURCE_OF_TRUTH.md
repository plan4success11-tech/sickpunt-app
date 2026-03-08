# Imperial Source Of Truth

## Scope
This app is primarily an Imperial Wealth-powered betting assistant. Imperial ingestion is mission-critical.

## Data Source Rules
1. Imperial ingest pipeline (primary)
- Collectors: `server/imperialWealthScout.ts`, `server/sportsMaxScout.ts`, `server/middleMaxScout.ts`
- Orchestrator: `server/runImperialIngestion.ts` (calls `server/imperialIngestion.ts`)
- Status API: `trpc.imperial.status`

2. Odds API scanner (secondary)
- Runtime scanning: `server/oddsApiService.ts` + `server/opportunityScanner.ts`
- Background scanner: `server/backgroundJobs.ts`

## Current Product Behavior
1. Dashboard opportunity views currently read from app tables (`opportunities`, `bets`, etc).
2. Imperial row counts/status are visible through Imperial status endpoint.
3. Manual Imperial runs are admin-triggered via `trpc.imperial.trigger`.

## Priority Order
1. Keep Imperial ingestion healthy and observable.
2. Keep user-facing API stable.
3. Keep dormant helpers untouched until post-launch cleanup.

