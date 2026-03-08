# Copilot Instructions for Betting AI Assistant

This document provides guidance for AI coding agents to be productive in the Betting AI Assistant codebase. It outlines the architecture, workflows, conventions, and integration points specific to this project.

## Big Picture Architecture

The Betting AI Assistant is structured as a full-stack application with the following major components:

1. **Client (Frontend)**:
   - Located in `client/src/`.
   - Built with React and TypeScript.
   - Key files:
     - `App.tsx`: Main application entry point.
     - `components/`: Contains reusable UI components (e.g., `AIChatBox.tsx`, `DashboardLayout.tsx`).
     - `contexts/ThemeContext.tsx`: Manages theme-related state.
   - Styling is managed via `index.css`.

2. **Server (Backend)**:
   - Located in `server/`.
   - Built with Node.js and TypeScript.
   - Key files:
     - `routers.ts`: Defines API routes.
     - `db.ts`: Handles database connections.
     - `bettingKnowledgeBase.ts`: Core logic for betting insights.
     - `opportunityScanner.ts`: Scans for betting opportunities.
   - Tests are colocated with `.test.ts` files (e.g., `auth.logout.test.ts`).

3. **Shared Utilities**:
   - Located in `shared/`.
   - Contains reusable constants, types, and core utilities.

4. **Database**:
   - Migrations and schema definitions are in the `drizzle/` directory.
   - Uses Drizzle ORM for database interactions.

## Critical Developer Workflows

### Building the Project
- Use `pnpm` for package management.
- Install dependencies:
  ```bash
  pnpm install
  ```
- Build the project:
  ```bash
  pnpm build
  ```

### Running the Development Server
- Start the frontend and backend servers:
  ```bash
  pnpm dev
  ```

### Testing
- Run all tests:
  ```bash
  pnpm test
  ```
- Run specific test files (e.g., `auth.logout.test.ts`):
  ```bash
  pnpm test server/auth.logout.test.ts
  ```

### Debugging
- Debugging screenshots are available in the root directory (e.g., `debug-login-page.png`).
- Use these to understand the expected UI states.

## Project-Specific Conventions

1. **Component Structure**:
   - Components are organized in `client/src/components/`.
   - Follow the pattern of colocating styles and tests with components.

2. **API Communication**:
   - Use `trpc.ts` in `client/src/lib/` for API calls.
   - Backend routes are defined in `server/routers.ts`.

3. **Error Handling**:
   - Use `ErrorBoundary.tsx` for catching React errors.
   - Backend errors are managed in `server/_core/errors.ts`.

4. **State Management**:
   - Context API is used for global state (e.g., `ThemeContext.tsx`).

## Integration Points

- **External APIs**:
  - Odds API: Managed in `server/oddsApiService.ts`.
  - Voice transcription and image generation APIs are in `server/_core/`.

- **Database**:
  - Schema definitions: `drizzle/schema.ts`.
  - Migrations: `drizzle/migrations/`.

- **Job Scheduling**:
  - Background jobs are defined in `server/backgroundJobs.ts`.

## Examples

### Adding a New Component
1. Create the component in `client/src/components/`.
2. Add styles in `index.css` or a scoped CSS file.
3. Write tests in a `.test.tsx` file colocated with the component.

### Adding a New API Endpoint
1. Define the route in `server/routers.ts`.
2. Implement the logic in a new file or an existing service file.
3. Write tests in a `.test.ts` file.

---

This document is a starting point. Update it as the project evolves to ensure it remains accurate and helpful.
