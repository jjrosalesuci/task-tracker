# Focus Grid repository instructions

## Build, test, and lint

Run commands from the repository root. The project requires Node.js 22+ and uses npm workspaces for `client` and `server`.

- Install dependencies: `npm ci`
- Start both workspaces in development: `npm run dev`
- Build the server, then the client: `npm run build`
- Type-check both workspaces: `npm run typecheck`
- Lint: `npm run lint` (currently only the client defines a lint script)
- Run all tests: `npm test`
- Run one client test file: `npm test --workspace client -- src/lib/task-utils.test.ts`
- Run one server test file: `npm test --workspace server -- src/services/task-authorization.test.ts`
- Run one test by name: `npm test --workspace client -- src/lib/task-utils.test.ts -t "maps all Eisenhower quadrants"`
- Regenerate Prisma Client after schema changes: `npm run db:generate`
- Apply committed database migrations: `npm run db:migrate`

For the containerized development stack (application, PostgreSQL, and Mailpit), copy `.env.example` to `.env` and run `docker compose -f docker-compose.dev.yml up --build`. The Vite client is served on port 5173 and proxies `/api` to the Express API on port 3000.

## Architecture

This is a TypeScript monorepo with two npm workspaces:

- `client` is a React 19/Vite single-page application. `App.tsx` owns the task matrix UI and translates between UI models and API models. Authentication and localization state live in React contexts. Routing is intentionally lightweight and uses the History API through `hooks/useRoute.ts`, not a routing package.
- `server` is an Express 5 API backed by PostgreSQL through Prisma. `app.ts` composes security/origin middleware and routers; route handlers validate inputs with Zod, enforce authorization, and call Prisma directly. In production, the same Express process serves `client/dist` and falls back to `index.html` for non-API routes.
- `server/prisma/schema.prisma` is the persistence model. Users own tasks and may be assigned tasks; opaque session and password-reset tokens are stored only as hashes. Schema changes must include a migration under `server/prisma/migrations`.

Requests flow through the client `lib/api.ts` helper to `/api`, then through an Express router, Zod `validate` middleware, authorization helpers, and Prisma. Errors are normalized by `server/src/middleware/errors.ts` into `{ error: { code, message, details? } }`.

Production connects to the dedicated external PostgreSQL server through `DATABASE_URL`; do not add a PostgreSQL service, database network, or database volume to the production Compose file. Containerized PostgreSQL is limited to `docker-compose.dev.yml` for local development.

## Repository conventions

- Keep the client/API task mapping explicit. Client scopes `personal`/`professional` map to API matrices `PERSONAL`/`WORK`; client quadrant names map to the `urgent` and `important` booleans; client `completed` maps to API status `PENDING`/`COMPLETED`. Update `App.tsx` mapping functions, shared client types, Zod schemas, routes, and Prisma together when this contract changes.
- Preserve task authorization rules in `server/src/services/task-authorization.ts`: owners can edit, reorder, and delete; assignees can read and change only `status`; unrelated users receive `404` for reads so task existence is not disclosed. Reuse these helpers rather than duplicating checks in routes.
- Validate route bodies, queries, and params with schemas in `server/src/schemas` and the `validate` middleware. The middleware replaces the request target with parsed/transformed data, so handlers should consume the validated values.
- Express async handlers use `try/catch` and pass failures to `next`; expected failures use `HttpError`, while Prisma conflicts and Zod errors are handled centrally.
- Browser API calls go through `client/src/lib/api.ts`, which prefixes `/api`, sends JSON, includes session cookies, and throws `ApiError`. Keep server response envelopes consistent (`{ user }`, `{ task }`, or `{ tasks }`; successful deletes/reorders return `204`).
- User-visible client text belongs in both `es` and `en` entries in `client/src/i18n/translations.ts` and is accessed through `useI18n`; avoid hard-coded UI strings.
- Tests are colocated with source as `*.test.ts`. Client tests run in jsdom with `client/src/test/setup.ts`; server tests use the Node Vitest environment.
- Match the existing formatting split: client files use single quotes and no semicolons; server files use double quotes and semicolons.
