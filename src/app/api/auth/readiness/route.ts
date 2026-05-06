import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isConfigured(value: string | undefined) {
  return Boolean(value && value.trim());
}

export async function GET() {
  const publicUrl = process.env.UVB_PUBLIC_URL ?? "http://127.0.0.1:3010";
  const googleClientId = process.env.UVB_GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.UVB_GOOGLE_CLIENT_SECRET;
  const passkeyRpId = process.env.UVB_PASSKEY_RP_ID;
  const passkeyOrigin = process.env.UVB_PASSKEY_ORIGIN ?? publicUrl;

  return NextResponse.json({
    publicUrl,
    providers: [
      {
        id: "local-password",
        name: "Local Password",
        configured: true,
        notes: "Local profile passwords are stored as PBKDF2 hashes in the local UVB profile store.",
      },
      {
        id: "google-oidc",
        name: "Google Login",
        configured: isConfigured(googleClientId) && isConfigured(googleClientSecret),
        callbackUrl: `${publicUrl.replace(/\/+$/, "")}/api/auth/google/callback`,
        notes: "Set UVB_GOOGLE_CLIENT_ID and UVB_GOOGLE_CLIENT_SECRET, then add the callback URL in Google Cloud OAuth.",
      },
      {
        id: "passkey",
        name: "Passkeys / WebAuthn",
        configured: isConfigured(passkeyRpId) && isConfigured(passkeyOrigin),
        rpId: passkeyRpId || "",
        origin: passkeyOrigin,
        notes: "Set UVB_PASSKEY_RP_ID to the remote domain, for example tacimpulse.net or daplab.net, after HTTPS routing is live.",
      },
    ],
  });
}
