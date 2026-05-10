import { NextRequest, NextResponse } from "next/server";
import {
  deleteReferenceImage,
  listReferenceImages,
  upsertReferenceImage,
  type ReferenceImageEntry,
} from "@/lib/serverReferenceGallery";

export const runtime = "nodejs";
export const maxDuration = 180;

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export async function GET() {
  try {
    return NextResponse.json({ ok: true, entries: await listReferenceImages() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reference gallery request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    action?: unknown;
    id?: unknown;
    entry?: Partial<ReferenceImageEntry>;
    analyze?: unknown;
  };
  const action = safeText(payload.action, "upsert");

  try {
    if (action === "delete") {
      const id = safeText(payload.id);
      if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
      await deleteReferenceImage(id);
      return NextResponse.json({ ok: true, entries: await listReferenceImages() });
    }

    if (action === "upsert") {
      const entry = await upsertReferenceImage(payload.entry ?? {}, {
        analyze: payload.analyze !== false,
      });
      return NextResponse.json({ ok: true, entry, entries: await listReferenceImages() });
    }

    return NextResponse.json({ error: "unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reference gallery write failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
