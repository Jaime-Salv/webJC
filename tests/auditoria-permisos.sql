-- Existing records are only read or updated to identical values; rollback always.
begin;
do $$begin
 perform set_config('jc.audit_admin',(select id::text from public.perfiles where rol='admin' limit 1),true);
 perform set_config('jc.audit_user',(select id::text from public.perfiles where rol<>'admin' limit 1),true);
end $$;
set local role anon;
do $$begin assert (select count(*) from public.perfiles)=0;end $$;
reset role;
set local role authenticated;
do $$declare n int;begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('jc.audit_user'),'role','authenticated')::text,true);
 assert (select count(*) from public.perfiles)=1;
 update public.repertorio_transaccional set fase=fase;
 get diagnostics n=row_count;assert n=0;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('jc.audit_admin'),'role','authenticated')::text,true);
 assert public.es_admin();assert (select count(*) from public.perfiles)>1;
 update public.repertorio_transaccional set fase=fase where id_registro=(select id_registro from public.repertorio_transaccional limit 1);
 get diagnostics n=row_count;assert n=1;
end $$;
rollback;
