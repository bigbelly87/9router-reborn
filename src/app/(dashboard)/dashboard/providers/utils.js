export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "none", label: "No connection" },
];

// noAuth providers (e.g. free proxies) are always usable even though they
// never have a stored connection record, so they never fall into "none".
export function getConnectionStatus(stats, isNoAuth = false) {
  if (isNoAuth) return "active";
  if (!stats || stats.total === 0) return "none";
  return stats.allDisabled ? "inactive" : "active";
}

export function matchesStatusFilter(statusFilter, stats, isNoAuth = false) {
  if (statusFilter === "all") return true;
  return getConnectionStatus(stats, isNoAuth) === statusFilter;
}

export const CONNECTION_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "401", label: "Status 401 (Auth Expired)" },
  { value: "4xx", label: "Status 4xx (403, 429...)" },
  { value: "error", label: "All Errors" },
  { value: "inactive", label: "Disabled" },
];

const AUTH_KEYWORDS = [
  "unauthorized",
  "unauthenticated",
  "invalid_api_key",
  "invalid api key",
  "token expired",
  "jwt expired",
  "re-authorize",
  "token revoked",
  "session expired",
  "authentication",
];

export function isConnection401(conn, oneByOneResult = null) {
  if (!conn) return false;
  const code = Number(conn.errorCode || conn.lastErrorCode);
  if (code === 401) return true;
  if (conn.testStatus === "expired") return true;

  const errorText = `${conn.lastError || ""} ${oneByOneResult?.error || ""}`.toLowerCase();
  if (/\b401\b/.test(errorText)) return true;
  if (AUTH_KEYWORDS.some((kw) => errorText.includes(kw))) return true;
  return false;
}

export function isConnection4xx(conn, oneByOneResult = null) {
  if (!conn) return false;
  const code = Number(conn.errorCode || conn.lastErrorCode);
  if (code >= 400 && code < 500) return true;

  const errorText = `${conn.lastError || ""} ${oneByOneResult?.error || ""}`.toLowerCase();
  if (/\b4\d{2}\b/.test(errorText)) return true;
  if (errorText.includes("4xx")) return true;
  if (
    conn.testStatus === "expired" ||
    errorText.includes("unauthorized") ||
    errorText.includes("forbidden") ||
    errorText.includes("quota") ||
    errorText.includes("rate limit") ||
    errorText.includes("rate_limit") ||
    errorText.includes("too many requests")
  ) {
    return true;
  }
  return false;
}

export function isConnectionError(conn, oneByOneResult = null) {
  if (!conn) return false;
  if (isConnection4xx(conn, oneByOneResult)) return true;
  if (conn.testStatus === "error" || conn.testStatus === "expired" || conn.testStatus === "unavailable") return true;
  if (conn.errorCode || conn.lastErrorCode) return true;
  if (conn.lastError && String(conn.lastError).trim()) return true;
  if (oneByOneResult?.state === "failed") return true;
  return false;
}

export function matchesConnectionStatusFilter(statusFilter, conn, oneByOneResult = null) {
  if (!statusFilter || statusFilter === "all") return true;
  const is401 = isConnection401(conn, oneByOneResult);
  const is4xx = isConnection4xx(conn, oneByOneResult);
  const isErr = isConnectionError(conn, oneByOneResult);

  if (statusFilter === "401") return is401;
  if (statusFilter === "4xx") return is4xx && !is401;
  if (statusFilter === "error") return isErr;
  if (statusFilter === "active") return conn.isActive !== false && !isErr;
  if (statusFilter === "inactive") return conn.isActive === false;
  return true;
}


