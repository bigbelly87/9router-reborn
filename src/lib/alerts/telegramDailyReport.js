import { getSettings } from "@/lib/localDb";
import { getAdapter } from "@/lib/db/driver.js";
import { parseJson } from "@/lib/db/helpers/jsonCol.js";
import { sendTelegramMessage, getTitlePrefix } from "./telegram.js";

// Global scheduler state surviving hot reloads
const g = (global.__telegramDailyReportScheduler ??= {
  interval: null,
  lastReportDateKey: null,
});

/**
 * Get date string for the previous day (YYYY-MM-DD)
 */
export function getPreviousDayDateKey(refDate = new Date()) {
  const d = new Date(refDate);
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get daily statistics from usageDaily table for a given dateKey
 */
export async function getDailyStatsForDate(dateKey) {
  try {
    const db = await getAdapter();
    const row = db.get(`SELECT data FROM usageDaily WHERE dateKey = ?`, [dateKey]);
    if (!row) {
      return {
        dateKey,
        requests: 0,
        promptTokens: 0,
        cachedTokens: 0,
        completionTokens: 0,
        cost: 0,
        byProvider: {},
        byModel: {},
        apiKeys: [],
      };
    }
    const data = parseJson(row.data, {});

    // Map API Key strings to their user-configured names (e.g. "llm1", "dev")
    const apiKeysMap = {};
    try {
      const keyRows = db.all(`SELECT key, name FROM apiKeys`);
      for (const r of keyRows || []) {
        if (r.key) apiKeysMap[r.key] = r.name || r.key;
      }
    } catch {
      // ignore
    }

    // Group usage by API Key name
    const keySummaries = {};
    for (const [akKey, ak] of Object.entries(data.byApiKey || {})) {
      const rawKey = ak.apiKey || ak.meta?.apiKey || "local-no-key";
      let displayName = "Local / Direct";
      if (rawKey !== "local-no-key" && rawKey) {
        displayName = apiKeysMap[rawKey] || (rawKey.length > 12 ? `${rawKey.slice(0, 8)}...` : rawKey);
      }

      if (!keySummaries[displayName]) {
        keySummaries[displayName] = {
          name: displayName,
          requests: 0,
          promptTokens: 0,
          cachedTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
        };
      }
      const item = keySummaries[displayName];
      item.requests += ak.requests || 0;
      item.promptTokens += ak.promptTokens || 0;
      item.cachedTokens += ak.cachedTokens || 0;
      item.completionTokens += ak.completionTokens || 0;
      item.totalTokens += (ak.promptTokens || 0) + (ak.completionTokens || 0);
      item.cost += ak.cost || 0;
    }

    const apiKeysList = Object.values(keySummaries).sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0));

    return {
      dateKey,
      requests: data.requests || 0,
      promptTokens: data.promptTokens || 0,
      cachedTokens: data.cachedTokens || 0,
      completionTokens: data.completionTokens || 0,
      cost: data.cost || 0,
      byProvider: data.byProvider || {},
      byModel: data.byModel || {},
      apiKeys: apiKeysList,
    };
  } catch (e) {
    console.error(`[Telegram Daily Report] Error fetching stats for ${dateKey}:`, e.message);
    return {
      dateKey,
      requests: 0,
      promptTokens: 0,
      cachedTokens: 0,
      completionTokens: 0,
      cost: 0,
      byProvider: {},
      byModel: {},
      apiKeys: [],
    };
  }
}

/**
 * Format daily report HTML message
 */
