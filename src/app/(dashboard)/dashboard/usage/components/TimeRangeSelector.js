"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

function formatToLocalDatetime(isoOrDate) {
  if (!isoOrDate) return "";
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDisplayRange(startStr, endStr) {
  if (!startStr && !endStr) return "";
  const start = startStr ? new Date(startStr) : null;
  const end = endStr ? new Date(endStr) : null;

  const fmtDate = (d) => {
    if (!d || isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  if (start && end) return `${fmtDate(start)} — ${fmtDate(end)}`;
  if (start) return `From ${fmtDate(start)}`;
  if (end) return `Until ${fmtDate(end)}`;
  return "";
}

function toIsoSafe(dtStr) {
  if (!dtStr) return "";
  if (typeof dtStr === "string" && (dtStr.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(dtStr))) {
    const d = new Date(dtStr);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }
  const d = new Date(dtStr);
  if (!isNaN(d.getTime())) return d.toISOString();
  const d2 = new Date(dtStr + ":00");
  if (!isNaN(d2.getTime())) return d2.toISOString();
  return "";
}

export default function TimeRangeSelector({
  period = "today",
  startDate = "",
  endDate = "",
  onChange,
  disabled = false,
}) {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [localStart, setLocalStart] = useState(formatToLocalDatetime(startDate));
  const [localEnd, setLocalEnd] = useState(formatToLocalDatetime(endDate));
  const customRef = useRef(null);

  // Sync internal inputs when external startDate/endDate props change
  useEffect(() => {
    setLocalStart(formatToLocalDatetime(startDate));
    setLocalEnd(formatToLocalDatetime(endDate));
  }, [startDate, endDate]);

  // Click outside to close custom popover
  useEffect(() => {
    function handleClickOutside(event) {
      if (customRef.current && !customRef.current.contains(event.target)) {
        setIsCustomOpen(false);
      }
    }
    if (isCustomOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isCustomOpen]);

  const isCustomActive = period === "custom" && Boolean(startDate || endDate);

  const handlePresetClick = (presetVal) => {
    setIsCustomOpen(false);
    if (onChange) {
      onChange({ period: presetVal, startDate: "", endDate: "" });
    }
  };

  const handleCustomToggle = () => {
    if (!isCustomOpen) {
      // If current inputs are empty, default to today 00:00 to now
      if (!localStart && !startDate) {
        const s = new Date();
        s.setHours(0, 0, 0, 0);
        setLocalStart(formatToLocalDatetime(s));
      } else if (startDate) {
        setLocalStart(formatToLocalDatetime(startDate));
      }

      if (!localEnd && !endDate) {
        setLocalEnd(formatToLocalDatetime(new Date()));
      } else if (endDate) {
        setLocalEnd(formatToLocalDatetime(endDate));
      }
      setIsCustomOpen(true);
    } else {
      setIsCustomOpen(false);
    }
  };

  const handleApplyCustom = () => {
    if (!localStart && !localEnd) return;

    let sIso = toIsoSafe(localStart);
    let eIso = toIsoSafe(localEnd);

    // If both provided but start > end, swap them
    if (sIso && eIso && new Date(sIso) > new Date(eIso)) {
      const temp = sIso;
      sIso = eIso;
      eIso = temp;
      setLocalStart(formatToLocalDatetime(sIso));
      setLocalEnd(formatToLocalDatetime(eIso));
    }

    setIsCustomOpen(false);
    if (onChange) {
      onChange({
        period: "custom",
        startDate: sIso,
        endDate: eIso,
      });
    }
  };

  const handleShortcut = (shortcutKey) => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    switch (shortcutKey) {
      case "1h":
        start = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case "6h":
        start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case "12h":
        start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        break;
      case "24h":
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "today":
        start.setHours(0, 0, 0, 0);
        break;
      case "yesterday": {
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case "7d":
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "thisMonth":
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;
      default:
        break;
    }

    const sStr = formatToLocalDatetime(start);
    const eStr = formatToLocalDatetime(end);
    setLocalStart(sStr);
    setLocalEnd(eStr);
    setIsCustomOpen(false);

    if (onChange) {
      onChange({
        period: "custom",
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
    }
  };

  const handleReset = () => {
    setLocalStart("");
    setLocalEnd("");
    setIsCustomOpen(false);
    if (onChange) {
      onChange({ period: "today", startDate: "", endDate: "" });
    }
  };

  const displayBadge = useMemo(() => {
    if (isCustomActive) {
      return formatDisplayRange(startDate, endDate);
    }
    return null;
  }, [isCustomActive, startDate, endDate]);

  return (
    <div className="flex flex-col gap-2.5 sm:self-end" ref={customRef}>
      {/* Presets Bar + Custom Trigger */}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <div className="grid flex-1 grid-cols-5 items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1 sm:flex sm:flex-none">
          {PRESETS.map((p) => {
            const active = period === p.value;
            return (
              <button
                key={p.value}
                onClick={() => handlePresetClick(p.value)}
                disabled={disabled}
                type="button"
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition-all duration-150",
                  active
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-muted hover:bg-bg-hover hover:text-text"
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleCustomToggle}
          disabled={disabled}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150",
            period === "custom" || isCustomOpen
              ? "border-primary/40 bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30"
              : "border-border bg-bg-subtle text-text-muted hover:border-border-strong hover:bg-bg-hover hover:text-text"
          )}
        >
          <span className="material-symbols-outlined text-[16px]">calendar_month</span>
          <span>Custom</span>
          {displayBadge && (
            <span className="hidden md:inline rounded bg-primary/20 px-1.5 py-0.5 text-[11px] font-mono font-medium text-primary">
              {displayBadge}
            </span>
          )}
        </button>
      </div>

      {/* Collapsible Custom Date-Time Picker Box */}
      {isCustomOpen && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-surface/95 p-3.5 shadow-lg backdrop-blur-sm transition-all duration-200 animate-in fade-in slide-in-from-top-2 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-main">
              <span className="material-symbols-outlined text-[16px] text-primary">schedule</span>
              <span>Filter by Custom Time Range</span>
            </div>
            {displayBadge && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-mono font-medium text-primary border border-primary/20">
                {displayBadge}
              </span>
            )}
          </div>

          {/* DateTime Inputs */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">From (Start Date & Time)</label>
              <input
                type="datetime-local"
                value={localStart}
                onChange={(e) => setLocalStart(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-xs font-mono text-text-main focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">To (End Date & Time)</label>
              <input
                type="datetime-local"
                value={localEnd}
                onChange={(e) => setLocalEnd(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-xs font-mono text-text-main focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Quick Range Shortcuts */}
          <div className="flex flex-wrap items-center gap-1 pt-1">
            <span className="text-[11px] font-medium text-text-muted mr-1">Quick:</span>
            {[
              { id: "1h", label: "1h" },
              { id: "6h", label: "6h" },
              { id: "12h", label: "12h" },
              { id: "24h", label: "24h" },
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "7d", label: "7d" },
              { id: "30d", label: "30d" },
              { id: "thisMonth", label: "This Month" },
            ].map((sc) => (
              <button
                key={sc.id}
                type="button"
                onClick={() => handleShortcut(sc.id)}
                className="rounded-md border border-border/70 bg-bg-subtle px-2 py-0.5 text-[11px] font-medium text-text-muted hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-colors"
              >
                {sc.label}
              </button>
            ))}
          </div>

          {/* Buttons: Apply / Reset / Close */}
          <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-2.5">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-bg-hover hover:text-text transition-colors"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleApplyCustom}
              disabled={!localStart && !localEnd}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[15px]">check</span>
              <span>Apply Range</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

TimeRangeSelector.propTypes = {
  period: PropTypes.string,
  startDate: PropTypes.string,
  endDate: PropTypes.string,
  onChange: PropTypes.func,
  disabled: PropTypes.bool,
};
