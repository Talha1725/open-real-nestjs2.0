# OpenReal API

Multi-tenant white-label investment platform backend built with NestJS, Prisma, and PostgreSQL.

## Tech Stack

- **Runtime**: Node.js (ESM)
- **Framework**: NestJS 11
- **ORM**: Prisma 7 with PostgreSQL driver adapter
- **Database**: PostgreSQL 15
- **Cache**: Redis 7
- **Auth**: JWT (access + refresh tokens) via Passport
- **Docs**: Swagger/OpenAPI at `/api/docs`
- **Tests**: Vitest

## Prerequisites

- Node.js >= 20
- Docker & Docker Compose (for PostgreSQL and Redis)

## Getting Started

```bash
# 1. Clone and install
npm install

# 2. Start infrastructure
docker compose up -d

# 3. Copy environment file
cp .env.example .env

# 4. Setup database (generate client, run migrations, seed)
npm run db:setup

# 5. Start dev server
npm run start:dev
```

The API will be available at `http://localhost:3000/api/v1` and Swagger UI at `http://localhost:3000/api/docs`.

## Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Start with hot-reload |
| `npm run build` | Compile TypeScript |
| `npm run start:prod` | Run compiled output |
| `npm run lint` | Lint and auto-fix |
| `npm run test` | Run all tests |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests (requires running server) |
| `npm run check` | Lint + build + unit tests |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:migrate` | Create and apply migrations |
| `npm run prisma:seed` | Seed database with dev data |
| `npm run prisma:studio` | Open Prisma Studio GUI |
| `npm run db:setup` | Generate + migrate + seed (first-time setup) |
| `npm run db:reset` | Reset database (destructive) |
| `npm run dev:fresh` | Full reset + start dev server |

## Project Structure

```
src/
├── auth/                  # JWT authentication, login, register, refresh
├── users/                 # User profile, KYC status, bank details, MFA
├── tenants/               # Public tenant branding and feature endpoints
├── super-admin/           # Platform-level tenant management (SUPER_ADMIN only)
├── health/                # Health check endpoint
├── common/
│   ├── guards/            # JWT, Roles, FeatureFlag, Tenant guards
│   ├── middleware/         # Tenant context resolution (domain → tenantId)
│   ├── filters/           # Global HTTP exception filter
│   ├── decorators/        # @Roles, @Features, @CurrentUser
│   └── tenant-context/    # AsyncLocalStorage-based tenant scoping
├── prisma/                # PrismaService with automatic tenant filtering
├── redis/                 # RedisService wrapper
├── audit/                 # Audit logging service
├── kyc/                   # KYC verification
├── kyb/                   # KYB verification
├── listings/              # Public opportunity listings for investors
├── opportunities/         # Opportunity detail and documents
├── investment-requests/   # Investment request workflow
├── portfolio/             # Holdings, distributions, portfolio KPIs
├── investor-home/         # Personalised investor dashboard
├── issuer/                # Issuer portal (CRUD opportunities, submit for review)
├── tenant-admin/          # Admin console (users, KYC/KYB, opportunities, settings, audit)
├── documents/             # S3-backed document management
├── notifications/         # Email templates (tenant-branded)
├── content/               # CMS articles, market overview
└── support/               # FAQ + support tickets
prisma/
├── schema.prisma          # 16 models, 16 enums
├── seed.ts                # Dev seed data
└── migrations/            # PostgreSQL migrations
```

## Multi-Tenancy

Every request is scoped to a tenant via the `x-tenant-id` header (resolved by middleware from domain lookup). Prisma queries are automatically filtered by `tenantId` using a client extension backed by AsyncLocalStorage. Super admin endpoints bypass tenant scoping via `bypassTenantScoping()`.

### Row-Level Security (RLS) Status
*P0-001 status: policies deployed, enforcement deferred.*
Request-wide tenant isolation is handled at the application layer by PrismaService's client extension, which injects the `tenantId` into every tenant-scoped model query. Database-level RLS policies have been deployed as defense-in-depth (via the `20260512124700_add_rls_policies` migration), but strict `FORCE ROW LEVEL SECURITY` enforcement is currently deferred. Explicit transaction flows can manually set `app.current_tenant_id` before queries where extra defense-in-depth is required.

## Seed Data

The seed script creates one tenant ("OpenReal") with four users:

| Role | Email | Password |
|---|---|---|
| SUPER_ADMIN | admin@openreal.io | Admin123! |
| ADMIN | tenantadmin@openreal.io | TenantAdmin123! |
| VERIFIED (investor) | investor@openreal.io | Investor123! |
| ISSUER | issuer@openreal.io | Issuer123! |

## API Endpoints (90+)

All endpoints are prefixed with `/api/v1`. Full Swagger documentation at `/api/docs`.

### Public (no auth)
- `GET /health` — lightweight liveness check
- `GET /health/ready` — readiness check for database and Redis
- `GET /tenant/branding` — Tenant branding config
- `GET /tenant/features` — Tenant feature flags
- `GET /public/market-overview` — Aggregated platform KPIs and market navigation metadata
- `GET /public/market/portal` — Structured public market portal manifest
- `GET /public/market-overview/historical` — Historical RWA TVL chart data
- `GET /public/market/news` — Public market news feed
- `GET /public/market/asset-screener` — Public asset screener
- `GET /public/market/asset-classes` — Asset class overview and reusable blocks
- `GET /public/market/category/:section` — Generic category page alias
- `GET /public/market/stablecoins` — Stablecoins market page
- `GET /public/market/treasuries` — U.S. Treasuries market page
- `GET /public/market/non-us-government-debt` — Non-U.S. government debt page
- `GET /public/market/credit` — Credit market page
- `GET /public/market/commodities` — Commodities market page
- `GET /public/market/institutional-funds` — Institutional funds page
- `GET /public/market/stocks` — Stocks page
- `GET /public/market/real-estate` — Real estate page
- `GET /public/education` — Published education articles
- `GET /public/education/:slug` — Single article by slug
- `GET /public/legal/:slug` — Legal content (terms, privacy, etc.)
- `GET /support/faq` — FAQ articles

### Auth (8 endpoints)
- `POST /auth/register` — Register new user
- `POST /auth/login` — Login (returns access + refresh tokens)
- `POST /auth/google` — Sign in or sign up with Google ID token
- `POST /auth/refresh` — Refresh access token
- `POST /auth/verify-email` — Verify email address
- `POST /auth/forgot-password` — Request password reset
- `POST /auth/reset-password` — Reset password with token
- `POST /auth/logout` — Logout (invalidate refresh token)

### Users (8 endpoints, authenticated)
- `GET /users/me` — Get profile
- `PATCH /users/me` — Update profile
- `POST /users/me/change-password` — Change password
- `PATCH /users/me/mfa` — Toggle MFA
- `GET /users/me/kyc-status` — KYC verification status
- `GET /users/me/bank-details` — Bank details
- `PUT /users/me/bank-details` — Update bank details
- `GET /users/me/audit-logs` — Personal audit logs

### Investor (15 endpoints, REGISTERED+)
- `GET /investor/home` — Personalised dashboard (adapts to verification state)
- `GET /investor/listings` — Paginated opportunity listings with filters
- `GET /investor/opportunities/:id` — Full opportunity detail
- `GET /investor/opportunities/:id/documents` — Opportunity documents
- `GET /investor/opportunities/:id/similar` — Similar opportunities
- `GET /investor/opportunities/:id/request-config` — Investment config (min/max, currency)
- `POST /investor/investment-requests` — Create investment request
- `GET /investor/investment-requests` — List my requests
- `GET /investor/investment-requests/:id` — Request detail with payment instructions
- `GET /investor/portfolio` — Portfolio KPIs and holdings
- `GET /investor/portfolio/holdings` — Detailed holdings list
- `GET /investor/portfolio/distributions` — Distribution history
- `POST /support/tickets` — Create support ticket
- `GET /support/tickets` — List my tickets
- `GET /support/tickets/:id` — Ticket detail

### Issuer (12 endpoints, ISSUER role + feature flag)
- `GET /issuer/dashboard` — Org info + opportunity counts
- `GET /issuer/profile` — Issuer organisation profile
- `PATCH /issuer/profile` — Update organisation profile
- `GET /issuer/opportunities` — List own opportunities
- `POST /issuer/opportunities` — Create draft opportunity
- `GET /issuer/opportunities/:id` — Opportunity detail
- `PATCH /issuer/opportunities/:id` — Update draft/rejected opportunity
- `POST /issuer/opportunities/:id/documents` — Upload document
- `DELETE /issuer/opportunities/:id/documents/:docId` — Delete document
- `POST /issuer/opportunities/:id/hero-image` — Upload hero image
- `POST /issuer/opportunities/:id/submit` — Submit for admin review

### Tenant Admin (15 endpoints, ADMIN role)
- `GET /admin/dashboard` — Dashboard KPIs (pending KYC/KYB, opportunities, users)
- `GET /admin/reports` — Analytics breakdown (users, opportunities, requests)
- `GET /admin/users` — User list with pagination and filters
- `POST /admin/users` — Create user
- `GET /admin/kyc` — KYC verification queue
- `POST /admin/kyc/:id/approve` — Approve KYC
- `POST /admin/kyc/:id/reject` — Reject KYC
- `GET /admin/kyb` — KYB verification queue
- `POST /admin/kyb/:id/approve` — Approve KYB
- `POST /admin/kyb/:id/reject` — Reject KYB
- `GET /admin/opportunities` — Opportunity review queue
- `GET /admin/opportunities/:id` — Opportunity review detail
- `POST /admin/opportunities/:id/approve` — Approve opportunity (→ LIVE)
- `POST /admin/opportunities/:id/reject` — Reject opportunity with feedback
- `GET /admin/investment-requests` — All investment requests
- `GET /admin/audit-logs` — Audit event log with filters
- `POST /admin/audit-logs/export` — Export audit logs as CSV
- `GET /admin/settings` — Full tenant configuration
- `PATCH /admin/settings/branding` — Update branding (colors, fonts)
- `PATCH /admin/settings/legal` — Update legal text
- `PATCH /admin/settings/support` — Update support config
- `PATCH /admin/settings/integrations` — Update integration config
- `PATCH /admin/settings/workflows` — Update workflow rules

### Super Admin (11 endpoints, SUPER_ADMIN only)
- `GET /super-admin/dashboard` — Platform-wide KPIs
- `GET /super-admin/tenants` — List all tenants
- `POST /super-admin/tenants` — Create tenant with initial admin
- `GET /super-admin/tenants/:id` — Tenant detail with config and counts
- `PATCH /super-admin/tenants/:id` — Update tenant
- `PATCH /super-admin/tenants/:id/features` — Update feature flags
- `POST /super-admin/tenants/:id/suspend` — Suspend tenant
- `POST /super-admin/tenants/:id/reactivate` — Reactivate tenant
- `GET /super-admin/tenants/:id/admins` — List tenant admins
- `POST /super-admin/tenants/:id/admins` — Create tenant admin
- `POST /super-admin/tenants/:id/users` — Create any user for tenant
- `GET /super-admin/tenants/:id/analytics` — Per-tenant analytics

## Testing

```bash
# Unit tests (no external dependencies)
npm run test:unit

