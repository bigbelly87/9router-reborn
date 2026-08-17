import { getSettings, updateProviderConnection } from "@/lib/localDb";

// In-memory cooldown cache for rate limiting duplicate non-state alerts (e.g. allAccountsDown, errors)
const alertDedupeCache = new Map();

/**
 * Format remaining reset time to readable string
 */
function formatResetTime(resetAt) {
  if (!resetAt) return null;
  try {
    const target = new Date(resetAt);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) return "Ngay bây giờ / Đã đến hạn reset";
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} ngày ${hours % 24} giờ ${minutes % 60} phút`;
    if (hours > 0) return `${hours} giờ ${minutes % 60} phút`;
    return `${minutes} phút`;
  } catch {
    return String(resetAt);
  }
}

/**
 * Map status color to human label and emoji
 */
const COLOR_META = {
  green: { label: "Xanh (Bình thường)", emoji: "🟢", textClass: "Xanh" },
  yellow: { label: "Cam (Cảnh báo hạn mức)", emoji: "🟠", textClass: "Cam" },
  red: { label: "Đỏ (Hết hạn mức / Khóa)", emoji: "🔴", textClass: "Đỏ" },
};

/**
 * Get formatted title prefix (e.g. "[9Router]" or "[My-Custom-Title]")
 */
export function getTitlePrefix(settings, override = null) {
  const custom = override !== undefined && override !== null ? override : settings?.telegramTitlePrefix;
  if (custom && String(custom).trim()) {
    const trimmed = String(custom).trim();
    return trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed : `[${trimmed}]`;
  }
  return "[9Router]";
}

/**
 * Determine status color based on percentage or locked state
 * > 70% -> green
 * 30% - 70% -> yellow
 * < 30% or locked -> red
 */
export function determineStatusColor(percentage, isLocked = false, isUnavailable = false) {
  if (isLocked || isUnavailable) return "red";
  if (typeof percentage === "number" && Number.isFinite(percentage)) {
    if (percentage > 70) return "green";
    if (percentage >= 30) return "yellow";
    return "red";
  }
  return "green";
}

/**
 * Send an HTML formatted message via Telegram Bot API
 */
export async function sendTelegramMessage(htmlText, options = {}) {
  try {
    const settings = await getSettings();
    if (!settings.telegramAlertsEnabled && !options.force) {
      return { success: false, reason: "disabled" };
    }

    const botToken = options.botToken || settings.telegramBotToken;
    const chatId = options.chatId || settings.telegramChatId;
    const topicId = options.topicId !== undefined ? options.topicId : settings.telegramTopicId;

    if (!botToken || !chatId) {
      return { success: false, reason: "missing_credentials" };
    }

    const url = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;
    const payload = {
      chat_id: String(chatId).trim(),
      text: htmlText,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    if (topicId && String(topicId).trim()) {
      payload.message_thread_id = Number(topicId);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.description || `Telegram API error: HTTP ${response.status}`);
    }

    return { success: true, result: data.result };
  } catch (error) {
    console.warn(`[Telegram Alert] Failed to send message: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Extract lowest remaining percentage from quota data object
 */
export function extractRemainingPercentage(quotaData) {
  if (!quotaData) return null;
  if (typeof quotaData.percentage === "number") return quotaData.percentage;
  if (typeof quotaData.remainingPercentage === "number") return quotaData.remainingPercentage;

  // If quotas object with multiple limits exists (e.g. session, weekly, daily)
  const quotas = quotaData.quotas || (quotaData.raw && quotaData.raw.quotas);
  if (quotas && typeof quotas === "object") {
    let minPct = null;
    for (const q of Object.values(quotas)) {
      if (!q || q.unlimited) continue;
      let pct = null;
      if (typeof q.remainingPercentage === "number") {
        pct = q.remainingPercentage;
      } else if (typeof q.percentage === "number") {
        pct = q.percentage;
      } else if (typeof q.used === "number" && typeof q.total === "number" && q.total > 0) {
        pct = Math.max(0, Math.round(((q.total - q.used) / q.total) * 100));
      } else if (typeof q.remaining === "number" && typeof q.total === "number" && q.total > 0) {
        pct = Math.max(0, Math.round((q.remaining / q.total) * 100));
      }
      if (pct !== null) {
        minPct = minPct === null ? pct : Math.min(minPct, pct);
      }
    }
    if (minPct !== null) return minPct;
  }

  // Check top-level used & total
  if (typeof quotaData.used === "number" && typeof quotaData.total === "number" && quotaData.total > 0) {
    return Math.max(0, Math.round(((quotaData.total - quotaData.used) / quotaData.total) * 100));
  }

  return null;
}

/**
 * Find resetAt timestamp if available
 */
