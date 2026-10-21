-- Status fase otomatis: mengikuti to-do di dalamnya.
--
-- Aturan (dihitung ulang setiap to-do dibuat, dihapus, diganti statusnya, atau dipindah fase):
--   * semua to-do fase itu selesai                       -> Done
--   * sebagian selesai, atau ada yang In progress        -> In progress
--   * belum ada yang dikerjakan                          -> status tidak berubah, kecuali fase yang tadinya Done
--                                                            (mendapat to-do terbuka baru atau dibuka lagi) -> In progress
--   * fase tanpa to-do sama sekali                       -> status tidak disentuh (tetap manual)
-- Status fase tetap bisa diubah dengan tangan (klik tombol statusnya); perubahan itu bertahan sampai ada perubahan
-- to-do berikutnya di fase itu.
--
-- Dilakukan di database (trigger) supaya berlaku di SEMUA jalur: centang di To-Do List, halaman proyek, papan mingguan,
-- form edit, hapus, dan pindah fase. Fungsi memakai hak pemanggil (security invoker), jadi RLS tetap berlaku: hanya fase
-- milik pengguna itu yang bisa berubah. Tidak ada data yang diubah saat migrasi ini dijalankan (tanpa backfill); fase
-- menyesuaikan diri saat to-do-nya berubah berikutnya.

create or replace function public.sync_phase_status(p_phase_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cur text;
  next_status text;
  total integer;
  finished integer;
  active integer;
begin
  if p_phase_id is null then
    return;
  end if;
  select status into cur from public.project_phases where id = p_phase_id;
  if not found then
    return;
  end if;

  select count(*),
         count(*) filter (where status = 'done'),
         count(*) filter (where status = 'in_progress')
    into total, finished, active
    from public.todos
   where phase_id = p_phase_id;

  if total = 0 then
    return;
  end if;

  if finished = total then
    next_status := 'done';
  elsif finished > 0 or active > 0 then
    next_status := 'in_progress';
  elsif cur = 'done' then
    next_status := 'in_progress';
  else
    next_status := cur;
  end if;

  if next_status is distinct from cur then
    update public.project_phases set status = next_status where id = p_phase_id;
  end if;
end;
$$;

create or replace function public.todos_sync_phase_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_phase_status(old.phase_id);
  elsif tg_op = 'INSERT' then
    perform public.sync_phase_status(new.phase_id);
  else
    if new.phase_id is distinct from old.phase_id then
      perform public.sync_phase_status(old.phase_id);
    end if;
    if new.phase_id is distinct from old.phase_id or new.status is distinct from old.status then
      perform public.sync_phase_status(new.phase_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists todos_sync_phase_status on public.todos;
create trigger todos_sync_phase_status
  after insert or delete or update of status, phase_id on public.todos
  for each row execute function public.todos_sync_phase_status();

revoke execute on function public.sync_phase_status(uuid) from public, anon;
revoke execute on function public.todos_sync_phase_status() from public, anon;
grant execute on function public.sync_phase_status(uuid) to authenticated;
grant execute on function public.todos_sync_phase_status() to authenticated;
