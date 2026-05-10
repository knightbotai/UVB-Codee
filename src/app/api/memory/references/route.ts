import { NextRequest, NextResponse } from "next/server";
import {
  deleteReferenceImage,
  listReferenceImages,
  matchReferenceImages,
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
    visualEmbedding?: unknown;
    analyze?: unknown;
    limit?: unknown;
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

    if (action === "match") {
      const matches = await matchReferenceImages(
        Array.isArray(payload.visualEmbedding) ? payload.visualEmbedding : [],
        typeof payload.limit === "number" ? payload.limit : 5
      );
      return NextResponse.json({ ok: true, matches });
    }

    return NextResponse.json({ error: "unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reference gallery write failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
