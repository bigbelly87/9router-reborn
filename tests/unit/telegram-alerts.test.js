import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  determineStatusColor,
  extractRemainingPercentage,
  checkAndAlertStatusTransition,
  testTelegramConnection,
  getTitlePrefix,
} from "@/lib/alerts/telegram.js";
import * as localDb from "@/lib/localDb";

describe("Telegram Alert Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("determineStatusColor", () => {
    it("returns green when percentage > 70", () => {
      expect(determineStatusColor(100)).toBe("green");
      expect(determineStatusColor(85)).toBe("green");
      expect(determineStatusColor(71)).toBe("green");
    });

    it("returns yellow when 30 <= percentage <= 70", () => {
      expect(determineStatusColor(70)).toBe("yellow");
      expect(determineStatusColor(50)).toBe("yellow");
      expect(determineStatusColor(30)).toBe("yellow");
    });

    it("returns red when percentage < 30", () => {
      expect(determineStatusColor(29)).toBe("red");
      expect(determineStatusColor(5)).toBe("red");
      expect(determineStatusColor(0)).toBe("red");
    });

    it("returns red when isLocked or isUnavailable is true", () => {
      expect(determineStatusColor(90, true, false)).toBe("red");
      expect(determineStatusColor(90, false, true)).toBe("red");
    });
  });

  describe("extractRemainingPercentage", () => {
    it("extracts from percentage property directly", () => {
      expect(extractRemainingPercentage({ percentage: 65 })).toBe(65);
    });

    it("extracts from remainingPercentage property", () => {
      expect(extractRemainingPercentage({ remainingPercentage: 45 })).toBe(45);
    });

    it("extracts lowest percentage from nested quotas object", () => {
      const quotaData = {
        quotas: {
          session: { used: 30, total: 100 }, // 70% remaining
          daily: { used: 80, total: 100 },   // 20% remaining
        },
      };
      expect(extractRemainingPercentage(quotaData)).toBe(20);
    });
  });

  describe("checkAndAlertStatusTransition", () => {
    it("does NOT alert when color does not change (same state)", async () => {
      const mockConn = {
        id: "conn-123",
        provider: "codex",
        lastStatusColor: "green",
      };

      vi.spyOn(localDb, "getSettings").mockResolvedValue({
        telegramAlertsEnabled: true,
        telegramBotToken: "mock-token",
        telegramChatId: "mock-chat",
      });

      const updateSpy = vi.spyOn(localDb, "updateProviderConnection").mockResolvedValue({});

      // 85% is green, same as lastStatusColor
      const result = await checkAndAlertStatusTransition(mockConn, { percentage: 85 });
      expect(result).toEqual({ transitioned: false, color: "green" });
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("alerts and updates DB when transitioning from green to yellow (30-70%)", async () => {
      const mockConn = {
        id: "conn-123",
        name: "test@example.com",
        provider: "codex",
        lastStatusColor: "green",
      };

      vi.spyOn(localDb, "getSettings").mockResolvedValue({
        telegramAlertsEnabled: true,
        telegramBotToken: "mock-token",
        telegramChatId: "mock-chat",
        telegramEvents: { statusYellow: true },
      });

      const updateSpy = vi.spyOn(localDb, "updateProviderConnection").mockResolvedValue({});
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      // 60% is yellow, transitioning from green
      const result = await checkAndAlertStatusTransition(mockConn, { percentage: 60 });
      expect(result).toEqual({ transitioned: true, from: "green", to: "yellow" });
      expect(updateSpy).toHaveBeenCalledWith("conn-123", expect.objectContaining({
        lastStatusColor: "yellow",
      }));
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("alerts and updates DB when transitioning from yellow to red (0-29% / locked)", async () => {
      const mockConn = {
        id: "conn-456",
        name: "test@example.com",
        provider: "codex",
        lastStatusColor: "yellow",
      };

      vi.spyOn(localDb, "getSettings").mockResolvedValue({
        telegramAlertsEnabled: true,
        telegramBotToken: "mock-token",
        telegramChatId: "mock-chat",
        telegramEvents: { statusRed: true },
      });

      const updateSpy = vi.spyOn(localDb, "updateProviderConnection").mockResolvedValue({});
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      // 0% is red, transitioning from yellow
      const result = await checkAndAlertStatusTransition(mockConn, { percentage: 0 });
      expect(result).toEqual({ transitioned: true, from: "yellow", to: "red" });
      expect(updateSpy).toHaveBeenCalledWith("conn-456", expect.objectContaining({
        lastStatusColor: "red",
      }));
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("alerts and updates DB when recovering from red back to green", async () => {
      const mockConn = {
        id: "conn-789",
        name: "test@example.com",
        provider: "codex",
        lastStatusColor: "red",
      };

      vi.spyOn(localDb, "getSettings").mockResolvedValue({
        telegramAlertsEnabled: true,
        telegramBotToken: "mock-token",
        telegramChatId: "mock-chat",
        telegramEvents: { statusGreen: true },
      });

      const updateSpy = vi.spyOn(localDb, "updateProviderConnection").mockResolvedValue({});
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      // 95% is green, recovering from red
      const result = await checkAndAlertStatusTransition(mockConn, { percentage: 95 });
      expect(result).toEqual({ transitioned: true, from: "red", to: "green" });
      expect(updateSpy).toHaveBeenCalledWith("conn-789", expect.objectContaining({
        lastStatusColor: "green",
      }));
      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  describe("testTelegramConnection", () => {
    it("throws error when bot token or chat ID is missing", async () => {
      await expect(testTelegramConnection({ botToken: "", chatId: "123" })).rejects.toThrow("Bot Token không được để trống.");
      await expect(testTelegramConnection({ botToken: "123", chatId: "" })).rejects.toThrow("Chat ID không được để trống.");
    });

    it("sends test message when credentials are provided", async () => {
      vi.spyOn(localDb, "getSettings").mockResolvedValue({
        telegramAlertsEnabled: false,
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      const result = await testTelegramConnection({ botToken: "test-token", chatId: "test-chat", titlePrefix: "ProdServer" });
      expect(result).toEqual({ success: true });
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.telegram.org/bottest-token/sendMessage",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("[ProdServer]"),
        })
      );
    });
  });

  describe("getTitlePrefix", () => {
    it("returns default [9Router] when not specified", () => {
      expect(getTitlePrefix({})).toBe("[9Router]");
      expect(getTitlePrefix(null)).toBe("[9Router]");
      expect(getTitlePrefix({ telegramTitlePrefix: "" })).toBe("[9Router]");
    });

    it("wraps custom title in brackets if not present", () => {
      expect(getTitlePrefix({ telegramTitlePrefix: "Server-HN" })).toBe("[Server-HN]");
      expect(getTitlePrefix(null, "My-Server")).toBe("[My-Server]");
    });

    it("preserves brackets if already present", () => {
      expect(getTitlePrefix({ telegramTitlePrefix: "[Prod-9Router]" })).toBe("[Prod-9Router]");
      expect(getTitlePrefix(null, "[Custom-Bot]")).toBe("[Custom-Bot]");
    });
  });
});
