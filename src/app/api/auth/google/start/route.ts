import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { USER_PROFILE_GOOGLE_STATE_COOKIE } from "@/lib/serverUserProfileStore";

export const runtime = "nodejs";

function configured(value: string | undefined) {
  return Boolean(value && value.trim());
}

export async function GET(request: NextRequest) {
  const clientId = process.env.UVB_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.UVB_GOOGLE_CLIENT_SECRET;
  const publicUrl = (process.env.UVB_PUBLIC_URL ?? request.nextUrl.origin).replace(/\/+$/, "");

  if (!configured(clientId) || !configured(clientSecret)) {
    return NextResponse.json(
      {
        error:
          "Google login is not configured. Set UVB_GOOGLE_CLIENT_ID and UVB_GOOGLE_CLIENT_SECRET first.",
      },
      { status: 503 }
    );
  }

  const state = randomBytes(24).toString("hex");
  const redirectUri = `${publicUrl}/api/auth/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId!.trim());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(url);
  response.cookies.set(USER_PROFILE_GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