function extractResetAt(quotaData) {
  if (!quotaData) return null;
  if (quotaData.resetAt) return quotaData.resetAt;
  const quotas = quotaData.quotas || (quotaData.raw && quotaData.raw.quotas);
  if (quotas && typeof quotas === "object") {
    for (const q of Object.values(quotas)) {
      if (q?.resetAt) return q.resetAt;
    }
  }
  return null;
}

/**
 * Check if connection transitioned to a new color and send alert if changed
 * ONLY sends ONE notification per state transition.
 */
export async function checkAndAlertStatusTransition(connection, quotaData = null, options = {}) {
  if (!connection || !connection.id || connection.id === "noauth") return;

  try {
    const settings = await getSettings();
    if (!settings.telegramAlertsEnabled && !options.force) return;

    const remainingPercentage = extractRemainingPercentage(quotaData);
    const isUnavailable = connection.testStatus === "unavailable" || options.isUnavailable;
    const isLocked = options.isLocked || (connection.rateLimitedUntil && new Date(connection.rateLimitedUntil).getTime() > Date.now());

    // Determine current status color
    const currentColor = determineStatusColor(remainingPercentage, isLocked, isUnavailable);

    // Get previous status color (default to "green" if never recorded)
    const previousColor = connection.lastStatusColor || (connection.testStatus === "unavailable" ? "red" : "green");

    // If NO change in color status -> NO alert, zero spam!
    if (currentColor === previousColor) {
      return { transitioned: false, color: currentColor };
    }

    // Check event toggle filters
    const eventsConfig = settings.telegramEvents || {};
    let shouldSend = true;
    if (currentColor === "red" && eventsConfig.statusRed === false) shouldSend = false;
    if (currentColor === "yellow" && eventsConfig.statusYellow === false) shouldSend = false;
    if (currentColor === "green" && eventsConfig.statusGreen === false) shouldSend = false;

    // Update connection DB state immediately to avoid race condition duplicates
    await updateProviderConnection(connection.id, {
      lastStatusColor: currentColor,
      lastStatusColorUpdatedAt: new Date().toISOString(),
    });

    if (!shouldSend) {
      return { transitioned: true, from: previousColor, to: currentColor, suppressed: true };
    }

    // Format human connection details
    const connName = connection.displayName || connection.name || connection.email || `Tài khoản ${connection.id.slice(0, 8)}`;
    const providerName = (connection.provider || "Unknown").toUpperCase();
    const resetAt = options.resetAt || extractResetAt(quotaData);
    const resetFormatted = formatResetTime(resetAt);
    const oldMeta = COLOR_META[previousColor] || COLOR_META.green;
    const newMeta = COLOR_META[currentColor] || COLOR_META.green;

    const prefix = getTitlePrefix(settings, options.titlePrefix);
    let headerTitle = "";
    let statusNote = "";

    if (currentColor === "red") {
      headerTitle = `🔴 <b>${prefix} CẢNH BÁO TÀI KHOẢN CHUYỂN SANG ĐỎ</b>`;
      statusNote = isLocked
        ? `Tài khoản bị tạm khóa (Rate Limit / Lỗi upstream).`
        : `Hạn mức đã cạn kiệt hoặc dưới ngưỡng an toàn (0% - 29%).`;
    } else if (currentColor === "yellow") {
      headerTitle = `🟠 <b>${prefix} CẢNH BÁO TÀI KHOẢN CHUYỂN SANG CAM</b>`;
      statusNote = `Hạn mức đang tiêu hao (còn khoảng 30% - 70%). Vui lòng theo dõi.`;
    } else if (currentColor === "green") {
      headerTitle = `🟢 <b>${prefix} TÀI KHOẢN ĐÃ PHỤC HỒI (RESET QUOTA)</b>`;
      statusNote = `Hạn mức đã được nạp lại hoặc tài khoản đã được mở khóa an toàn.`;
    }

    const lines = [
      headerTitle,
      "",
      `• <b>Nhà cung cấp:</b> ${providerName}`,
      `• <b>Tài khoản:</b> <code>${connName}</code>`,
      `• <b>Thay đổi trạng thái:</b> ${oldMeta.emoji} ${oldMeta.textClass} ➔ ${newMeta.emoji} <b>${newMeta.textClass}</b>`,
    ];

    if (remainingPercentage !== null) {
      lines.push(`• <b>Hạn mức còn lại:</b> <b>${remainingPercentage}%</b>`);
    }

    if (resetFormatted) {
      lines.push(`• <b>Thời gian Reset dự kiến:</b> ${resetFormatted}`);
    }

    if (options.reason || statusNote) {
      lines.push(`• <b>Chi tiết:</b> <i>${options.reason || statusNote}</i>`);
    }

    const message = lines.join("\n");

    // Dispatch Telegram message in background (fail-open)
    sendTelegramMessage(message).catch((e) => {
      console.warn(`[Telegram Alert] Async dispatch error: ${e.message}`);
    });

    return { transitioned: true, from: previousColor, to: currentColor };
  } catch (error) {
    console.warn(`[Telegram Alert] checkAndAlertStatusTransition error: ${error.message}`);
  }
}

