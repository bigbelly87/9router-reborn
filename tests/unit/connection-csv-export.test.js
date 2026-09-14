import { describe, expect, it } from "vitest";
import {
  escapeCsvField,
  getConnectionStatusLabel,
  buildConnectionsCsv,
} from "@/app/(dashboard)/dashboard/providers/utils.js";

describe("connection CSV export utils", () => {
  describe("escapeCsvField", () => {
    it("handles simple text without special characters", () => {
      expect(escapeCsvField("hello")).toBe("hello");
      expect(escapeCsvField(123)).toBe("123");
    });

    it("returns empty string for null and undefined", () => {
      expect(escapeCsvField(null)).toBe("");
      expect(escapeCsvField(undefined)).toBe("");
    });

    it("escapes fields containing commas", () => {
      expect(escapeCsvField("hello, world")).toBe('"hello, world"');
    });

    it("escapes fields containing quotes", () => {
      expect(escapeCsvField('hello "world"')).toBe('"hello ""world"""');
    });

    it("escapes fields containing newlines", () => {
      expect(escapeCsvField("line 1\nline 2")).toBe('"line 1\nline 2"');
    });
  });

  describe("getConnectionStatusLabel", () => {
    it("returns Disabled when isActive is false", () => {
      expect(getConnectionStatusLabel({ isActive: false })).toBe("Disabled");
    });

    it("returns Auth 401 when errorCode is 401 or lastError has auth keywords", () => {
      expect(getConnectionStatusLabel({ isActive: true, errorCode: 401 })).toBe("Auth 401");
      expect(getConnectionStatusLabel({ isActive: true, testStatus: "expired" })).toBe("Auth 401");
      expect(getConnectionStatusLabel({ isActive: true, lastError: "unauthorized request" })).toBe("Auth 401");
    });

    it("returns Status 4xx when errorCode is 429 or 403", () => {
      expect(getConnectionStatusLabel({ isActive: true, errorCode: 429 })).toBe("Status 4xx");
      expect(getConnectionStatusLabel({ isActive: true, errorCode: 403 })).toBe("Status 4xx");
      expect(getConnectionStatusLabel({ isActive: true, lastError: "quota exceeded" })).toBe("Status 4xx");
    });

    it("returns Error when errorCode is 500 or testStatus is error", () => {
      expect(getConnectionStatusLabel({ isActive: true, errorCode: 500 })).toBe("Error");
      expect(getConnectionStatusLabel({ isActive: true, testStatus: "error" })).toBe("Error");
    });

    it("returns Active when connection is healthy", () => {
      expect(getConnectionStatusLabel({ isActive: true, testStatus: "active" })).toBe("Active");
    });
  });

  describe("buildConnectionsCsv", () => {
    const mockConnections = [
      {
        id: "conn-1",
        priority: 1,
        name: "Main Claude Account",
        email: "claude@example.com",
        provider: "claude",
        authType: "oauth",
        isActive: true,
        testStatus: "active",
        createdAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "conn-2",
        priority: 2,
        name: "Expired Account",
        email: "expired@example.com",
        provider: "claude",
        authType: "oauth",
        isActive: true,
        errorCode: 401,
        lastError: "Token expired, please re-login",
        lastErrorAt: "2026-09-14T10:00:00Z",
        providerSpecificData: { proxyPoolId: "pool-us-1" },
        createdAt: "2026-09-02T00:00:00Z",
      },
      {
        id: "conn-3",
        priority: 3,
        name: "Rate Limited Account",
        email: "ratelimit@example.com",
        provider: "claude",
        authType: "apikey",
        isActive: true,
        errorCode: 429,
        lastError: "429 Too Many Requests",
        createdAt: "2026-09-03T00:00:00Z",
      },
    ];

    const mockProxyPools = [
      { id: "pool-us-1", name: "US Residential Proxy" },
    ];

    it("generates CSV with header and correct rows", () => {
      const csv = buildConnectionsCsv(mockConnections, { proxyPools: mockProxyPools });
      const lines = csv.split("\r\n");

      expect(lines[0]).toBe(
        "Index,Name,Email,Provider,Auth Type,Status,Active,Error Code,Last Error,Last Error Time,Proxy Pool,Proxy URL,Connection ID,Created At"
      );

      expect(lines[1]).toContain("Main Claude Account");
      expect(lines[1]).toContain("Active");

      expect(lines[2]).toContain("Expired Account");
      expect(lines[2]).toContain("Auth 401");
      expect(lines[2]).toContain("US Residential Proxy");
      expect(lines[2]).toContain('"Token expired, please re-login"');

      expect(lines[3]).toContain("Rate Limited Account");
      expect(lines[3]).toContain("Status 4xx");
    });

    it("handles empty connections array gracefully", () => {
      const csv = buildConnectionsCsv([]);
      expect(csv).toBe("Index,Name,Email,Provider,Auth Type,Status,Active,Error Code,Last Error,Last Error Time,Proxy Pool,Proxy URL,Connection ID,Created At");
    });
  });
});
