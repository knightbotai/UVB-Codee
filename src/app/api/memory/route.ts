import { NextRequest, NextResponse } from "next/server";
import {
  deleteMemoryEntry,
  listMemoryEntries,
  memoryBackendStatus,
  searchMemoryEntries,
  upsertMemoryEntry,
  type MemoryEntry,
} from "@/lib/serverMemory";

export const runtime = "nodejs";
export const maxDuration = 120;

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "12", 10);

  try {
    const [entries, status, results] = await Promise.all([
      listMemoryEntries(),
      memoryBackendStatus(),
      query ? searchMemoryEntries(query, limit) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      ok: true,
      entries,
      results,
      status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Memory Bank request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    action?: unknown;
    id?: unknown;
    entry?: Partial<MemoryEntry>;
    entries?: Partial<MemoryEntry>[];
    query?: unknown;
    limit?: unknown;
  };
  const action = safeText(payload.action, "upsert");

  try {
    if (action === "search") {
      const results = await searchMemoryEntries(
        safeText(payload.query),
        typeof payload.limit === "number" ? payload.limit : 8
      );
      return NextResponse.json({ ok: true, results, status: await memoryBackendStatus() });
    }

    if (action === "sync") {
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      const upserted = [];
      for (const entry of entries) {
        if (safeText(entry.content)) {
          upserted.push(await upsertMemoryEntry(entry));
        }
      }
      return NextResponse.json({
        ok: true,
        entries: await listMemoryEntries(),
        upserted,
        status: await memoryBackendStatus(),
      });
    }

    if (action === "delete") {
      const id = safeText(payload.id);
      if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
      await deleteMemoryEntry(id);
      return NextResponse.json({
        ok: true,
        entries: await listMemoryEntries(),
        status: await memoryBackendStatus(),
      });
    }

    if (action === "upsert" || action === "remember") {
      const entry = await upsertMemoryEntry(payload.entry ?? {});
      return NextResponse.json({
        ok: true,
        entry,
        entries: await listMemoryEntries(),
        status: await memoryBackendStatus(),
      });
    }

    return NextResponse.json({ error: "unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Memory Bank write failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