/**
 * Alert when ALL accounts for a provider are unavailable / down
 */
export async function alertAllAccountsDown({ provider, model = null, retryAfterHuman = null, lastError = null }) {
  try {
    const settings = await getSettings();
    if (!settings.telegramAlertsEnabled) return;
    if (settings.telegramEvents?.allAccountsDown === false) return;

    // Cooldown check (default 5 mins) to prevent burst alerts
    const cooldownMs = (settings.telegramCooldownMinutes || 5) * 60 * 1000;
    const cacheKey = `allDown:${provider}:${model || "all"}`;
    const lastSent = alertDedupeCache.get(cacheKey) || 0;
    if (Date.now() - lastSent < cooldownMs) return;

    alertDedupeCache.set(cacheKey, Date.now());

    const prefix = getTitlePrefix(settings);
    const providerName = (provider || "Unknown").toUpperCase();
    const lines = [
      `🚨 <b>${prefix} TOÀN BỘ TÀI KHOẢN KHÔNG KHẢ DỤNG</b>`,
      "",
      `• <b>Nhà cung cấp:</b> ${providerName}`,
      model ? `• <b>Model:</b> <code>${model}</code>` : null,
      `• <b>Trạng thái:</b> Tất cả tài khoản đang bị Rate Limit hoặc Gặp Lỗi`,
      retryAfterHuman ? `• <b>Thời gian phục hồi sớm nhất:</b> ~${retryAfterHuman}` : null,
      lastError ? `• <b>Lỗi gần nhất:</b> <i>${lastError}</i>` : null,
      "",
      `⚠️ <i>Hành động: Cần bổ sung thêm tài khoản mới hoặc sử dụng Combo dự phòng.</i>`,
    ].filter(Boolean);

    sendTelegramMessage(lines.join("\n")).catch(() => {});
  } catch (e) {
    console.warn(`[Telegram Alert] alertAllAccountsDown error: ${e.message}`);
  }
}

/**
 * Alert when OAuth token refresh failed and requires user intervention
 */
export async function alertAuthRefreshFailed({ provider, connectionName, error }) {
  try {
    const settings = await getSettings();
    if (!settings.telegramAlertsEnabled) return;
    if (settings.telegramEvents?.authRefreshFailed === false) return;

    const cooldownMs = (settings.telegramCooldownMinutes || 10) * 60 * 1000;
    const cacheKey = `refreshFail:${provider}:${connectionName}`;
    const lastSent = alertDedupeCache.get(cacheKey) || 0;
    if (Date.now() - lastSent < cooldownMs) return;

    alertDedupeCache.set(cacheKey, Date.now());

    const prefix = getTitlePrefix(settings);
    const lines = [
      `🔑 <b>${prefix} LỖI REFRESH TOKEN OAUTH</b>`,
      "",
      `• <b>Nhà cung cấp:</b> ${(provider || "Unknown").toUpperCase()}`,
      `• <b>Tài khoản:</b> <code>${connectionName || "Unknown"}</code>`,
      `• <b>Chi tiết lỗi:</b> <i>${error || "Không thể làm mới token"}</i>`,
      "",
      `👉 <i>Vui lòng truy cập Dashboard để đăng nhập kết nối lại tài khoản!</i>`,
    ];

    sendTelegramMessage(lines.join("\n")).catch(() => {});
  } catch (e) {
    console.warn(`[Telegram Alert] alertAuthRefreshFailed error: ${e.message}`);
  }
}

/**
 * Send a test notification to verify Telegram bot setup
 */
export async function testTelegramConnection({ botToken, chatId, topicId, titlePrefix }) {
  if (!botToken || !String(botToken).trim()) {
    throw new Error("Bot Token không được để trống.");
  }
  if (!chatId || !String(chatId).trim()) {
    throw new Error("Chat ID không được để trống.");
  }

  const prefix = getTitlePrefix(null, titlePrefix);
  const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const testMessage = [
    `🎉 <b>${prefix} THÔNG BÁO THỬ NGHIỆM THÀNH CÔNG!</b>`,
    "",
    `Hệ thống cảnh báo Telegram của bạn đã được kết nối chính xác với <b>${prefix.replace(/[\[\]]/g, "")}</b>.`,
    "",
    `• <b>Thời gian:</b> ${now}`,
    `• <b>Trạng thái:</b> Sẵn sàng gửi cảnh báo khi tài khoản đổi trạng thái Đỏ 🔴, Cam 🟠, Xanh 🟢.`,
  ].join("\n");

  const result = await sendTelegramMessage(testMessage, {
    botToken: botToken.trim(),
    chatId: chatId.trim(),
    topicId: topicId ? String(topicId).trim() : "",
    force: true,
  });

  if (!result.success) {
    throw new Error(result.error || "Gửi tin nhắn thử nghiệm thất bại.");
  }

  return { success: true };
}
