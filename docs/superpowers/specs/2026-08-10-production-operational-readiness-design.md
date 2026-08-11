# Production Operational Readiness Design

## Goal

Make TuringCare observable and recoverable enough for a 10–20 owner public
beta. Production failures should be visible without exposing owner content, new
regressions should create actionable GitHub Issues, and the database recovery
procedure should be proven with a real isolated restore.

## Scope

This project delivers:

- managed Sentry error monitoring for the API and web application;
- strict allowlist-based event sanitization;
- release, environment, route, HTTP status, and request-correlation metadata;
- a React application error boundary;
- GitHub Issue creation for actionable production alerts;
- a documented Supabase backup and restore runbook;
- one measured restore drill into a temporary isolated database.

This project does not add performance tracing, session replay, user feedback,
cohort analytics, automated restore verification, or new product features.

## Architecture

### Sentry projects

Use separate Sentry projects for the API and web application. Separate projects
keep alert ownership, SDK configuration, source maps, and issue volume
independent.

The API initializes Sentry before constructing the Hono application. The web
application initializes Sentry before rendering React. Both SDKs are disabled
unless their DSN is present and the environment is explicitly `production`.
Local development and automated tests do not send events by default.

Every event may contain only:

- application: `api` or `web`;
- environment: `production`;
- release: deployed Git commit SHA;
- normalized route template, not a raw URL;
- HTTP method and status;
- generated request/correlation ID;
- identifier-shaped exception type, a normalized exception value, and stack trace;
- stack-frame paths, module names, and build/debug identifiers required for
  symbolication;
- the exception mechanism's handled/unhandled classification.

The exception value is never the raw error message, which is free-form and can
embed owner content. It is replaced with a fixed classification derived only
from the exception type, such as `Unexpected TypeError` or, when the type is not
a recognizable code identifier, `Unexpected application error`. Grouping still
works because Sentry groups on exception type and stack trace.

The API returns the request ID in an `X-Request-ID` response header. The web API
client retains that ID when surfacing a failed request, allowing a browser error
and API error to be correlated without attaching owner data.

### API capture boundary

Add request-ID middleware before application routes. Use a Hono-level error
boundary to capture unhandled exceptions and unexpected 5xx responses, then
preserve the repository's existing HTTP response behavior. Expected validation,
authentication, authorization, not-found, rate-limit, and other 4xx responses
are not Sentry errors, including those raised as framework `HTTPException`
values: their status, body, and headers are returned unchanged.

The error boundary is a small reusable handler installed on the existing
application instance. The application is not restructured into a factory and no
synthetic failure route is added to it, so the exported `AppType` used by the
typed web client is unchanged.

A failure while the API is starting — environment validation, database pool
construction, or port binding — is captured, flushed, and followed by a non-zero
process exit so a crash-looping deploy is visible rather than silent.

After startup the SDK's Node crash handlers capture uncaught exceptions and
unhandled promise rejections, which have no other capture path because they
never reach the Hono error boundary. Both preserve the existing crash semantics:
the process still terminates with a non-zero exit rather than continuing in an
undefined state.

Explicitly handled exceptions may call a small monitoring adapter when they
represent an operational failure. Application modules depend on that adapter,
not directly on Sentry, so sanitization and disabled-mode behavior remain
centralized.

### Web capture boundary

Wrap the authenticated and public route tree in a top-level React error
boundary. On an unexpected render failure it:

- captures the sanitized exception, tagged with the current browser location
  normalized to its route template by the same helper the monitored fetch uses,
  so a share link is reported as `/b/:token` and never as a raw token;
- shows a localized recovery screen;
- provides reload and return-home actions;
- displays the Sentry event ID only as a support reference;
- never renders exception text or stack details to the owner.

Failed API calls are captured only for network failures and unexpected 5xx
responses. Expected 4xx responses continue through existing form and toast
handling. Authentication traffic, which does not use the typed RPC client, is
routed through the same monitored transport so auth 5xx failures are not blind
spots.

