import { NextRequest, NextResponse } from "next/server";
import {
  loadRuntimeSettings,
  saveRuntimeSettings,
  type RuntimeSettings,
} from "@/lib/serverRuntimeSettings";

export async function GET() {
  return NextResponse.json(await loadRuntimeSettings());
}

export async function POST(request: NextRequest) {
  let body: Partial<RuntimeSettings>;

  try {
    body = (await request.json()) as Partial<RuntimeSettings>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const settings = await saveRuntimeSettings(body);
  return NextResponse.json(settings);
}
