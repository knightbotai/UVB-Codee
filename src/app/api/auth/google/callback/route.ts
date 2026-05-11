import { NextRequest, NextResponse } from "next/server";
import {
  USER_PROFILE_GOOGLE_STATE_COOKIE,
  USER_PROFILE_SESSION_COOKIE,
  publicUserProfile,
  readUserProfileStore,
  writeUserProfileStore,
} from "@/lib/serverUserProfileStore";

export const runtime = "nodejs";

interface GoogleTokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenInfo {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  error?: string;
  error_description?: string;
}

function errorRedirect(request: NextRequest, message: string) {
  const url = new URL("/", request.nextUrl.origin);
  url.searchParams.set("uvbAuthError", message);
  return NextResponse.redirect(url);
}

function setSessionCookie(response: NextResponse, profileId: string) {
  response.cookies.set(USER_PROFILE_SESSION_COOKIE, profileId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  response.cookies.set(USER_PROFILE_GOOGLE_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const clientId = process.env.UVB_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.UVB_GOOGLE_CLIENT_SECRET?.trim();
  const publicUrl = (process.env.UVB_PUBLIC_URL ?? request.nextUrl.origin).replace(/\/+$/, "");
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const expectedState = request.cookies.get(USER_PROFILE_GOOGLE_STATE_COOKIE)?.value ?? "";

  if (!clientId || !clientSecret) {
    return errorRedirect(request, "Google login is not configured.");
  }
  if (!code || !state || state !== expectedState) {
    return errorRedirect(request, "Google login state check failed.");
  }

  const redirectUri = `${publicUrl}/api/auth/google/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenData = (await tokenResponse.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokenData.id_token) {
    return errorRedirect(
      request,
      tokenData.error_description || tokenData.error || "Google token exchange failed."
    );
  }

  const tokenInfoResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`
  );
  const tokenInfo = (await tokenInfoResponse.json().catch(() => ({}))) as GoogleTokenInfo;
  const emailVerified =
    tokenInfo.email_verified === true || String(tokenInfo.email_verified).toLowerCase() === "true";
  if (
    !tokenInfoResponse.ok ||
    tokenInfo.aud !== clientId ||
    !tokenInfo.sub ||
    !tokenInfo.email ||
    !emailVerified
  ) {
    return errorRedirect(request, tokenInfo.error_description || tokenInfo.error || "Google identity validation failed.");
  }

  const store = await readUserProfileStore();
  const email = tokenInfo.email.toLowerCase();
  const profile = store.profiles.find(
    (item) =>
      item.authProviders.includes("google-oidc") &&
      ((item.googleSubject && item.googleSubject === tokenInfo.sub) ||
        item.email.toLowerCase() === email)
  );

  if (!profile) {
    return errorRedirect(request, `No UVB profile is linked to ${tokenInfo.email}.`);
  }

  if (!profile.googleSubject) {
    profile.googleSubject = tokenInfo.sub;
    profile.updatedAt = Date.now();
    await writeUserProfileStore({ profiles: store.profiles });
  }

  const url = new URL("/", request.nextUrl.origin);
  url.searchParams.set("uvbAuthProfile", publicUserProfile(profile).username);
  return setSessionCookie(NextResponse.redirect(url), profile.id);
}
