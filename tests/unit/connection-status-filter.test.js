import { describe, expect, it } from "vitest";
import {
  CONNECTION_STATUS_FILTER_OPTIONS,
  isConnection401,
  isConnection4xx,
  isConnectionError,
  matchesConnectionStatusFilter,
} from "@/app/(dashboard)/dashboard/providers/utils.js";

describe("connection status filter utils", () => {
  it("exposes connection status filter options", () => {
    expect(CONNECTION_STATUS_FILTER_OPTIONS.map((o) => o.value)).toEqual([
      "all",
      "active",
      "401",
      "4xx",
      "error",
      "inactive",
    ]);
  });

  describe("isConnection401", () => {
    it("detects 401 numeric errorCode or lastErrorCode", () => {
      expect(isConnection401({ errorCode: 401 })).toBe(true);
      expect(isConnection401({ lastErrorCode: 401 })).toBe(true);
      expect(isConnection401({ errorCode: "401" })).toBe(true);
      expect(isConnection401({ errorCode: 429 })).toBe(false);
      expect(isConnection401({ errorCode: 403 })).toBe(false);
      expect(isConnection401({ errorCode: 500 })).toBe(false);
    });

    it("detects expired testStatus as 401 auth expiry", () => {
      expect(isConnection401({ testStatus: "expired" })).toBe(true);
    });

    it("detects 401 in lastError message", () => {
      expect(isConnection401({ lastError: "Request failed with status code 401" })).toBe(true);
      expect(isConnection401({ lastError: "Error 401: Unauthorized" })).toBe(true);
    });

    it("detects auth keywords in error message", () => {
      expect(isConnection401({ lastError: "Token unauthorized" })).toBe(true);
      expect(isConnection401({ lastError: "unauthenticated user" })).toBe(true);
      expect(isConnection401({ lastError: "invalid_api_key provided" })).toBe(true);
      expect(isConnection401({ lastError: "Invalid API Key" })).toBe(true);
      expect(isConnection401({ lastError: "token expired, please refresh" })).toBe(true);
      expect(isConnection401({ lastError: "jwt expired" })).toBe(true);
      expect(isConnection401({ lastError: "please re-authorize" })).toBe(true);
      expect(isConnection401({ lastError: "token revoked by provider" })).toBe(true);
      expect(isConnection401({ lastError: "session expired" })).toBe(true);
      expect(isConnection401({ lastError: "authentication failed" })).toBe(true);
    });

    it("does NOT match 429, 403, quota, rate limit as 401", () => {
      expect(isConnection401({ errorCode: 429, lastError: "429 Too Many Requests" })).toBe(false);
      expect(isConnection401({ errorCode: 403, lastError: "403 Forbidden" })).toBe(false);
      expect(isConnection401({ lastError: "quota exceeded" })).toBe(false);
      expect(isConnection401({ lastError: "rate limit exceeded" })).toBe(false);
      expect(isConnection401({ lastError: "capacity overloaded" })).toBe(false);
    });

    it("detects 401 from one-by-one test failure", () => {
      expect(isConnection401({ lastError: "" }, { error: "401 Unauthorized" })).toBe(true);
      expect(isConnection401({ lastError: "" }, { error: "429 Rate limit" })).toBe(false);
    });
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
    const auth401Conn = { id: "3", isActive: true, errorCode: 401, lastError: "Unauthorized" };
    const expiredConn = { id: "4", isActive: true, testStatus: "expired" };
    const error429Conn = { id: "5", isActive: true, errorCode: 429, lastError: "429 Too Many Requests" };
    const error403Conn = { id: "6", isActive: true, errorCode: 403, lastError: "403 Forbidden" };
    const error5xxConn = { id: "7", isActive: true, errorCode: 500, lastError: "500 Internal Server Error", testStatus: "error" };

    it("matches 'all' for any connection", () => {
      expect(matchesConnectionStatusFilter("all", activeConn)).toBe(true);
      expect(matchesConnectionStatusFilter("all", disabledConn)).toBe(true);
      expect(matchesConnectionStatusFilter("all", auth401Conn)).toBe(true);
      expect(matchesConnectionStatusFilter("all", expiredConn)).toBe(true);
      expect(matchesConnectionStatusFilter("all", error429Conn)).toBe(true);
      expect(matchesConnectionStatusFilter("all", error5xxConn)).toBe(true);
    });

    it("matches 'active' only for enabled non-error connections", () => {
      expect(matchesConnectionStatusFilter("active", activeConn)).toBe(true);
      expect(matchesConnectionStatusFilter("active", disabledConn)).toBe(false);
      expect(matchesConnectionStatusFilter("active", auth401Conn)).toBe(false);
      expect(matchesConnectionStatusFilter("active", expiredConn)).toBe(false);
      expect(matchesConnectionStatusFilter("active", error429Conn)).toBe(false);
      expect(matchesConnectionStatusFilter("active", error5xxConn)).toBe(false);
    });

    it("matches 'inactive' for disabled connections", () => {
      expect(matchesConnectionStatusFilter("inactive", disabledConn)).toBe(true);
      expect(matchesConnectionStatusFilter("inactive", activeConn)).toBe(false);
    });

    it("matches '401' for auth/expired errors only", () => {
      expect(matchesConnectionStatusFilter("401", auth401Conn)).toBe(true);
      expect(matchesConnectionStatusFilter("401", expiredConn)).toBe(true);
      expect(matchesConnectionStatusFilter("401", error429Conn)).toBe(false);
      expect(matchesConnectionStatusFilter("401", error403Conn)).toBe(false);
      expect(matchesConnectionStatusFilter("401", error5xxConn)).toBe(false);
      expect(matchesConnectionStatusFilter("401", activeConn)).toBe(false);
    });

    it("matches '4xx' for 4xx errors excluding 401 auth errors", () => {
      expect(matchesConnectionStatusFilter("4xx", error429Conn)).toBe(true);
      expect(matchesConnectionStatusFilter("4xx", error403Conn)).toBe(true);
      expect(matchesConnectionStatusFilter("4xx", auth401Conn)).toBe(false);
      expect(matchesConnectionStatusFilter("4xx", expiredConn)).toBe(false);
      expect(matchesConnectionStatusFilter("4xx", activeConn)).toBe(false);
      expect(matchesConnectionStatusFilter("4xx", error5xxConn)).toBe(false);
    });

    it("matches 'error' for any error (401, 4xx, and 5xx)", () => {
      expect(matchesConnectionStatusFilter("error", auth401Conn)).toBe(true);
      expect(matchesConnectionStatusFilter("error", expiredConn)).toBe(true);
      expect(matchesConnectionStatusFilter("error", error429Conn)).toBe(true);
      expect(matchesConnectionStatusFilter("error", error5xxConn)).toBe(true);
      expect(matchesConnectionStatusFilter("error", activeConn)).toBe(false);
    });
  });
});
