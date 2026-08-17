import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getPreviousDayDateKey,
  getDailyStatsForDate,
  formatDailyReportMessage,
  sendDailyReport,
  runDailyReportSchedulerTick,
} from "@/lib/alerts/telegramDailyReport.js";
import * as localDb from "@/lib/localDb";
import * as dbDriver from "@/lib/db/driver.js";

describe("Telegram Daily Report Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("getPreviousDayDateKey", () => {
    it("returns yesterday date in YYYY-MM-DD format", () => {
      const date = new Date("2026-08-17T12:00:00Z");
      expect(getPreviousDayDateKey(date)).toBe("2026-08-16");
    });

    it("handles month rollover correctly (e.g. March 1 -> Feb 28)", () => {
      const date = new Date("2026-03-01T12:00:00Z");
      expect(getPreviousDayDateKey(date)).toBe("2026-02-28");
    });

    it("handles year rollover correctly (e.g. Jan 1 -> Dec 31)", () => {
      const date = new Date("2026-01-01T12:00:00Z");
      expect(getPreviousDayDateKey(date)).toBe("2025-12-31");
    });
  });

  describe("getDailyStatsForDate", () => {
    it("returns default zero values when no row exists", async () => {
      vi.spyOn(dbDriver, "getAdapter").mockResolvedValue({
        get: vi.fn().mockReturnValue(null),
      });

      const stats = await getDailyStatsForDate("2026-08-16");
      expect(stats).toEqual({
        dateKey: "2026-08-16",
        requests: 0,
        promptTokens: 0,
        cachedTokens: 0,
        completionTokens: 0,
        cost: 0,
        byProvider: {},
        byModel: {},
        apiKeys: [],
      });
    });

    it("parses stored data correctly when row exists", async () => {
      const sampleData = {
        requests: 125,
        promptTokens: 50000,
        cachedTokens: 20000,
        completionTokens: 15000,
        cost: 0.1234,
        byProvider: { codex: { requests: 125, cost: 0.1234 } },
        byApiKey: {
          "key123|gpt-4o|codex": {
            apiKey: "key123",
            requests: 125,
            promptTokens: 50000,
            cachedTokens: 20000,
            completionTokens: 15000,
            cost: 0.1234,
          },
        },
      };

      vi.spyOn(dbDriver, "getAdapter").mockResolvedValue({
        get: vi.fn().mockReturnValue({ data: JSON.stringify(sampleData) }),
        all: vi.fn().mockReturnValue([{ key: "key123", name: "llm1" }]),
      });

      const stats = await getDailyStatsForDate("2026-08-16");
      expect(stats.requests).toBe(125);
      expect(stats.promptTokens).toBe(50000);
      expect(stats.cachedTokens).toBe(20000);
      expect(stats.completionTokens).toBe(15000);
      expect(stats.cost).toBe(0.1234);
      expect(stats.apiKeys).toHaveLength(1);
      expect(stats.apiKeys[0].name).toBe("llm1");
      expect(stats.apiKeys[0].requests).toBe(125);
      expect(stats.apiKeys[0].totalTokens).toBe(65000);
    });
  });

  describe("formatDailyReportMessage", () => {
    it("formats HTML message with all required metrics, top providers, and API key breakdown", () => {
      const stats = {
        dateKey: "2026-08-16",
        requests: 1500,
        promptTokens: 250000,
        cachedTokens: 100000,
        completionTokens: 50000,
        cost: 1.25,
        byProvider: {
          codex: { requests: 1000, cost: 0.8 },
          anthropic: { requests: 500, cost: 0.45 },
        },
        apiKeys: [
          {
            name: "llm1",
            requests: 1315,
            promptTokens: 14038878,
            cachedTokens: 0,
            completionTokens: 139025,
            totalTokens: 14177903,
            cost: 16.8521,
          },
        ],
      };

      const msg = formatDailyReportMessage(stats, { titlePrefix: "[Server-HN]" });
      expect(msg).toContain("📊 <b>[Server-HN] BÁO CÁO THỐNG KÊ NGÀY (2026-08-16)</b>");
      expect(msg).toContain("• <b>Total Requests:</b> <code>1.500</code>");
      expect(msg).toContain("• <b>Total Input Tokens:</b> <code>250.000</code>");
      expect(msg).toContain("• <b>Cached Tokens:</b> <code>100.000</code>");
      expect(msg).toContain("• <b>Output Tokens:</b> <code>50.000</code>");
      expect(msg).toContain("• <b>Est. Cost:</b> <b>$1.2500</b>");
      expect(msg).toContain("🏆 <b>Top Providers:</b>");
      expect(msg).toContain("1. <b>CODEX</b>: 1.000 reqs ($0.8000)");
      expect(msg).toContain("2. <b>ANTHROPIC</b>: 500 reqs ($0.4500)");
      expect(msg).toContain("🔑 <b>Thống Kê Theo API Key:</b>");
      expect(msg).toContain("1. <b>llm1</b>");
      expect(msg).toContain("↳ <code>1.315</code> reqs · <code>14.177.903</code> tokens (In: <code>14.038.878</code> · Out: <code>139.025</code>) · <b>$16.8521</b>");
    });
  });

  describe("sendDailyReport", () => {
    it("does not send if telegramDailyReportEnabled is false and force is false", async () => {
      vi.spyOn(localDb, "getSettings").mockResolvedValue({
        telegramAlertsEnabled: true,
        telegramDailyReportEnabled: false,
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const result = await sendDailyReport({ force: false });
      expect(result.success).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("sends report when force is true even if disabled in settings", async () => {
      vi.spyOn(localDb, "getSettings").mockResolvedValue({
        telegramAlertsEnabled: false,
        telegramDailyReportEnabled: false,
        telegramBotToken: "mock-token",
        telegramChatId: "mock-chat",
      });

      vi.spyOn(dbDriver, "getAdapter").mockResolvedValue({
        get: vi.fn().mockReturnValue(null),
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 999 } }),
      });

      const result = await sendDailyReport({
        force: true,
        botToken: "test-token",
        chatId: "test-chat",
        titlePrefix: "MyProd",
        dateKey: "2026-08-16",
      });

      expect(result.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.telegram.org/bottest-token/sendMessage",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("[MyProd] BÁO CÁO THỐNG KÊ NGÀY (2026-08-16)"),
        })
      );
    });
  });

  describe("runDailyReportSchedulerTick", () => {
    it("fires when scheduled time matches and has not sent yet today", async () => {
      vi.spyOn(localDb, "getSettings").mockResolvedValue({
        telegramAlertsEnabled: true,
        telegramDailyReportEnabled: true,
        telegramDailyReportTime: "01:00",
        telegramBotToken: "mock-token",
        telegramChatId: "mock-chat",
      });

      vi.spyOn(dbDriver, "getAdapter").mockResolvedValue({
        get: vi.fn().mockReturnValue(null),
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 111 } }),
      });

      // Simulate 01:00 AM on 2026-08-17
      const simulatedNow = new Date("2026-08-17T01:00:00");
      await runDailyReportSchedulerTick(simulatedNow);

      expect(fetchSpy).toHaveBeenCalled();
    });

    it("does not fire when current time does not match scheduled time", async () => {
      vi.spyOn(localDb, "getSettings").mockResolvedValue({
        telegramAlertsEnabled: true,
        telegramDailyReportEnabled: true,
        telegramDailyReportTime: "01:00",
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // Simulate 02:30 AM
      const simulatedNow = new Date("2026-08-17T02:30:00");
      await runDailyReportSchedulerTick(simulatedNow);

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
