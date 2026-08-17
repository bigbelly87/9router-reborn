import { NextResponse } from "next/server";
import { testTelegramConnection } from "@/lib/alerts/telegram";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const { botToken, chatId, topicId, titlePrefix } = body;

    const result = await testTelegramConnection({ botToken, chatId, topicId, titlePrefix });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Telegram Test API] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
