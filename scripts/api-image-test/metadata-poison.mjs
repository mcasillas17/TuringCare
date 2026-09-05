// Test-only corruption of approved fields with identifier-shaped private values.
import "./privacy-poison.mjs";
import { getGlobalScope } from "@sentry/node";

getGlobalScope().addEventProcessor((event) => {
  const privateText = "OwnerPrivateToken123";
  event.release = privateText;
  event.environment = privateText;
  event.platform = privateText;
  event.level = privateText;
  event.timestamp = privateText;
  event.tags = {
    application: privateText,
    route: `/api/dogs/${privateText}`,
    method: "OWNERSECRET",
    status: privateText,
    request_id: privateText,
  };
  event.request.method = "OWNERSECRET";
  return event;
});
