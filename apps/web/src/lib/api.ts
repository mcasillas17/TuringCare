import type { AppType } from "@turingcare/api";
import { hc } from "hono/client";

export const api = hc<AppType>("/");
