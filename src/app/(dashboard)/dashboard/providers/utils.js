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

export function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function getConnectionStatusLabel(conn, oneByOneResult = null) {
  if (!conn) return "Unknown";
  if (conn.isActive === false) return "Disabled";
  if (isConnection401(conn, oneByOneResult)) return "Auth 401";
  if (isConnection4xx(conn, oneByOneResult)) return "Status 4xx";
  if (isConnectionError(conn, oneByOneResult)) return "Error";
  return "Active";
}

export function buildConnectionsCsv(connections, { oneByOneResults = {}, proxyPools = [] } = {}) {
  const headers = [
    "Index",
    "Name",
    "Email",
    "Provider",
    "Auth Type",
    "Status",
    "Active",
    "Error Code",
    "Last Error",
    "Last Error Time",
    "Proxy Pool",
    "Proxy URL",
    "Connection ID",
    "Created At",
  ];

  const proxyMap = new Map((proxyPools || []).map((p) => [p.id, p.name || p.id]));

  const rows = (connections || []).map((conn, idx) => {
    const oneByOne = oneByOneResults?.[conn.id];
    const statusLabel = getConnectionStatusLabel(conn, oneByOne);
    const poolId = conn.providerSpecificData?.proxyPoolId;
    const poolName = poolId ? (proxyMap.get(poolId) || poolId) : "";
    const proxyUrl = conn.providerSpecificData?.connectionProxyUrl || "";
    const lastErr = conn.lastError || oneByOne?.error || "";

    return [
      conn.priority != null ? conn.priority : idx + 1,
      conn.displayName || conn.name || "",
      conn.email || "",
      conn.provider || "",
      conn.authType || "",
      statusLabel,
      conn.isActive !== false ? "true" : "false",
      conn.errorCode || conn.lastErrorCode || "",
      lastErr,
      conn.lastErrorAt || "",
      poolName,
      proxyUrl,
      conn.id || "",
      conn.createdAt || "",
    ].map(escapeCsvField).join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
}

export function downloadCsvFile(csvContent, filename = "connections.csv") {
  if (typeof window === "undefined") return;
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}



