-- Rehearsals remain in the calendar and attendance roster, without inbox/push noise.
create function jc_private.omitir_avisos_ensayo() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.tipo='serie' or exists(select 1 from public.banda_eventos e where e.id=new.evento_id and e.tipo='ensayo') then return null;end if;
 return new;
end $$;
revoke all on function jc_private.omitir_avisos_ensayo() from public,anon,authenticated;
create trigger banda_silenciar_ensayos before insert on public.banda_avisos for each row execute function jc_private.omitir_avisos_ensayo();
-- Remove only obsolete rehearsal notices, never rehearsals, responses or attendance.
delete from public.banda_avisos a where a.tipo='serie' or exists(select 1 from public.banda_eventos e where e.id=a.evento_id and e.tipo='ensayo');