The browser SDK's automatic global handlers stay disabled, so an asynchronous
browser error that escapes both the error boundary and the monitored fetch — a
rejection inside a `setTimeout` callback, or a throw from a non-React event
listener — is not captured. This limitation is accepted deliberately: enabling
the global browser handlers would re-report every error the boundary and fetch
already capture, and duplicate issues are worse for a 10–20 owner beta than a
narrow blind spot. The limitation is recorded in the monitoring runbook, and the
API keeps its process-level handlers because the API has no equivalent
boundary-based path for a crash.

## Privacy and Sanitization

Sentry must run with default PII collection disabled. Sanitization is
allowlist-based: metadata not explicitly listed in this design is removed.

The following data must never leave TuringCare systems through Sentry:

- journal entries, daily check-ins, antecedents, behaviors, consequences, or
  owner responses;
- Behavior Brief content, trainer messages, and email bodies;
- dog notes, concern text, goal text, practice notes, or profile free text;
- owner name, email, recipient email, or contact details;
- request or response bodies;
- query strings and URL fragments;
- cookies, authorization headers, session tokens, verification links, and reset
  links;
- database connection strings, API keys, or environment-variable values.

Both applications implement `beforeSend` sanitization. Breadcrumb sanitization
removes form input, request payloads, and raw URLs before an event can be sent.
Synthetic tests include every forbidden category and fail if any value survives,
and equally fail if the metadata symbolication depends on — stack-frame paths,
module names, and build/debug identifiers — is stripped.

Both SDKs run with an explicit deny-all data-collection configuration covering
user info, cookies, request and response headers, HTTP bodies, URL query
parameters, GraphQL documents and variables, generative-AI inputs and outputs,
database query data, stack-frame variables, and source-context lines. Event
deduplication and inbound event filtering stay enabled in both applications. The
API additionally enables the Node uncaught-exception and unhandled-rejection
handlers, which are the only capture path for a process-level crash and keep
their non-zero exit behavior. Browser global handlers and browser API
instrumentation stay disabled because they would duplicate the explicit error
boundary and fetch captures.

## Source Maps and Releases

Set the Sentry release to the deployed Git SHA in both applications. Upload
source maps during CI/deployment using a GitHub Actions secret scoped only to
release uploads.

The web build emits source maps only when a production monitoring build resolves
complete Sentry upload options: `build.sourcemap` is `"hidden"` in that case and
`false` otherwise. A local or credential-less build therefore writes no `.map`
file at all. When maps are emitted they are hidden — no `sourceMappingURL`
comment — uploaded to Sentry, and deleted from the artifact before publication,
so Cloudflare Pages never serves one. The API intentionally runs TypeScript
source with `tsx`, so there is no compiled API source-map artifact; the source
files remain in the Fly image and Sentry stack frames use those runtime paths.

Required configuration:

- API runtime secret: `SENTRY_DSN`;
- web build variable: `VITE_SENTRY_DSN`;
- deployment secrets: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
  `SENTRY_API_PROJECT`, and `SENTRY_WEB_PROJECT`;
- shared deployment metadata: `SENTRY_ENVIRONMENT=production` and release SHA.

No Sentry credential is committed to the repository.

The production web build fails when a production monitoring DSN is configured
but any source-map upload input is missing. Web deployment fails if any `.map`
file remains in the build output before the Cloudflare Pages upload; that guard
is unconditional, so it also protects a build in which monitoring was disabled
or a future plugin re-enabled map emission.

## Alerting and GitHub Issues

Connect Sentry to `mcasillas17/TuringCare`. Alert-created issues receive the
labels `production` and `monitoring` and link to Sentry. The GitHub Issue body
contains the project, release, environment, first-seen timestamp, route
template, event ID, and Sentry link only. It does not copy stack traces,
breadcrumbs, request metadata, or event payloads.

Create alerts for:

- a new unhandled production issue;
- a regression of a resolved issue;
- API startup failure;
- an unexpected 5xx error-rate spike;
- repeated web application crashes.

Do not alert on expected 4xx responses, rate limiting, failed first-party
telemetry delivery, or a single transient network request.

