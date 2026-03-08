# Active vs Parked (Launch Scope)

## Active (Launch Critical)
1. Runtime API and auth:
- `server/_core/index.ts`
- `server/routers.ts`
- `server/_core/oauth.ts`
- `server/_core/sdk.ts`

2. Core betting logic:
- `server/bettingCalculations.ts`
- `server/opportunityScanner.ts`
- `server/oddsApiService.ts`
- `server/backgroundJobs.ts`

3. Imperial ingestion:
- `server/imperialIngestion.ts`
- `server/runImperialIngestion.ts`
- `server/imperialWealthScout.ts`
- `server/sportsMaxScout.ts`
- `server/middleMaxScout.ts`
- `server/sickPuntAnalyser.ts`

4. Frontend:
- `client/src/pages/Home.tsx`
- `client/src/pages/Dashboard.tsx`
- `client/src/components/BettingChatBox.tsx`

## Parked (Do Not Change In Phase 1)
1. `server/_core/dataApi.ts`
2. `server/_core/map.ts`
3. `server/_core/voiceTranscription.ts`
4. `server/storage.ts`

## Reason Parked
These files are currently inactive in runtime flow. Keep them until post-launch review to avoid scope creep.

