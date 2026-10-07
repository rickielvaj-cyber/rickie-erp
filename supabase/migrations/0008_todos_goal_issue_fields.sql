-- Fase 1 tahap 1: kolom baru untuk To-Do (goal_id, completed_at) dan Issue Log (module, root_cause).

-- ---- todos ----------------------------------------------------------------
-- goal_id: to-do boleh dikaitkan ke satu Goal. Hapus goal -> to-do tetap ada (goal_id jadi null).
-- Mencentang to-do TIDAK mengubah goal atau goal_items (tidak ada trigger ke arah itu).
alter table public.todos
  add column if not exists goal_id uuid references public.goals (id) on delete set null,
  add column if not exists completed_at timestamptz;

create index if not exists todos_goal_id_idx on public.todos (goal_id);
create index if not exists todos_completed_at_idx on public.todos (completed_at);

-- Isi completed_at untuk to-do yang sudah selesai sebelum kolom ini ada: updated_at
-- adalah perkiraan terbaik kapan statusnya terakhir berubah (dulu /summary juga pakai itu).
update public.todos set completed_at = updated_at where status = 'done' and completed_at is null;

-- completed_at mengikuti status otomatis (selesai -> now(); batal selesai -> null).
create or replace function public.set_todo_completed_at()
returns trigger as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' then
      new.completed_at = coalesce(new.completed_at, now());
    elsif old.status is distinct from 'done' then
      new.completed_at = now();
    end if;
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists todos_set_completed_at on public.todos;
create trigger todos_set_completed_at
  before insert or update on public.todos
  for each row execute function public.set_todo_completed_at();

-- ---- issue_log --------------------------------------------------------------
alter table public.issue_log
  add column if not exists module text,
  add column if not exists root_cause text;

create index if not exists issue_log_module_idx on public.issue_log (module);

-- Kategori jadi 10 pilihan. NOT VALID = berlaku untuk insert/update baru saja, baris lama
-- dengan kategori bebas tidak diubah dan tidak dicek ulang. Konsekuensinya: kalau Anda
-- mengedit issue lama yang kategorinya di luar daftar, kategorinya harus diganti dulu.
alter table public.issue_log drop constraint if exists issue_log_category_check;
alter table public.issue_log
  add constraint issue_log_category_check check (
    category is null or category in (
      'System Issue', 'User Operation', 'Master Data', 'Configuration', 'Interface',
      'Report', 'Authorization', 'Data Issue', 'Enhancement Request', 'Other'
    )
  ) not valid;
