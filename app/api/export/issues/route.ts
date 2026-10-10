import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { endOfMonthISO, isYearMonth, todayISO } from "@/lib/date";
import { fetchAll, toCsv } from "@/lib/export";
import type { IssueLog } from "@/lib/types";

// CSV issue log. Tanpa parameter = semua issue. Parameter filter sama dengan halaman
// Issue Log (client, module, category, month_from, month_to), supaya tombol di sana
// mengekspor persis yang sedang terlihat.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams;
  const client = q.get("client");
  const moduleName = q.get("module");
  const category = q.get("category");
  const monthFrom = q.get("month_from");
  const monthTo = q.get("month_to");

  const supabase = await createClient();

  try {
    const issues = await fetchAll<IssueLog>((from, to) => {
      let query = supabase.from("issue_log").select("*");
      if (client && client !== "all") query = query.eq("client_name", client);
      if (moduleName && moduleName !== "all") query = query.eq("module", moduleName);
      if (category && category !== "all") query = query.eq("category", category);
      if (isYearMonth(monthFrom)) query = query.gte("date_resolved", `${monthFrom}-01`);
      if (isYearMonth(monthTo)) query = query.lte("date_resolved", endOfMonthISO(monthTo));
      return query
        .order("date_resolved", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
    });

    const csv = toCsv<IssueLog>(
      [
        { key: "date_resolved", label: "Date" },
        { key: "client_name", label: "Client" },
        { key: "module", label: "Module" },
        { key: "category", label: "Category" },
        { key: "title", label: "Title" },
        { key: "description", label: "Description" },
        { key: "root_cause", label: "Root Cause" },
        { key: "resolution", label: "Resolution" },
        { key: "created_at", label: "Created At" },
      ],
      issues,
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="issue-log-${todayISO()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed." },
      { status: 500 },
    );
  }
}