export function formatDailyReportMessage(stats, options = {}) {
  const prefix = options.titlePrefix || "[9Router]";
  const requests = (stats.requests || 0).toLocaleString("vi-VN");
  const promptTokens = (stats.promptTokens || 0).toLocaleString("vi-VN");
  const cachedTokens = (stats.cachedTokens || 0).toLocaleString("vi-VN");
  const completionTokens = (stats.completionTokens || 0).toLocaleString("vi-VN");
  const cost = typeof stats.cost === "number" ? `$${stats.cost.toFixed(4)}` : "$0.0000";

  const lines = [
    `📊 <b>${prefix} BÁO CÁO THỐNG KÊ NGÀY (${stats.dateKey})</b>`,
    "",
    `• <b>Total Requests:</b> <code>${requests}</code>`,
    `• <b>Total Input Tokens:</b> <code>${promptTokens}</code>`,
    `• <b>Cached Tokens:</b> <code>${cachedTokens}</code>`,
    `• <b>Output Tokens:</b> <code>${completionTokens}</code>`,
    `• <b>Est. Cost:</b> <b>${cost}</b>`,
  ];

  // Top providers by request count (if any)
  const providers = Object.entries(stats.byProvider || {});
  if (providers.length > 0) {
    lines.push("");
    lines.push("🏆 <b>Top Providers:</b>");
    providers
      .sort((a, b) => (b[1].requests || 0) - (a[1].requests || 0))
      .slice(0, 5)
      .forEach(([name, p], idx) => {
        const reqCount = (p.requests || 0).toLocaleString("vi-VN");
        const pCost = typeof p.cost === "number" ? `$${p.cost.toFixed(4)}` : "$0.00";
        lines.push(`${idx + 1}. <b>${name.toUpperCase()}</b>: ${reqCount} reqs (${pCost})`);
      });
  }

  // Token breakdown by API Key
  const apiKeys = stats.apiKeys || [];
  if (apiKeys.length > 0) {
    lines.push("");
    lines.push("🔑 <b>Thống Kê Theo API Key:</b>");
    apiKeys.slice(0, 10).forEach((ak, idx) => {
      const akReqs = (ak.requests || 0).toLocaleString("vi-VN");
      const akTotalTokens = (ak.totalTokens || 0).toLocaleString("vi-VN");
      const akInTokens = (ak.promptTokens || 0).toLocaleString("vi-VN");
      const akOutTokens = (ak.completionTokens || 0).toLocaleString("vi-VN");
      const akCost = typeof ak.cost === "number" ? `$${ak.cost.toFixed(4)}` : "$0.0000";

      let tokenDetails = `In: <code>${akInTokens}</code> · Out: <code>${akOutTokens}</code>`;
      if (ak.cachedTokens > 0) {
        tokenDetails += ` · Cache: <code>${(ak.cachedTokens || 0).toLocaleString("vi-VN")}</code>`;
      }

      lines.push(`${idx + 1}. <b>${ak.name}</b>`);
      lines.push(`   ↳ <code>${akReqs}</code> reqs · <code>${akTotalTokens}</code> tokens (${tokenDetails}) · <b>${akCost}</b>`);
    });
  }

  return lines.join("\n");
}

/**
 * Send daily report for a specific date (defaults to yesterday)
 */
export async function sendDailyReport(options = {}) {
  try {
    const settings = await getSettings();
    if (!settings.telegramAlertsEnabled && !options.force) {
      return { success: false, reason: "telegram_disabled" };
    }
    if (!settings.telegramDailyReportEnabled && !options.force) {
      return { success: false, reason: "daily_report_disabled" };
    }

    const dateKey = options.dateKey || getPreviousDayDateKey();
    const stats = await getDailyStatsForDate(dateKey);
    const prefix = getTitlePrefix(settings, options.titlePrefix);
    const message = formatDailyReportMessage(stats, { titlePrefix: prefix });

    const result = await sendTelegramMessage(message, {
      botToken: options.botToken,
      chatId: options.chatId,
      topicId: options.topicId,
      force: options.force,
    });

    if (result.success && !options.force) {
      g.lastReportDateKey = dateKey;
    }

    return result;
  } catch (error) {
    console.error("[Telegram Daily Report] sendDailyReport error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check and execute daily report tick
 */
export async function runDailyReportSchedulerTick(now = new Date()) {
  try {
    const settings = await getSettings();
    if (!settings.telegramAlertsEnabled || !settings.telegramDailyReportEnabled) {
      return;
    }

    const targetTime = settings.telegramDailyReportTime || "01:00";
    const [targetHourStr, targetMinStr] = targetTime.split(":");
    const targetHour = parseInt(targetHourStr || "1", 10);
    const targetMin = parseInt(targetMinStr || "0", 10);

    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    // Check if current hour and minute match scheduled time
    if (currentHour === targetHour && currentMin === targetMin) {
      const yesterdayKey = getPreviousDayDateKey(now);
      if (g.lastReportDateKey !== yesterdayKey) {
        console.log(`[Telegram Daily Report] Scheduled trigger firing for ${yesterdayKey}...`);
        await sendDailyReport({ dateKey: yesterdayKey });
      }
    }
  } catch (err) {
    console.warn("[Telegram Daily Report] Scheduler tick error:", err.message);
  }
}

/**
 * Start the daily report scheduler timer (runs every 30 seconds)
 */
export function startDailyReportScheduler() {
  if (g.interval) return;
  g.interval = setInterval(() => {
    runDailyReportSchedulerTick().catch(() => {});
  }, 30 * 1000);
  if (g.interval.unref) g.interval.unref();
  console.log("[Telegram Daily Report] Scheduler started (checking every 30s)");
}

/**
 * Stop the scheduler
 */
export function stopDailyReportScheduler() {
  if (!g.interval) return;
  clearInterval(g.interval);
  g.interval = null;
  console.log("[Telegram Daily Report] Scheduler stopped");
}

/**
 * Configure scheduler dynamically based on settings
 */
export function configureDailyReportScheduler(settings) {
  if (settings?.telegramAlertsEnabled && settings?.telegramDailyReportEnabled) {
    startDailyReportScheduler();
  } else {
    stopDailyReportScheduler();
  }
}
