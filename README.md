# v0-guard-ops

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_zAa0Mh3HJwqQrp8QOoGvJ7wIuBJ4)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Airtable Employee API

Managers can pull all employee records from Airtable through:

```txt
GET /api/airtable/employees
```

Set these environment variables locally and in Vercel:

```txt
SUPABASE_SERVICE_ROLE_KEY=...
AIRTABLE_API_KEY=pat...
AIRTABLE_BASE_ID=app...
AIRTABLE_EMPLOYEES_TABLE_ID=tbl...
AIRTABLE_EMPLOYEES_TABLE=Employees
```

Optional variables:

```txt
AIRTABLE_EMPLOYEES_VIEW=Active Employees
AIRTABLE_EMPLOYEES_FIELDS=Employee Code,Full Name,Role,Emp Termination,Emp Email ID,Local Mobile
```

Prefer `AIRTABLE_EMPLOYEES_TABLE_ID` when possible because Airtable table IDs are stable. If it is not set, the API falls back to `AIRTABLE_EMPLOYEES_TABLE`, which must match the table name exactly. The Airtable token must be a Personal Access Token with `data.records:read` and access to the configured base.

The API paginates through Airtable until every employee record is returned. It keeps the raw Airtable `fields` object and also normalizes common fields like `employeeCode`, `fullName`, `role`, `status`, `email`, and `phone`. Email is pulled from `Emp Email ID`, phone is pulled from `Local Mobile`, and active status comes from Airtable's `Emp Termination` checkbox: unchecked means active, checked means terminated/not active.

Managers can sync reviewed Airtable employees into the `users` table from the Airtable Employees page. The sync route is:

```txt
POST /api/airtable/employees/sync
```

The sync uses `SUPABASE_SERVICE_ROLE_KEY` on the server, updates existing users by `external_employee_code`, inserts missing users, and skips Airtable records with no employee code, no full name, or an unmapped role. The sync writes `full_name`, `external_employee_code`, `external_role`, `is_active`, `last_synced_at`, and `updated_at`. It also writes `email` and `phone`; if either column is missing, it continues the sync and returns a warning. Because `phone` is non-nullable in `users`, employees without `Local Mobile` are synced with an empty phone string.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.

<a href="https://v0.app/chat/api/kiro/clone/VinodAlexRaj/v0-guard-ops" alt="Open in Kiro"><img src="https://pdgvvgmkdvyeydso.public.blob.vercel-storage.com/open%20in%20kiro.svg?sanitize=true" /></a>
