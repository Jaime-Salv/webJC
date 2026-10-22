-- Transactional integration: no real records modified; all fixtures rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); p int; m int;
begin
 perform set_config('jc.audit_admin',a::text,true); perform set_config('jc.audit_user',u::text,true);
 insert into auth.users(id,email) values(a,'audit-'||a||'@example.invalid'),(u,'audit-'||u||'@example.invalid');
 update public.perfiles set rol='admin' where id=a;
 insert into public.maestro_procesiones(tipo,fecha,hermandad,localidad,estado) values('Semana Santa',current_date,'Prueba auditoría','Prueba','Finalizada') returning id_procesion into p;
 insert into public.catalogo_marchas(titulo,autor) values('Prueba auditoría '||a,'Autor de prueba') returning id_marcha into m;
 perform set_config('jc.audit_event',p::text,true); perform set_config('jc.audit_march',m::text,true);
 insert into public.repertorio_transaccional(id_procesion,id_marcha,orden,fase) values(p,m,1,'Ida');
end $$;
set local role anon;
do $$ declare n int; begin
 assert (select count(*) from public.perfiles)=0,'Anon cannot list personal profiles';
 update public.repertorio_transaccional set fase='Vuelta' where id_procesion=current_setting('jc.audit_event')::int;
 get diagnostics n=row_count; assert n=0,'Anon cannot edit live entries';
end $$;
reset role;
set local role authenticated;
do $$
declare u uuid:=current_setting('jc.audit_user')::uuid; a uuid:=current_setting('jc.audit_admin')::uuid; p int:=current_setting('jc.audit_event')::int; m int:=current_setting('jc.audit_march')::int; n int; denied boolean;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 assert (select count(*) from public.perfiles)=1,'User sees own profile only';
 update public.repertorio_transaccional set fase='Vuelta' where id_procesion=p;
 get diagnostics n=row_count; assert n=0,'User cannot edit live entries';
 denied:=false;begin insert into public.repertorio_transaccional(id_procesion,id_marcha,orden) values(p,m,2); exception when insufficient_privilege then denied:=true; end;assert denied,'User cannot insert live entry';
 denied:=false;begin insert into public.directo_chat(id_procesion,usuario_id,usuario_nombre,mensaje) values(p,a,'Otro','Prueba'); exception when insufficient_privilege then denied:=true; end;assert denied,'Chat identity cannot be spoofed';
 denied:=false;begin insert into public.procesion_comentarios(id_procesion,usuario_id,usuario_nombre,comentario) values(p,a,'Otro','Prueba'); exception when insufficient_privilege then denied:=true; end;assert denied,'Comment identity cannot be spoofed';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 assert exists(select 1 from public.perfiles where id=u),'Admin can manage other profiles';
 insert into public.repertorio_transaccional(id_procesion,id_marcha,orden) values(p,m,2);
 update public.repertorio_transaccional set fase='Vuelta' where id_procesion=p and orden=2;
 get diagnostics n=row_count; assert n=1,'Admin can edit live entry';
 delete from public.repertorio_transaccional where id_procesion=p and orden=2;
 get diagnostics n=row_count; assert n=1,'Admin can delete live entry';
end $$;
rollback;
