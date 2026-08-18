import { NextResponse } from "next/server";
import { bulkUpdateProviderConnectionStatus } from "@/lib/localDb";

// PUT /api/providers/bulk-status - Bulk enable/disable provider connections
export async function PUT(request) {
  try {
    const body = await request.json();
    const { ids, isActive } = body;

    if (!Array.isArray(ids) || ids.length === 0 || typeof isActive !== "boolean") {
      return NextResponse.json(
        { error: "Invalid request payload: 'ids' must be a non-empty array and 'isActive' must be boolean" },
        { status: 400 }
      );
    }

    const updatedCount = await bulkUpdateProviderConnectionStatus(ids, isActive);
    return NextResponse.json({ success: true, updatedCount });
  } catch (error) {
    console.error("Error bulk updating provider connection status:", error);
    return NextResponse.json({ error: "Failed to update connection statuses" }, { status: 500 });
  }
}
