# Trainer admin management — design

Date: 2026-05-22

## Problem

The public trainer directory (`GET /api/trainers`) reads from the `trainers`
table, but there is no way to populate that table. Admins need a way to create,
edit, and delete trainer records so the directory has real data.

## Scope

- Admin-gated trainer CRUD behind `requireAdmin` (`/api/admin/*`).
- Internal, English-only admin UI to list/add/edit/delete trainers.
- Public `GET /api/trainers` + `GET /api/trainers/:id` stay unchanged.
- No fabricated/seed data shipped.

## API

Shared Zod schema `packages/shared/src/trainer.ts` (exported from index):
`trainerInputSchema` mirroring the `trainers` table columns —
`name` (required), `city` (required), `state` (required); `methodologyTags`,
`certifications`, `specialties` as string arrays defaulting to `[]`;
`businessName`, `website`, `email`, `phone`, `notesInternal` nullable/optional.

New admin sub-app `apps/api/src/routes/admin-trainers.ts`
(`new Hono().use("*", requireAdmin)`), mounted in `app.ts` under
`/api/admin/trainers` to keep `adminApp` focused on metrics.

Endpoints:
- `POST   /api/admin/trainers`      → create, returns `{ trainer }` 201
- `PUT    /api/admin/trainers/:id`  → update, returns `{ trainer }` 200, 404 unknown id
- `DELETE /api/admin/trainers/:id`  → delete, returns `{ ok: true }` 200, 404 unknown id

Auth: 401 anon, 403 non-admin (via `requireAdmin`). Body validated with the
shared schema (`zValidator("json", ...)`) → 400 on bad input.

## Web

- `apps/web/src/routes/admin/trainers.tsx` — list + form (create/edit) + delete,
  behind `RequireAdmin`. Arrays entered as comma-separated text.
- Query/mutation hooks in `apps/web/src/routes/admin/use-trainers.ts` using the
  `hc<AppType>` client (`api.api.admin.trainers...`, `api.api.trainers.$get`).
- Route `/admin/trainers` added to `main.tsx` wrapped in `RequireAdmin`; linked
  from the admin dashboard.
- English-only copy (admin UI is not i18n'd).

## Tests (TDD, red→green)

- API (`admin-trainers.test.ts`): 401 anon, 403 non-admin, 201 admin create,
  200 update, 404 update/delete unknown id, 400 invalid body, public GET still
  lists the created trainer.
- Web (`trainers.test.tsx`): page renders the form; submitting calls the create
  mutation (mock `@/lib/api`).
