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
- exception type, sanitized message, and stack trace;
- browser and runtime metadata supplied by the SDK after sanitization.

The API returns the request ID in an `X-Request-ID` response header. The web API
client retains that ID when surfacing a failed request, allowing a browser error
and API error to be correlated without attaching owner data.

### API capture boundary

Add request-ID middleware before application routes. Use a Hono-level error
boundary to capture unhandled exceptions and unexpected 5xx responses, then
preserve the repository's existing HTTP response behavior. Expected validation,
authentication, authorization, not-found, rate-limit, and other 4xx responses
are not Sentry errors.

Explicitly handled exceptions may call a small monitoring adapter when they
represent an operational failure. Application modules depend on that adapter,
not directly on Sentry, so sanitization and disabled-mode behavior remain
centralized.

### Web capture boundary

Wrap the authenticated and public route tree in a top-level React error
boundary. On an unexpected render failure it:

- captures the sanitized exception;
- shows a localized recovery screen;
- provides reload and return-home actions;
- displays the Sentry event ID only as a support reference;
- never renders exception text or stack details to the owner.

Failed API calls are captured only for network failures and unexpected 5xx
responses. Expected 4xx responses continue through existing form and toast
handling.

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
Synthetic tests include every forbidden category and fail if any value survives.

## Source Maps and Releases

Set the Sentry release to the deployed Git SHA in both applications. Upload
source maps during CI/deployment using a GitHub Actions secret scoped only to
release uploads.

The web build uses hidden source maps: maps are uploaded to Sentry but are not
served publicly by Cloudflare Pages. API source maps are uploaded for the
compiled server release and are not copied into the production runtime image
unless the runtime requires them locally.

Required configuration:

- API runtime secret: `SENTRY_DSN`;
- web build variable: `VITE_SENTRY_DSN`;
- deployment secrets: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
  `SENTRY_API_PROJECT`, and `SENTRY_WEB_PROJECT`;
- shared deployment metadata: `SENTRY_ENVIRONMENT=production` and release SHA.

No Sentry credential is committed to the repository.

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

1. Create a temporary isolated Postgres target with encryption and access
   limited to the operator performing the drill.
2. Restore the latest available production backup without changing production.
3. Record backup age, restore start/end time, and total recovery duration.
4. Run committed migrations in verification mode and confirm schema version.
5. Compare aggregate row counts for critical tables: users, sessions, dogs,
   journal entries, training goals/skills/sessions, briefs, and events.
6. Verify foreign-key integrity and that Better Auth account/session tables are
   present.
7. Read representative records only through count/existence checks; do not copy
   owner content into logs, screenshots, issues, or documentation.
8. Record pass/fail results and any recovery gaps.
9. Destroy the temporary database and confirm deletion.

The drill is complete only when the restore target is removed and the runbook
contains measured RPO/RTO evidence from the exercise.

## Testing

### Unit tests

- API sanitizer removes every forbidden field and retains approved metadata.
- Web sanitizer removes user, request, breadcrumb, and URL-sensitive data.
- Monitoring adapters are no-ops when disabled.
- Expected 4xx errors are not captured.
- Unexpected API errors retain the request ID and are captured once.
- React error boundary renders localized recovery actions and captures once.

Use mocked Sentry transports; tests never send network events.

### Integration and build tests

- An API test triggers a synthetic unhandled exception and verifies the
  sanitized captured envelope and unchanged HTTP response contract.
- A web test throws from a child route and verifies the recovery screen.
- CI verifies source-map upload configuration without exposing the upload token.
- Existing lint, typecheck, unit, build, and Playwright suites remain required.

### Production diagnostic

Provide an operator-only diagnostic command or deployment action that emits a
fixed synthetic exception containing no user data. It is unavailable through a
public application route.

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

If source-map upload fails, deployment fails before production release because
an unsymbolicated monitoring rollout is not considered complete.

## Documentation

Update:

- `README.md` with local disabled-mode behavior;
- deployment documentation with Sentry configuration and source-map secrets;
- `docs/SECURITY-BACKLOG.md` with monitoring and restore-drill status;
- a new production recovery runbook;
- `docs/PROJECT-LOG.md` after the implementation ships.

## Acceptance Criteria

- Production API and web exceptions appear in separate Sentry projects with
  release and environment metadata.
- Synthetic forbidden data is absent from captured events.
- Expected 4xx responses do not create Sentry issues.
- Unexpected 5xx and React crashes include a correlation/event ID and produce
  actionable, deduplicated alerts.
- Sentry creates GitHub Issues without copying event payloads.
- Source maps are uploaded and not publicly served.
- A controlled production diagnostic is captured and symbolicated.
- The backup runbook contains provider-confirmed recovery capabilities.
- A real isolated restore drill is completed, measured, documented, and cleaned
  up.
- Existing CI and browser checks pass.

## Delivery Order

1. Shared monitoring contracts, request IDs, and sanitization tests.
2. API Sentry integration and source maps.
3. Web Sentry integration, error boundary, and source maps.
4. Sentry alert rules and GitHub integration.
5. Controlled production diagnostic and rollout validation.
6. Backup runbook and isolated restore drill.
