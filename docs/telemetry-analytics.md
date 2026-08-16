# Product telemetry and analytics

TuringCare records privacy-safe product events to understand whether owners reach useful outcomes.
Telemetry is best-effort: failures never block a user action, and server-side events are emitted only
after successful mutations.

## Privacy and retention

- The server resolves user and session identity; browser payloads cannot supply either value.
- Browser events use a small allowlist and scalar properties capped at 1 KB.
- Event properties contain enums, booleans, counters, and opaque catalog IDs—not owner prose, dog
  names, email addresses, or shared-brief tokens.
- `/b/*` paths are normalized to `/b/:token` in both the browser and API before persistence.
- Events are retained for 180 days. Account deletion removes the user/session association from
  retained rows; anonymous aggregate history can therefore change after deletion.

## Metric definitions

The admin dashboard excludes admin accounts and uses the selected 7, 30, or 90-day signup cohort.

- **Activation funnel:** a strict sequence: signup → dog → journal moment → goal → practice →
  finalized brief → shared, emailed, or downloaded brief. Each stage is the first qualifying event
  after its prerequisite, so counts are monotonic.
- **Activated:** percentage of mature cohort members who complete signup → practice within seven
  days. A cohort is mature once its seven-day opportunity window has elapsed.
- **Returning:** owners with a successful product action on at least two distinct days in the
  selected activity range. Sign-ins and page views do not count as product actions.
- **Completion time:** median and P90 among completed journeys. “Within 7d” uses all mature,
  eligible journey starters as its denominator, including owners who did not complete.
- **Feature adoption:** unique signed-in owners and successful action volume grouped into account,
  briefs, discovery, dog care, journal, and training. Raw event names are not displayed.
- **Top destinations:** page views and unique signed-in owners, with dynamic UUIDs and shared-link
  tokens normalized.
- **Deleted accounts:** deletion events in the selected range. The event remains anonymous after
  the account row is removed.

## Event ownership

Mutation telemetry belongs in the API next to the successful write. Browser telemetry is reserved
for actions without a server mutation, such as page/detail views and PDF download. Add new names to
`apps/api/src/telemetry/events.ts`, keep properties scalar and low-cardinality, and add route-level
emission tests whenever a tracked action changes.

The dashboard aggregation lives in `apps/api/src/routes/admin.ts`; its typed web consumer and panels
live in `apps/web/src/routes/admin/`.