# Integration tests (requires running app + database + redis)
# 1. Start infrastructure and app
docker compose up -d
npm run db:setup          # first time only
npm run start:dev &       # start app in background

# 2. Run integration tests
npm run test:integration

# All tests
npm run test

# Quick verification (lint + build + unit tests)
npm run check
```

### Integration Test Suites

| Suite | Tests | Description |
|---|---|---|
| `public.integration.spec.ts` | 6 | Market overview, education, legal, FAQ |
| `investor-flow.integration.spec.ts` | 12 | Home, listings, opportunities, investment requests, portfolio, support |
| `admin-flow.integration.spec.ts` | 10 | Dashboard, users, KYC/KYB, opportunities, audit, settings, reports |
| `issuer-flow.integration.spec.ts` | 8 | Dashboard, profile, CRUD opportunities, submit, edit rejection |
| `super-admin-flow.integration.spec.ts` | 5 | Dashboard, tenants CRUD, feature flags |

## File Storage (S3)

The platform uses AWS S3 for file storage. All files are stored with tenant-prefixed paths:
`{tenantId}/{entityType}/{entityId}/{uuid}-{filename}`

Supported file types: PDF, PNG, JPG, JPEG
Max file size: Configurable per tenant via `workflows.maxFileUploadMB` (default 10MB)

Set `AWS_S3_BUCKET`, `AWS_S3_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` in your `.env`.

## Email Configuration

The platform uses Nodemailer with SMTP for transactional emails (verification, password reset, welcome, account creation).

For Postmark:
1. Set `SMTP_HOST=smtp.postmarkapp.com`
2. Set `SMTP_PORT=587` (TLS), or use `465` for SSL
3. Set `SMTP_USER` and `SMTP_PASS` to your Postmark Server API token
4. Set `SMTP_SECURE=false` for port `587`, or `true` for `465`
5. Set `SMTP_FROM_EMAIL` to a verified sender address (for example `noreply@openreal.io`)

Emails are tenant-branded — each tenant's name and accent color are used in the email template. If SMTP is not configured, emails will fail silently and the API will continue to work normally (tokens are still logged to console in development).

## Deployment

```bash
# Dev (just postgres + redis, run app locally)
docker compose up postgres redis -d
npm run start:dev

# Production (all services including app)
cp .env.production.example .env
# Edit .env with real JWT secrets
docker compose up -d --build

# After code changes
git pull
docker compose up -d --build

# View logs
docker compose logs -f app

# Restart app only
docker compose restart app
```

## License

UNLICENSED — Proprietary

# open-real-nestjs2.0
