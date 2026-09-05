// Prove that queue acceptance plus flush cannot masquerade as transport acknowledgement.
import { getGlobalScope } from "@sentry/node";
getGlobalScope().addEventProcessor(() => null);
