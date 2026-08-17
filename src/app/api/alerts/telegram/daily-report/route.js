import { NextResponse } from "next/server";
import { sendDailyReport } from "@/lib/alerts/telegramDailyReport";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch {
      // empty body is fine
    }

    const { botToken, chatId, topicId, titlePrefix, dateKey } = body;

    const result = await sendDailyReport({
      botToken,
      chatId,
      topicId,
      titlePrefix,
      dateKey,
      force: true, // allow manual triggering from dashboard
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Gửi báo cáo thất bại." }, { status: 400 });
    }

    return NextResponse.json({ success: true, dateKey: result.dateKey });
  } catch (error) {
    console.error("[Telegram Daily Report API] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