Sentry grouping and alert cooldowns provide deduplication. One Sentry issue maps
to one open GitHub Issue. Resolving the Sentry issue does not automatically
close GitHub; closure remains an explicit engineering decision with a linked
fix.

## Backup and Restore Readiness

### Runbook

Add a production recovery runbook documenting:

- Supabase project and backup owner;
- enabled backup type, retention, and restore limitations;
- expected recovery point objective and recovery time objective based on the
  current Supabase plan;
- who can authorize and execute a restore;
- emergency contact and escalation sequence;
- steps for full restore, migration verification, application cutover, rollback,
  and post-incident review.

The runbook records provider-confirmed values rather than assuming retention or
point-in-time recovery capabilities.

### Restore drill

Perform one dated restore drill:

1. Capture a non-sensitive aggregate baseline from production before the
   restore: schema presence, applied-migration totals, integrity totals, and row
   counts only, read inside a read-only transaction.
2. Create a temporary isolated Postgres target with encryption and access
   limited to the operator performing the drill.
3. Restore the latest available production backup without changing production.
4. Record backup age, restore start/end time, and total recovery duration.
5. Verify the restored migration state against the committed migration journal.
   An exact match — same applied migration count, same latest applied migration
   — passes. A clone that is *behind* the repository, where its applied
   migrations are a leading subset of the journal, is a backup taken before the
   newest migration was deployed, not a corrupt one: it is recorded as an
   explicit operator-review item naming the missing migrations, and the operator
   may apply `db:migrate` to the isolated clone and re-run the verifier. A clone
   that is *ahead of* or inconsistent with the journal fails.
6. Require meaningful restored data. A clone whose owner-bearing tables are
   empty is a failed restore, not a passing one.
7. Compare aggregate row counts for critical tables side by side with the
   pre-restore baseline: users, sessions, accounts, dogs, journal entries,
   training goals/skills/sessions/milestones, weekly focus, briefs, brief sends,
   trainers, courses, and events. Transient operational tables such as the rate
   limiter's are excluded from this comparison because they are rewritten
   continuously; their schema presence is still required.
8. Verify foreign-key integrity and that Better Auth account/session tables are
   present.
9. Require explicit operator review of every non-zero count difference and of
   any migration lag. There is no automated tolerance: a smaller restored count
   is the expected consequence of backup lag and a larger one is the expected
   consequence of deletions after the recovery point, and no threshold can
   distinguish either from real data loss. The operator records a written
   judgement against the measured backup lag.
10. Read representative records only through count/existence checks; do not copy
    owner content into logs, screenshots, issues, or documentation.
11. Record pass/fail results and any recovery gaps.
12. Destroy the temporary database and confirm deletion.

The drill is complete only when the restore target is removed and the runbook
contains measured RPO/RTO evidence from the exercise.

Automated verification runs against a disposable database created and dropped
per test run. It never asserts against the shared development or CI database.

## Testing

### Unit tests

- API sanitizer removes every forbidden field and retains approved metadata,
  including the stack-frame and debug metadata symbolication needs.
- Web sanitizer removes user, request, breadcrumb, and URL-sensitive data.
- Exception values are normalized to a fixed classification; arbitrary error
  text does not survive sanitization.
- Monitoring configuration is fail-open: incomplete or malformed values disable
  capture with a warning and never throw. Environment-reading tests stub the
  environment and restore it afterwards.
- Monitoring adapters are no-ops when disabled.
- Expected 4xx errors are not captured, including framework `HTTPException`
  responses, whose status and body are preserved.
- Unexpected API errors retain the request ID and are captured once.
- React error boundary renders localized recovery actions, normalizes the
  current browser location to its route template before capture (`/b/<token>`
  becomes `/b/:token`), and captures once.
- The web source-map build-option resolver skips upload for local builds and
  fails a production monitoring build with incomplete upload inputs; source-map
  emission is enabled only when it returns upload options.
