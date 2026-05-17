import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
});

export const { signIn, signUp, signOut, useSession } = authClient;
