import { createAuthClient } from "better-auth/react";

// Dev: VITE_API_URL unset → baseURL undefined → Better Auth uses the page
// origin (:3000) and the Vite proxy forwards /api/auth/* to the local API.
// Prod: VITE_API_URL=https://api.turingcare.dog → auth calls hit the API
// subdomain directly (cross-site cookies handled server-side via COOKIE_DOMAIN).
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || undefined,
  basePath: "/api/auth",
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  changePassword,
  deleteUser,
} = authClient;
