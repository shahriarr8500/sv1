// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
// Google OAuth provider (login/signup with Google). Credentials are read from
// the deployment env vars AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET via Auth.js
// defaults, so no client id/secret is passed here.
import Google from "@auth/core/providers/google";
import { emailOtp } from "./auth/emailOtp";


export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, Anonymous, Google],
});