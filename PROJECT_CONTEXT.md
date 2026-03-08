# PROJECT CONTEXT – Betting AI Assistant

## 1. Project Origin

This project was generated using Manus.im and Claude AI.

It was not hand-architected by an experienced engineer.
It may contain incomplete, placeholder, or fragile implementations.

The goal now is to properly audit, stabilize, and finish it safely.

---

## 2. Developer Experience Level

The current developer (me) is new to software engineering.

I require:
- Clear explanations
- Architectural reasoning before code changes
- No silent refactors
- No overwriting working files without showing diffs

Assume beginner-level understanding.

---

## 3. High-Level Purpose of the Application

This application is intended to be a betting intelligence assistant that:

- Scans odds data
- Identifies arbitrage opportunities
- Identifies middle betting opportunities
- Stores detected opportunities
- Manages bookmaker accounts
- Tracks placed bets
- Runs background scanning jobs
- Scrapes Imperial Wealth platform data

It is NOT confirmed production-ready.

---

## 4. Current Known Systems

Backend:
- Node.js
- TypeScript
- tRPC API
- Drizzle ORM (MySQL)
- node-cron background jobs
- Playwright scraping

Frontend:
- React
- TypeScript
- Radix UI components

Database:
- MySQL
- Tables: users, bets, opportunities, bookmaker_accounts, alert_preferences

---

## 5. Current Risks

Because this was AI-generated, the following risks must be assumed:

- Incomplete business logic
- Mock or fake AI logic
- Security gaps
- Hardcoded credentials
- Fragile background jobs
- Inefficient database queries
- No proper error handling
- No production monitoring

---

## 6. Current Objective

The objective is NOT to add new features.

The objective is:

1. Audit the architecture.
2. Identify incomplete or unsafe components.
3. Stabilize the backend.
4. Verify calculations are mathematically correct.
5. Ensure environment variables are secure.
6. Prepare for safe local operation before deployment.

---

## 7. AI Assistant Rules

Before modifying code:

1. Explain what the system currently does.
2. Explain what is missing.
3. Explain why a change is needed.
4. Show diff-style changes if modifying files.
5. Prefer incremental improvements.
6. Highlight security concerns clearly.
7. Never assume production readiness.

Always prioritize stability over feature expansion.

---

## 8. Immediate Task

The first task is a full architectural audit and system risk assessment.

Do not write new features until the audit is complete.