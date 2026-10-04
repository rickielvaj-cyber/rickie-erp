export type TodoStatus = "todo" | "in_progress" | "done";
export type TodoPriority = "low" | "medium" | "high";

export type Todo = {
  id: string;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

export type IssueLog = {
  id: string;
  title: string;
  client_name: string | null;
  category: string | null;
  description: string;
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
        Insert: Omit<Todo, "id" | "created_at" | "updated_at"> &
          Partial<Pick<Todo, "id" | "created_at" | "updated_at">>;
        Update: Partial<Omit<Todo, "id">>;
        Relationships: [];
      };
      issue_log: {
        Row: IssueLog;
        Insert: Omit<IssueLog, "id" | "created_at"> &
          Partial<Pick<IssueLog, "id" | "created_at">>;
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
