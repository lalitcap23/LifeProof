import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    programId: process.env.NEXT_PUBLIC_PROGRAM_ID,
  });
}
