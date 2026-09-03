import { describe, expect, it } from "vitest";
import {
  CONNECTION_STATUS_FILTER_OPTIONS,
  isConnection4xx,
  isConnectionError,
  matchesConnectionStatusFilter,
} from "@/app/(dashboard)/dashboard/providers/utils.js";

describe("connection status filter utils", () => {
  it("exposes connection status filter options", () => {
    expect(CONNECTION_STATUS_FILTER_OPTIONS.map((o) => o.value)).toEqual([
      "all",
      "active",
      "4xx",
      "error",
      "inactive",
    ]);
  });

  describe("isConnection4xx", () => {
    it("detects 4xx numeric errorCode or lastErrorCode", () => {
      expect(isConnection4xx({ errorCode: 401 })).toBe(true);
      expect(isConnection4xx({ lastErrorCode: 429 })).toBe(true);
      expect(isConnection4xx({ errorCode: 403 })).toBe(true);
      expect(isConnection4xx({ errorCode: "404" })).toBe(true);
      expect(isConnection4xx({ errorCode: 500 })).toBe(false);
      expect(isConnection4xx({ errorCode: 200 })).toBe(false);
    });

    it("detects 4xx status in lastError message", () => {
      expect(isConnection4xx({ lastError: "Request failed with status code 401" })).toBe(true);
      expect(isConnection4xx({ lastError: "429 Too Many Requests" })).toBe(true);
      expect(isConnection4xx({ lastError: "403 Forbidden" })).toBe(true);
      expect(isConnection4xx({ lastError: "quota exceeded" })).toBe(true);
      expect(isConnection4xx({ lastError: "rate limit exceeded" })).toBe(true);
      expect(isConnection4xx({ lastError: "Token unauthorized" })).toBe(true);
      expect(isConnection4xx({ lastError: "Server Error 503" })).toBe(false);
    });

    it("detects 4xx status from one-by-one test failure", () => {
      expect(isConnection4xx({ lastError: "" }, { error: "429 Rate limit" })).toBe(true);
      expect(isConnection4xx({ lastError: "" }, { error: "Network timeout" })).toBe(false);
    });

    it("detects expired testStatus as 4xx auth expiry", () => {
      expect(isConnection4xx({ testStatus: "expired" })).toBe(true);
    });
  });

  describe("matchesConnectionStatusFilter", () => {
    const activeConn = { id: "1", isActive: true, testStatus: "active" };
    const disabledConn = { id: "2", isActive: false, testStatus: "active" };
    const error4xxConn = { id: "3", isActive: true, errorCode: 429, lastError: "429 Too Many Requests" };
    const error5xxConn = { id: "4", isActive: true, errorCode: 500, lastError: "500 Internal Server Error", testStatus: "error" };

    it("matches 'all' for any connection", () => {
      expect(matchesConnectionStatusFilter("all", activeConn)).toBe(true);
      expect(matchesConnectionStatusFilter("all", disabledConn)).toBe(true);
      expect(matchesConnectionStatusFilter("all", error4xxConn)).toBe(true);
      expect(matchesConnectionStatusFilter("all", error5xxConn)).toBe(true);
    });

    it("matches 'active' only for enabled non-error connections", () => {
      expect(matchesConnectionStatusFilter("active", activeConn)).toBe(true);
      expect(matchesConnectionStatusFilter("active", disabledConn)).toBe(false);
      expect(matchesConnectionStatusFilter("active", error4xxConn)).toBe(false);
      expect(matchesConnectionStatusFilter("active", error5xxConn)).toBe(false);
    });

    it("matches 'inactive' for disabled connections", () => {
      expect(matchesConnectionStatusFilter("inactive", disabledConn)).toBe(true);
      expect(matchesConnectionStatusFilter("inactive", activeConn)).toBe(false);
    });

    it("matches '4xx' for 4xx errors", () => {
      expect(matchesConnectionStatusFilter("4xx", error4xxConn)).toBe(true);
      expect(matchesConnectionStatusFilter("4xx", activeConn)).toBe(false);
      expect(matchesConnectionStatusFilter("4xx", error5xxConn)).toBe(false);
    });

    it("matches 'error' for any error (4xx and 5xx)", () => {
      expect(matchesConnectionStatusFilter("error", error4xxConn)).toBe(true);
      expect(matchesConnectionStatusFilter("error", error5xxConn)).toBe(true);
      expect(matchesConnectionStatusFilter("error", activeConn)).toBe(false);
    });
  });
});
