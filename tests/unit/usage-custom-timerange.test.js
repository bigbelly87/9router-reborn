import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-custom-range-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();

  // Seed some usage
  const now = Date.now();
  await db.saveRequestUsage({
    provider: "openai",
    model: "gpt-4o",
    connectionId: "conn-1",
    apiKey: "sk-1234567890abcdef",
    tokens: { prompt_tokens: 1500, completion_tokens: 300, cached_tokens: 500 },
    endpoint: "/v1/chat/completions",
    status: "ok",
    timestamp: new Date(now - 2 * 3600000).toISOString(),
  });

  await db.saveRequestUsage({
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    connectionId: "conn-2",
    apiKey: "sk-fedcba0987654321",
    tokens: { prompt_tokens: 2000, completion_tokens: 400, cached_tokens: 0 },
    endpoint: "/v1/messages",
    status: "ok",
    timestamp: new Date(now - 10 * 3600000).toISOString(),
  });
});

afterAll(() => {
  if (tempDir) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("Custom Date-Time Range Usage & Consistency Tests", () => {
  it("should query custom start and end date ranges correctly in getUsageStats", async () => {
    const stats = await db.getUsageStats({
      period: "custom",
      startDate: new Date(Date.now() - 5 * 3600000).toISOString(),
      endDate: new Date().toISOString(),
    });

    expect(stats).toBeDefined();
    expect(stats.totalPromptTokens).toBe(1500);
    expect(stats.totalCompletionTokens).toBe(300);
    expect(stats.totalCachedTokens).toBe(500);
    expect(stats.byModel["gpt-4o (openai)"]).toBeDefined();
    expect(stats.byModel["gpt-4o (openai)"].promptTokens).toBe(1500);

    // API Key entries should contain masked keys
    const apiKeyEntries = Object.values(stats.byApiKey);
    expect(apiKeyEntries.length).toBeGreaterThanOrEqual(1);
    expect(apiKeyEntries[0].apiKeyMasked).toBe("sk-12345***");
  });

  it("should generate 5-minute buckets for short custom ranges under 3 hours in getChartData", async () => {
    const start = new Date(Date.now() - 1 * 3600000).toISOString();
    const end = new Date().toISOString();
    const buckets = await db.getChartData({
      period: "custom",
      startDate: start,
      endDate: end,
    });

    expect(Array.isArray(buckets)).toBe(true);
    expect(buckets.length).toBe(12);
    expect(buckets[0]).toHaveProperty("label");
    expect(buckets[0]).toHaveProperty("tokens");
    expect(buckets[0]).toHaveProperty("cost");
  });

  it("should generate hourly buckets for custom ranges under 48 hours in getChartData", async () => {
    const start = new Date(Date.now() - 24 * 3600000).toISOString();
    const end = new Date().toISOString();
    const buckets = await db.getChartData({
      period: "custom",
      startDate: start,
      endDate: end,
    });

    expect(Array.isArray(buckets)).toBe(true);
    expect(buckets.length).toBe(24);
    expect(buckets[0]).toHaveProperty("label");
    expect(buckets[0]).toHaveProperty("tokens");
    expect(buckets[0]).toHaveProperty("cost");
  });

  it("should generate daily buckets for custom ranges over 48 hours in getChartData", async () => {
    const start = new Date(Date.now() - 5 * 86400000).toISOString();
    const end = new Date().toISOString();
    const buckets = await db.getChartData({
      period: "custom",
      startDate: start,
      endDate: end,
    });

    expect(Array.isArray(buckets)).toBe(true);
    expect(buckets.length).toBe(5);
    expect(buckets[0]).toHaveProperty("label");
  });

  it("should filter request details with account and apiKey mapping in getRequestDetails", async () => {
    const res = await db.getRequestDetails({
      page: 1,
      pageSize: 10,
    });

    expect(res).toBeDefined();
    expect(res).toHaveProperty("details");
    expect(res).toHaveProperty("pagination");
    expect(Array.isArray(res.details)).toBe(true);
  });
});
