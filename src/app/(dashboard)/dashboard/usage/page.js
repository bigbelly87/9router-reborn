"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { UsageStats, RequestLogger, CardSkeleton, SegmentedControl } from "@/shared/components";
import RequestDetailsTab from "./components/RequestDetailsTab";
import TimeRangeSelector from "./components/TimeRangeSelector";

export default function UsagePage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [period, setPeriod] = useState(() => searchParams.get("period") || "today");
  const [startDate, setStartDate] = useState(() => searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState(() => searchParams.get("endDate") || "");

  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl && ["overview", "logs", "details"].includes(tabFromUrl)
    ? tabFromUrl
    : "overview";

  // Sync state if searchParams change externally (e.g. browser back/forward)
  useEffect(() => {
    setPeriod(searchParams.get("period") || "today");
    setStartDate(searchParams.get("startDate") || "");
    setEndDate(searchParams.get("endDate") || "");
  }, [searchParams]);

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  const handleTimeRangeChange = ({ period: p, startDate: s, endDate: e }) => {
    const newPeriod = p || "today";
    const newStart = s || "";
    const newEnd = e || "";

    setPeriod(newPeriod);
    setStartDate(newStart);
    setEndDate(newEnd);

    const params = new URLSearchParams(searchParams.toString());
    params.set("period", newPeriod);
    if (newStart) params.set("startDate", newStart);
    else params.delete("startDate");
    if (newEnd) params.set("endDate", newEnd);
    else params.delete("endDate");

    router.replace(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Tabs + TimeRangeSelector on top row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          options={[
            { value: "overview", label: "Overview" },
            { value: "details", label: "Details" },
          ]}
          value={activeTab}
          onChange={handleTabChange}
          className="w-full sm:w-auto"
        />
        <TimeRangeSelector
          period={period}
          startDate={startDate}
          endDate={endDate}
          onChange={handleTimeRangeChange}
        />
      </div>

      {activeTab === "overview" && (
        <Suspense fallback={<CardSkeleton />}>
          <UsageStats
            period={period}
            startDate={startDate}
            endDate={endDate}
            hidePeriodSelector
            onTimeRangeChange={handleTimeRangeChange}
          />
        </Suspense>
      )}
      {activeTab === "logs" && <RequestLogger />}
      {activeTab === "details" && (
        <RequestDetailsTab
          initialStartDate={startDate}
          initialEndDate={endDate}
        />
      )}
    </div>
  );
}
