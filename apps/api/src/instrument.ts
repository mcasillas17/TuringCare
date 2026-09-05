// Preload before the application so failures during module evaluation can be
// captured. Node 22 is the supported runtime; newer majors remain guarded
// after a previously observed Sentry + tsx startup failure. The image gate
// must prove initialization, sanitized emission, drain, and exit on any bump.
import { initializeApiMonitoring } from "./monitoring/sentry";

initializeApiMonitoring();
