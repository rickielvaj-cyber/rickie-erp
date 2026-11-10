import { z } from "zod";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { addDaysISO, isISODate, mondayOfISO, todayISO } from "@/lib/date";
import { ISSUE_CATEGORIES, defaultIssueTitle } from "@/lib/issues";
import { currentPhase, sortPhases } from "@/lib/projects";
import { buildPlanText, buildSummaryText } from "@/lib/summary";
import { createUserClient } from "./supabase";

// Tools MCP. Semua dijalankan dengan klien Supabase milik pengguna (RLS berlaku).
// Sengaja TIDAK ada tool hapus. Tanggal "hari ini"/batas minggu memakai Asia/Jakarta (lib/date).

const TIME_ZONE = "Asia/Jakarta";
const WIB = "+07:00";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const TODO_STATUSES = ["todo", "in_progress", "done"] as const;
const PRIORITIES = ["low", "medium", "high"] as const;

const dateString = (what: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${what} must be YYYY-MM-DD`)
    .refine(isISODate, `${what} is not a valid calendar date`);
const idString = (what: string) => z.guid(`${what} must be a UUID`);
const limitField = z
  .number()
  .int()
  .min(1)
  .max(MAX_LIMIT)
  .optional()
  .describe(`Maximum rows to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`);

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Klien Supabase atas nama pemanggil; token berasal dari withMcpAuth (sudah divalidasi). */
function dbFor(ctx: ServerContext) {
  const token = ctx.http?.authInfo?.token;
  if (!token) throw new Error("Not authenticated.");
  return createUserClient(token);
}

/** Bungkus handler: galat tak terduga jadi hasil isError (bukan crash) tanpa membocorkan detail internal. */
function guarded<A>(fn: (args: A, ctx: ServerContext) => Promise<CallToolResult>) {
  return async (args: A, ctx: ServerContext): Promise<CallToolResult> => {
    try {
      return await fn(args, ctx);
    } catch (error) {
      console.error("mcp tool error:", error instanceof Error ? error.message : error);
      return fail("The request failed. Please try again.");
    }
  };
}

/** Escape karakter khusus LIKE supaya input pengguna dicocokkan apa adanya. */
const likeEscape = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export function registerTools(server: McpServer) {
  // ---------------------------------------------------------------- To-dos
  server.registerTool(
    "list_todos",
    {
      title: "List to-dos",
      description:
        "List the user's to-do items, ordered by due date (undated last). " +
        "status: 'open' (default) = todo + in_progress, 'all', or one of todo / in_progress / done. " +
        "Optionally filter by goal_id. Dates are YYYY-MM-DD in Asia/Jakarta time; the response includes today's date.",
      inputSchema: z.object({
        status: z
          .enum(["open", "all", ...TODO_STATUSES])
          .optional()
          .describe("Which to-dos to return. Default 'open' (todo and in_progress)."),
        goal_id: idString("goal_id").optional().describe("Only to-dos linked to this goal (get ids from list_goals)."),
        limit: limitField,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded(async ({ status = "open", goal_id, limit = DEFAULT_LIMIT }, ctx) => {
      const db = dbFor(ctx);
      let query = db
        .from("todos")
        .select("id, title, description, status, priority, due_date, goal_id, project_id, completed_at, created_at")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(limit);
      if (status === "open") query = query.in("status", ["todo", "in_progress"]);
      else if (status !== "all") query = query.eq("status", status);
      if (goal_id) query = query.eq("goal_id", goal_id);
      const { data, error } = await query;
      if (error) return fail(`Could not load to-dos: ${error.message}`);
      return ok({ today: todayISO(), timezone: TIME_ZONE, count: data.length, todos: data });
    }),
  );

  server.registerTool(
    "add_todo",
    {
      title: "Add a to-do",
      description:
        "Create a new to-do (status 'todo'). Optionally set a description, priority (default medium), " +
        "due_date (YYYY-MM-DD, Asia/Jakarta) and link it to a goal via goal_id. " +
        "Does not create a calendar block.",
      inputSchema: z.object({
        title: z.string().trim().min(1).max(300).describe("Short title of the to-do."),
        description: z.string().trim().max(5000).optional().describe("Optional details."),
        priority: z.enum(PRIORITIES).optional().describe("Default 'medium'."),
        due_date: dateString("due_date").optional().describe("Due date, YYYY-MM-DD. Omit for no date."),
        goal_id: idString("goal_id").optional().describe("Link to this goal (ids from list_goals)."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    guarded(async ({ title, description, priority = "medium", due_date, goal_id }, ctx) => {
      const db = dbFor(ctx);
      if (goal_id) {
        const { data: goal, error } = await db.from("goals").select("id").eq("id", goal_id).maybeSingle();
        if (error) return fail(`Could not check the goal: ${error.message}`);
        if (!goal) return fail("Goal not found. Use list_goals to get a valid goal_id.");
      }
      const { data, error } = await db
        .from("todos")
        .insert({
          title,
          description: description || null,
          status: "todo",
          priority,
          due_date: due_date ?? null,
          ...(goal_id ? { goal_id } : {}),
        })
        .select("id, title, description, status, priority, due_date, goal_id")
        .single();
      if (error) return fail(`Could not add the to-do: ${error.message}`);
      return ok({ created: data });
    }),
  );

  server.registerTool(
    "complete_todo",
    {
      title: "Complete a to-do",
      description:
        "Mark one to-do as done (completion time is recorded automatically). Does nothing else: " +
        "goals and goal items are not changed. Get the id from list_todos.",
      inputSchema: z.object({ id: idString("id").describe("The to-do's id.") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guarded(async ({ id }, ctx) => {
      const db = dbFor(ctx);
      const { data, error } = await db
        .from("todos")
        .update({ status: "done" })
        .eq("id", id)
        .select("id, title, status, completed_at")
        .maybeSingle();
      if (error) return fail(`Could not complete the to-do: ${error.message}`);
      if (!data) return fail("To-do not found.");
      return ok({ completed: data });
    }),
  );

  // ----------------------------------------------------------------- Goals
  server.registerTool(
    "list_goals",
    {
      title: "List goals",
      description:
        "List the user's goals, each with its checklist items (ordered by position) and a progress count. " +
        "status: 'active' (default), 'done' or 'all'.",
      inputSchema: z.object({
        status: z.enum(["active", "done", "all"]).optional().describe("Default 'active'."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded(async ({ status = "active" }, ctx) => {
      const db = dbFor(ctx);
      let goalsQuery = db
        .from("goals")
        .select("id, title, description, type, status, created_at, completed_at")
        .order("created_at", { ascending: true });
      if (status !== "all") goalsQuery = goalsQuery.eq("status", status);
      const { data: goals, error } = await goalsQuery;
      if (error) return fail(`Could not load goals: ${error.message}`);
      if (goals.length === 0) return ok({ count: 0, goals: [] });

      const { data: items, error: itemsError } = await db
        .from("goal_items")
        .select("id, goal_id, title, group_name, note, is_done, position, completed_at")
        .in(
          "goal_id",
          goals.map((g) => g.id),
        )
        .order("position", { ascending: true });
      if (itemsError) return fail(`Could not load goal items: ${itemsError.message}`);

      const result = goals.map((goal) => {
        const own = (items ?? []).filter((item) => item.goal_id === goal.id);
        return {
          ...goal,
          progress: { done: own.filter((i) => i.is_done).length, total: own.length },
          items: own.map(({ goal_id, ...rest }) => {
            void goal_id;
            return rest;
          }),
        };
      });
      return ok({ count: result.length, goals: result });
    }),
  );

  // ---------------------------------------------------------------- Issues
  server.registerTool(
    "list_issues",
    {
      title: "List issues",
      description:
        "List entries of the user's issue log, newest resolved date first. Filter by date resolved " +
        "(date_from / date_to, inclusive, YYYY-MM-DD) and/or client (case-insensitive substring of the client name). " +
        "Returns client, module, category, description, root cause and resolution.",
      inputSchema: z.object({
        date_from: dateString("date_from").optional().describe("Earliest date resolved, YYYY-MM-DD."),
        date_to: dateString("date_to").optional().describe("Latest date resolved, YYYY-MM-DD."),
        client: z.string().trim().min(1).max(200).optional().describe("Part of the client name, e.g. 'nagiya'."),
        limit: limitField,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded(async ({ date_from, date_to, client, limit = DEFAULT_LIMIT }, ctx) => {
      if (date_from && date_to && date_from > date_to) return fail("date_from must not be after date_to.");
      const db = dbFor(ctx);
      let query = db
        .from("issue_log")
        .select("id, title, client_name, module, category, description, root_cause, resolution, date_resolved, created_at")
        .order("date_resolved", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (date_from) query = query.gte("date_resolved", date_from);
      if (date_to) query = query.lte("date_resolved", date_to);
      if (client) query = query.ilike("client_name", `%${likeEscape(client)}%`);
      const { data, error } = await query;
      if (error) return fail(`Could not load issues: ${error.message}`);
      return ok({ timezone: TIME_ZONE, count: data.length, issues: data });
    }),
  );

  server.registerTool(
    "add_issue",
    {
      title: "Add an issue",
      description:
        "Record a resolved issue in the issue log. 'description' is required. 'client' must match an existing " +
        "client (canonical name or alias, case-insensitive) so the name is stored exactly as in the client list; " +
        "otherwise the call fails. 'category' must be one of the allowed values. date_resolved defaults to today " +
        "(Asia/Jakarta). The title defaults to the first line of the description.",
      inputSchema: z.object({
        description: z.string().trim().min(1).max(10000).describe("What the issue was."),
        client: z.string().trim().min(1).max(200).optional().describe("Client name or alias."),
        module: z.string().trim().min(1).max(100).optional().describe("ERP module, e.g. 'General Ledger'."),
        category: z.enum(ISSUE_CATEGORIES).optional().describe("Issue category."),
        root_cause: z.string().trim().max(5000).optional().describe("Why it happened."),
        resolution: z.string().trim().max(5000).optional().describe("How it was resolved."),
        title: z.string().trim().max(300).optional().describe("Internal label; defaults to the description's first line."),
        date_resolved: dateString("date_resolved").optional().describe("YYYY-MM-DD; defaults to today."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    guarded(async ({ description, client, module, category, root_cause, resolution, title, date_resolved }, ctx) => {
      const db = dbFor(ctx);

      let clientFields: { client_id: string; client_name: string } | null = null;
      if (client) {
        const { data: clients, error } = await db.from("clients").select("id, canonical_name, aliases");
        if (error) return fail(`Could not check the client: ${error.message}`);
        const wanted = client.toLowerCase();
        const match = (clients ?? []).find(
          (c) => c.canonical_name.toLowerCase() === wanted || (c.aliases ?? []).some((a) => a.toLowerCase() === wanted),
        );
        if (!match) return fail(`Client "${client}" was not found. Add it under Clients in the app first, or omit 'client'.`);
        clientFields = { client_id: match.id, client_name: match.canonical_name };
      }

      const { data, error } = await db
        .from("issue_log")
        .insert({
          title: title || defaultIssueTitle(description),
          description,
          module: module ?? null,
          category: category ?? null,
          root_cause: root_cause || null,
          resolution: resolution || null,
          date_resolved: date_resolved ?? todayISO(),
          client_id: clientFields?.client_id ?? null,
          client_name: clientFields?.client_name ?? null,
        })
        .select("id, title, client_name, module, category, date_resolved")
        .single();
      if (error) return fail(`Could not add the issue: ${error.message}`);
      return ok({ created: data });
    }),
  );

  // -------------------------------------------------------- Weekly summary
  server.registerTool(
    "get_weekly_summary",
    {
      title: "Get weekly summary",
      description:
        "Build the Weekly Summary report (tasks completed, issues handled, project status) for the Monday-Friday " +
        "week containing week_start, plus the plan for the following week. week_start is any date YYYY-MM-DD " +
        "(snapped to that week's Monday); default = the current week in Asia/Jakarta. " +
        "Calendar time blocks (Google Calendar) are not included.",
      inputSchema: z.object({
        week_start: dateString("week_start").optional().describe("Any date in the wanted week; default = this week."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded(async ({ week_start }, ctx) => {
      const db = dbFor(ctx);
      const weekStart = mondayOfISO(week_start ?? todayISO());
      const weekEnd = addDaysISO(weekStart, 4);
      const nextStart = addDaysISO(weekStart, 7);
      const nextEnd = addDaysISO(weekStart, 11);

      // Query yang sama dengan halaman /summary (tanpa bagian kalender Google).
      const [done, issues, plan, goals, projects, phases, clients] = await Promise.all([
        db
          .from("todos")
          .select("title, goal_id, project_id, phase_id")
          .eq("status", "done")
          .gte("completed_at", `${weekStart}T00:00:00${WIB}`)
          .lt("completed_at", `${addDaysISO(weekEnd, 1)}T00:00:00${WIB}`)
          .order("completed_at", { ascending: true }),
        db
          .from("issue_log")
          .select("title, client_name, module")
          .gte("date_resolved", weekStart)
          .lte("date_resolved", weekEnd)
          .order("date_resolved", { ascending: true })
          .order("created_at", { ascending: true }),
        db
          .from("todos")
          .select("title, goal_id, project_id, phase_id, due_date")
          .neq("status", "done")
          .not("due_date", "is", null)
          .lte("due_date", nextEnd)
          .order("due_date", { ascending: true }),
        db.from("goals").select("id, title"),
        db.from("projects").select("id, name, client_id, status, target_date"),
        db.from("project_phases").select("*"),
        db.from("clients").select("id, canonical_name"),
      ]);
      const failed = [done, issues, plan, goals, projects, phases, clients].find((r) => r.error);
      if (failed?.error) return fail(`Could not build the summary: ${failed.error.message}`);

      const goalTitles = new Map((goals.data ?? []).map((g) => [g.id, g.title]));
      const clientNames = new Map((clients.data ?? []).map((c) => [c.id, c.canonical_name]));
      const allProjects = projects.data ?? [];
      const projectNames = new Map(
        allProjects.map((p) => {
          const client = clientNames.get(p.client_id);
          return [p.id, client ? `${client} — ${p.name}` : p.name] as const;
        }),
      );
      const phaseRows = phases.data ?? [];
      const phaseNames = new Map(phaseRows.map((ph) => [ph.id, ph.name]));
      const goalOf = (id: string | null) => (id ? (goalTitles.get(id) ?? null) : null);
      const projectOf = (id: string | null) => (id ? (projectNames.get(id) ?? null) : null);
      const phaseOf = (id: string | null) => (id ? (phaseNames.get(id) ?? null) : null);

      const projectStatus = allProjects
        .filter((p) => p.status !== "done" && p.status !== "planning")
        .map((p) => {
          const own = sortPhases(phaseRows.filter((ph) => ph.project_id === p.id));
          return {
            name: p.name,
            clientName: clientNames.get(p.client_id) ?? null,
            currentPhase: currentPhase(own)?.name ?? null,
            phasesDone: own.filter((ph) => ph.status === "done").length,
            phasesTotal: own.length,
            targetDate: p.target_date,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      const summary = buildSummaryText({
        weekStart,
        weekEnd,
        done: (done.data ?? []).map((t) => ({
          title: t.title,
          goalTitle: goalOf(t.goal_id),
          projectTitle: projectOf(t.project_id),
          phaseTitle: phaseOf(t.phase_id),
        })),
        issues: (issues.data ?? []).map((i) => ({ client: i.client_name, module: i.module, title: i.title })),
        projects: projectStatus,
        timeBlocks: null,
      });
      const planText = buildPlanText({
        nextStart,
        nextEnd,
        tasks: (plan.data ?? []).map((t) => ({
          title: t.title,
          dueDate: t.due_date,
          goalTitle: goalOf(t.goal_id),
          projectTitle: projectOf(t.project_id),
          phaseTitle: phaseOf(t.phase_id),
        })),
      });

      return ok({
        timezone: TIME_ZONE,
        week: { start: weekStart, end: weekEnd },
        next_week: { start: nextStart, end: nextEnd },
        counts: { tasks_completed: done.data?.length ?? 0, issues_handled: issues.data?.length ?? 0 },
        summary,
        plan: planText,
      });
    }),
  );
}
