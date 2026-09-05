// Test-only processor installed before the production instrumentation preload.
// These synthetic secrets must be absent from the serialized SDK envelope.
import { getGlobalScope } from "@sentry/node";

getGlobalScope().addEventProcessor((event) => {
  event.message = "raw-exception-sentinel";
  event.user = { email: "email-sentinel@example.invalid" };
  event.extra = { note: "owner-content-sentinel", password: "credential-sentinel" };
  event.contexts = { synthetic: { note: "owner-content-sentinel" } };
  event.breadcrumbs = [{ message: "breadcrumb-sentinel" }];
  event.request = {
    method: "GET",
    url: "https://example.invalid/briefs/public/bearer-token-sentinel?secret=query-sentinel",
    headers: { authorization: "credential-sentinel", cookie: "cookie-sentinel" },
    data: "raw-body-sentinel",
  };
  event.tags = { ...event.tags, private: "owner-content-sentinel" };
  for (const exception of event.exception?.values ?? []) {
    exception.value = "raw-exception-sentinel";
    exception.mechanism = { ...exception.mechanism, data: { secret: "credential-sentinel" } };
    for (const frame of exception.stacktrace?.frames ?? []) {
      frame.vars = { password: "credential-sentinel" };
      frame.context_line = "source-content-sentinel";
    }
  }
  return event;
});
