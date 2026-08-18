import { describe, expect, it } from "vitest";
import {
  calculateAccountHealthSummary,
  getAccountHealthStatus,
  getConnectionRemainingPercentage,
  sortVisibleConnections,
} from "../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

describe("Account Quota Health & Summary Utilities", () => {
  const mockQuotaData = {
    "conn-green": {
      quotas: [
        { name: "session", used: 10, total: 100, remainingPercentage: 90 },
      ],
    },
    "conn-yellow": {
      quotas: [
        { name: "session", used: 50, total: 100, remainingPercentage: 50 },
      ],
    },
    "conn-red": {
      quotas: [
        { name: "session", used: 90, total: 100, remainingPercentage: 10 },
      ],
    },
  };

  const connGreen = { id: "conn-green", provider: "codex", name: "Green Account", isActive: true };
  const connYellow = { id: "conn-yellow", provider: "claude", name: "Yellow Account", isActive: true };
  const connRed = { id: "conn-red", provider: "kiro", name: "Red Account", isActive: true };
  const connDisabled = { id: "conn-disabled", provider: "codex", name: "Disabled Account", isActive: false };
  const connError = { id: "conn-error", provider: "antigravity", name: "Error Account", isActive: true, testStatus: "error" };

  it("calculates correct remaining percentage for connections", () => {
    expect(getConnectionRemainingPercentage(connGreen, mockQuotaData)).toBe(90);
    expect(getConnectionRemainingPercentage(connYellow, mockQuotaData)).toBe(50);
    expect(getConnectionRemainingPercentage(connRed, mockQuotaData)).toBe(10);
    expect(getConnectionRemainingPercentage(connDisabled, mockQuotaData)).toBe(0);
    expect(getConnectionRemainingPercentage(connError, mockQuotaData)).toBe(0);
  });

  it("classifies account health status correctly (green >70%, yellow 30-70%, red <30%/disabled/error)", () => {
    expect(getAccountHealthStatus(connGreen, mockQuotaData)).toBe("green");
    expect(getAccountHealthStatus(connYellow, mockQuotaData)).toBe("yellow");
    expect(getAccountHealthStatus(connRed, mockQuotaData)).toBe("red");
    expect(getAccountHealthStatus(connDisabled, mockQuotaData)).toBe("red");
    expect(getAccountHealthStatus(connError, mockQuotaData)).toBe("red");
  });

  it("calculates summary count for green, yellow, and red accounts", () => {
    const connections = [connGreen, connYellow, connRed, connDisabled, connError];
    const summary = calculateAccountHealthSummary(connections, mockQuotaData);
    expect(summary).toEqual({
      green: 1,
      yellow: 1,
      red: 3,
      total: 5,
    });
  });

  it("sorts connections by remaining percentage ascending and descending across all providers", () => {
    const connections = [connGreen, connYellow, connRed];

    const asc = sortVisibleConnections(connections, mockQuotaData, false, "all", "remaining-asc");
    expect(asc.map((c) => c.id)).toEqual(["conn-red", "conn-yellow", "conn-green"]);

    const desc = sortVisibleConnections(connections, mockQuotaData, false, "all", "remaining-desc");
    expect(desc.map((c) => c.id)).toEqual(["conn-green", "conn-yellow", "conn-red"]);
  });
});
