import { NextRequest, NextResponse } from "next/server";
import {
  USER_PROFILE_SESSION_COOKIE,
  findUserProfileForLogin,
  publicUserProfile,
  readUserProfileStore,
  safeProfileText,
  verifyProfilePassword,
} from "@/lib/serverUserProfileStore";

export const runtime = "nodejs";

const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function applySessionCookie(response: NextResponse, profileId: string | null) {
  if (profileId) {
    response.cookies.set(USER_PROFILE_SESSION_COOKIE, profileId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE,
    });
  } else {
    response.cookies.set(USER_PROFILE_SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}

function sessionResponse(profileId: string | null, init?: ResponseInit) {
  return applySessionCookie(NextResponse.json({ ok: true, profileId }, init), profileId);
}

export async function GET(request: NextRequest) {
  const profileId = request.cookies.get(USER_PROFILE_SESSION_COOKIE)?.value ?? "";
  const store = await readUserProfileStore();
  const profile = store.profiles.find((item) => item.id === profileId) ?? null;

  return NextResponse.json({
    ok: true,
    profile: profile ? publicUserProfile(profile) : null,
    profiles: store.profiles.map(publicUserProfile),
  });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    login?: unknown;
    password?: unknown;
    profileId?: unknown;
  };
  const login = safeProfileText(payload.login || payload.profileId);
  const password = safeProfileText(payload.password);
  const store = await readUserProfileStore();
  const profile = findUserProfileForLogin(store.profiles, login);

  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  if (!profile.authProviders.includes("local-password")) {
    return NextResponse.json(
      { error: "This profile is not configured for local password login." },
      { status: 403 }
    );
  }

  if (profile.passwordHash && !verifyProfilePassword(profile, password)) {
    return NextResponse.json({ error: "Password did not match this profile." }, { status: 401 });
  }

  if (!profile.passwordHash && profile.role !== "owner") {
    return NextResponse.json(
      { error: "This profile needs a password before it can log in locally." },
      { status: 403 }
    );
  }

  return applySessionCookie(
    NextResponse.json({
      ok: true,
      profile: publicUserProfile(profile),
      profiles: store.profiles.map(publicUserProfile),
    }),
    profile.id
  );
}

export async function DELETE() {
  return sessionResponse(null);
}
