import process from "node:process";
import { tasker } from "@calcom/features/tasker";
import { defaultResponderForAppDir } from "@calcom/web/app/api/defaultResponderForAppDir";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

async function getHandler(request: NextRequest) {
  const apiKey = request.headers.get("authorization") || request.nextUrl.searchParams.get("apiKey");
  if (![process.env.CRON_API_KEY, `Bearer ${process.env.CRON_SECRET}`].includes(`${apiKey}`)) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 403 });
  }

  await tasker.create("sweepWaitlist", {});
  return NextResponse.json({ ok: true });
}

export const GET = defaultResponderForAppDir(getHandler);