- The API restore verifier treats a self-consistent older backup as a migration
  lag requiring operator review, not as corruption, and still fails a clone that
  is ahead of or inconsistent with the committed journal.

Use mocked Sentry transports; tests never send network events. Test-only Hono
applications are constructed inside test files; the production application
instance is never given a synthetic failure route.

### Integration and build tests

- An API test triggers a synthetic unhandled exception on a throwaway
  application built in the test and verifies the sanitized capture and unchanged
  HTTP response contract.
- A web test throws from a child route and verifies the recovery screen.
- CI verifies web source-map upload configuration without exposing the upload
  token, and blocks deployment if `.map` files remain in the artifact.
- A local build without monitoring credentials produces no `.map` file at all.
- Existing lint, typecheck, unit, build, and Playwright suites remain required.

### Production diagnostic

Provide operator-only diagnostics that emit a fixed synthetic exception
containing no user data. Neither is reachable through a public application
route.

- API: a command in the API workspace, run through a manually dispatched,
  environment-protected workflow. It depends only on the monitoring variables,
  not on application environment validation, so it can run without a database.
- Web: the event must come from the real browser SDK, so a diagnostic function
  is registered on `window` only while an authenticated admin is on the admin
  route and removed when that view unmounts. The operator invokes it from
  browser DevTools. It is not a route, not a UI control, and accepts no input.

After deployment:

1. deploy with capture disabled and verify configuration;
2. enable production capture;
3. run the controlled diagnostic once for API and web;
4. verify symbolicated events in the correct Sentry projects;
5. verify one deduplicated GitHub Issue per diagnostic;
6. resolve the diagnostics and document the result.

## Failure Behavior

Monitoring must never change application success or failure semantics. Sentry
transport failures are logged without retry loops in request paths and never
block an API response or React render. Sanitization failure drops the event
rather than sending an unsanitized fallback.

Monitoring configuration fails open. A missing, incomplete, or malformed Sentry
variable disables capture and logs one warning that names only the variables at
fault; it never throws and never prevents the API from booting or the web app
from rendering. Because of this, the monitoring variables are deliberately kept
out of the application's fail-fast environment schema.

If web source-map upload fails, web deployment fails before production release
because an unsymbolicated monitoring rollout is not considered complete.

## Documentation

Update:

- `README.md` with local disabled-mode behavior and a pointer to the recovery
  runbook;
- deployment documentation with Sentry configuration, source-map secrets, and
  recovery prerequisites, added as one distinct `DEPLOY.md` section per
  workstream;
- `docs/SECURITY-BACKLOG.md` with monitoring and restore-drill status;
- a new production recovery runbook;
- a new production monitoring runbook;
- `docs/PROJECT-LOG.md` after each workstream ships.

## Acceptance Criteria

- Production API and web exceptions appear in separate Sentry projects with
  release and environment metadata.
- Synthetic forbidden data is absent from captured events.
- Expected 4xx responses do not create Sentry issues.
- Unexpected 5xx and React crashes include a correlation/event ID and produce
  actionable, deduplicated alerts.
- Sentry creates GitHub Issues without copying event payloads.
- Source maps are emitted only for a production monitoring build, uploaded, not
  publicly served, and no `.map` file is published with the web artifact.
- A controlled production diagnostic is captured and symbolicated in each
  project, the web one originating from a real browser session.
- The backup runbook contains provider-confirmed recovery capabilities.
- A real isolated restore drill is completed, measured, documented, and cleaned
  up, with restored migration state and critical counts verified against the
  repository journal and the pre-restore source baseline, and any migration lag
  reviewed and recorded by the operator.
- Existing CI and browser checks pass.

## Delivery Order

The monitoring workstream ships first and the backup/restore workstream second.
Each is separately shippable and neither depends on the other's code.

1. Shared monitoring contracts, request IDs, and sanitization tests.
2. API Sentry integration and source maps.
3. Web Sentry integration, error boundary, and source maps.
4. Sentry alert rules and GitHub integration.
5. Controlled production diagnostic and rollout validation.
6. Backup runbook and isolated restore drill.
