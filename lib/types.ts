export type TodoStatus = "todo" | "in_progress" | "done";
export type TodoPriority = "low" | "medium" | "high";

export type Todo = {
  id: string;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  due_date: string | null;
  user_id: string;
  goal_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalType = "learning" | "work";
export type GoalStatus = "active" | "done";

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  type: GoalType;
  status: GoalStatus;
  created_at: string;
  completed_at: string | null;
};

export type GoalItem = {
  id: string;
  user_id: string;
  goal_id: string;
  title: string;
  group_name: string | null;
  note: string | null;
  is_done: boolean;
  position: number;
  completed_at: string | null;
};

export type IssueLog = {
  id: string;
  user_id: string;
  title: string;
  client_name: string | null;
  module: string | null;
  category: string | null;
  description: string;
  root_cause: string | null;
  resolution: string | null;
  date_resolved: string | null;
  created_at: string;
};

export type KbEntry = {
  id: string;
  user_id: string;
  module: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type KbSearchResult = {
  id: string;
  module: string;
  title: string;
  snippet: string;
  rank: number;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      todos: {
        Row: Todo;
        // user_id / goal_id / completed_at punya default di database (auth.uid(), null, trigger).
        Insert: Omit<Todo, "id" | "created_at" | "updated_at" | "user_id" | "goal_id" | "completed_at"> &
          Partial<Pick<Todo, "id" | "created_at" | "updated_at" | "user_id" | "goal_id" | "completed_at">>;
        Update: Partial<Omit<Todo, "id">>;
        Relationships: [];
      };
      goals: {
        Row: Goal;
        Insert: Pick<Goal, "title"> &
          Partial<Omit<Goal, "title" | "id" | "created_at">> &
          Partial<Pick<Goal, "id" | "created_at">>;
        Update: Partial<Omit<Goal, "id">>;
        Relationships: [];
      };
      goal_items: {
        Row: GoalItem;
        Insert: Pick<GoalItem, "goal_id" | "title"> &
          Partial<Omit<GoalItem, "goal_id" | "title" | "id">> &
          Partial<Pick<GoalItem, "id">>;
        Update: Partial<Omit<GoalItem, "id">>;
        Relationships: [];
      };
      issue_log: {
        Row: IssueLog;
        Insert: Omit<IssueLog, "id" | "created_at" | "user_id" | "module" | "root_cause"> &
          Partial<Pick<IssueLog, "id" | "created_at" | "user_id" | "module" | "root_cause">>;
        Update: Partial<Omit<IssueLog, "id">>;
        Relationships: [];
      };
      kb_entries: {
        Row: KbEntry;
        Insert: Omit<KbEntry, "id" | "created_at" | "updated_at"> &
          Partial<Pick<KbEntry, "id" | "created_at" | "updated_at">>;
        Update: Partial<Omit<KbEntry, "id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      kb_search: {
        Args: { search_query: string };
        Returns: KbSearchResult[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
