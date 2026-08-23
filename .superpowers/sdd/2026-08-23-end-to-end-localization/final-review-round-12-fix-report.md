# Final dual-review round 12 fix report

**Starting commit:** `9a634ec6f0609212fd551182197cac3ce16b3eab`
**Scope:** The two verified round-12 recovery-copy and legacy-draft-token
findings only. User-facing documentation remains deferred until Luna and Terra
evaluate the resulting commit.

## Findings and implementation

### 1. Brief-version conflicts render fixed localized recovery copy

The Brief error boundary now exposes one exact predicate for a version conflict:
the value must be a `BriefRequestError` with the allowlisted
`brief_version_conflict` code and the exact operation context. The owned Brief
route uses it for `load`. The share sheet uses it independently for `finalize`,
`share`, and `revoke`.

Those four contexts now render the existing `briefSend.versionConflict`
catalog message in English and Spanish. Generic errors, response text that only
looks like a code, and a conflict carrying the wrong operation context retain
their fixed operation-specific fallback. The UI never displays arbitrary
server error text.

### 2. Public reads require a finalized Brief

The public share route now resolves a token and the literal `finalized` status
in the same parameterized query. A token stored on a legacy draft therefore
uses the exact same application path, 404 status, and `{ "error": "not_found" }`
body as an unknown or revoked token. The response does not disclose whether a
token exists on a draft.

The regression seeds a pre-fix draft `shareToken` directly. It verifies the
privacy-equivalent 404 response and then finalizes that same Brief, proving a
finalized legacy token remains readable. Existing mint/revoke and finalized
token coverage remains green. No migration rewrite or destructive token cleanup
was necessary because the read boundary enforces the invariant for existing
and future rows immediately.

## TDD evidence

- Web RED: the two localized load cases rendered the generic load message; all
  six finalize/mint/revoke cases rendered their generic mutation fallbacks.
- API RED: the seeded legacy draft token returned 200 instead of the required
  privacy-equivalent 404.
- Focused GREEN: **2 web files / 19 tests** and **1 API test** passed after the
  minimal implementation.
- Final focused coverage selection: **3 web files / 28 tests** and **1 API file
  / 10 tests** passed.

## Test and coverage matrix

- API: **52 files, 379 tests passed**.
- Web: **85 files, 438 tests passed**.
- Shared schemas: **8 files, 77 tests passed**.
- Shared i18n: **1 file, 14 tests passed**.
- Aggregate: **146 files, 908 tests passed**.

Fresh V8 coverage was written to temporary directories outside the repository:

- API public-share route: **100% statements, branches, functions, and lines**.
- Web changed recovery surfaces: **86.02% statements/lines, 79.16% branches,
  and 65.21% functions** across the owned Brief route, share sheet, and shared
  error parser. The exact error predicate measured 100% branch coverage; the
  remaining uncovered handlers are unrelated existing PDF, clipboard, close,
  generation, and success paths.

The web suite retained its established lazy-PDF `act(...)` notices. The API
suite retained its established development-email and monitored-error
diagnostics. The build retained its established Vite large-chunk advisory.
Docker retained its local legacy-builder deprecation advisory. None originates
from a failing round-12 path.

## Full verification gates

| Gate | Result |
| --- | --- |
| Full repository test matrix | Exit 0; 146 files, 908 tests passed. |
| Targeted V8 coverage | Exit 0; public route 100% in every category and changed web surfaces measured above. |
| `pnpm lint` | Exit 0; 365 files checked; no fixes applied. |
| `pnpm typecheck` | Exit 0; all four TypeScript projects passed. |
| `pnpm build` | Exit 0; API TypeScript and web Vite production builds completed. |
| `drizzle-kit check` | Exit 0; `Everything's fine`. |
| Frozen lockfile | Exit 0; all five workspace projects already up to date. |
| Deployment YAML parse | Exit 0; Ruby parsed `.github/workflows/deploy.yml`. |
| Production Docker image | Exit 0; the exact image built and served `/health`. |
| Diff whitespace | Exit 0; `git diff --check` produced no findings. |
| Secret/debug/generated residue | No credential literal, debug statement, unsafe HTML/eval sink, tracked coverage output, log, or temporary file. The temporary Docker tag and image layers were removed after smoke. |

## Security, privacy, and failure boundaries

- Public token path input reaches SQL only through Drizzle bound parameters;
  status is a literal allowlist value. The result remains a strict whitelist
  without owner ID, dog ID, or token.
- Draft, unknown, and revoked tokens all fail at the single read query and
  return the same fixed response. No status, artifact, locale, owner, or
  existence field is selected or conditionally returned for drafts.
- Browser error values come from the existing strict response parser. The UI
  additionally requires the real error class, one fixed code, and the expected
  context; generic and malformed failures remain distinguishable only as fixed
  operation fallbacks.
- Database absence is handled as the documented public 404. Network and
  mutation failures are not swallowed as success; they render fixed recovery
  and preserve mutation failure state.

## Files changed

API behavior and regression:

- `apps/api/src/routes/share.ts`
- `apps/api/src/routes/share.test.ts`

Web behavior and regressions:

- `apps/web/src/lib/brief-errors.ts`
- `apps/web/src/routes/brief.tsx`
- `apps/web/src/routes/brief.test.tsx`
- `apps/web/src/components/brief/share-sheet.tsx`
- `apps/web/src/components/brief/share-sheet.test.tsx`

Evidence:

- `.superpowers/sdd/2026-08-23-end-to-end-localization/final-review-round-12-fix-report.md`

## Concerns

No unresolved round-12 finding remains in the implemented scope. The public
read boundary deliberately retains legacy draft tokens in storage: they are
unreadable while draft and become readable if the owner later finalizes that
same artifact, matching the finalized-token contract without a migration-time
destructive cleanup.
