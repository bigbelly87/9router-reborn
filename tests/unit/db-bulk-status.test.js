import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-bulk-status-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("../../src/lib/db/index.js");
});

afterAll(() => {
  if (tempDir) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("DB bulkUpdateProviderConnectionStatus", () => {
  it("bulk disables and enables multiple provider connections atomically", async () => {
    const conn1 = await db.createProviderConnection({
      provider: "codex",
      name: "Conn 1",
      authType: "oauth",
      isActive: true,
    });
    const conn2 = await db.createProviderConnection({
      provider: "codex",
      name: "Conn 2",
      authType: "oauth",
      isActive: true,
    });
    const conn3 = await db.createProviderConnection({
      provider: "codex",
      name: "Conn 3",
      authType: "oauth",
      isActive: true,
    });

    expect(conn1.isActive).toBe(true);
    expect(conn2.isActive).toBe(true);

    // Disable conn1 and conn2 in bulk
    const updatedCountDisable = await db.bulkUpdateProviderConnectionStatus([conn1.id, conn2.id], false);
    expect(updatedCountDisable).toBe(2);

    const fetched1 = await db.getProviderConnectionById(conn1.id);
    const fetched2 = await db.getProviderConnectionById(conn2.id);
    const fetched3 = await db.getProviderConnectionById(conn3.id);

    expect(fetched1.isActive).toBe(false);
    expect(fetched2.isActive).toBe(false);
    expect(fetched3.isActive).toBe(true);

    // Enable conn1 back in bulk
    const updatedCountEnable = await db.bulkUpdateProviderConnectionStatus([conn1.id], true);
    expect(updatedCountEnable).toBe(1);

    const refetched1 = await db.getProviderConnectionById(conn1.id);
    expect(refetched1.isActive).toBe(true);
  });
});
