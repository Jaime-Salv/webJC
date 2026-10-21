-- Integración transaccional: las publicaciones, usuarios y respuestas se revierten.
begin;
do $$
declare a uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
begin
 perform set_config('jc.test_admin',a::text,true);perform set_config('jc.test_musico',m::text,true);
 insert into auth.users(id,email) values(a,'jc-agenda-admin-'||a||'@example.invalid'),(m,'jc-agenda-musico-'||m||'@example.invalid');
 update public.perfiles set rol='admin' where id=a;update public.perfiles set rol='musico' where id=m;
end $$;
set local role authenticated;
do $$
declare a uuid:=current_setting('jc.test_admin')::uuid;m uuid:=current_setting('jc.test_musico')::uuid; r jsonb;eid uuid;rehearsal uuid;cid bigint;pid integer;denied boolean;d date:=(now() at time zone 'Europe/Madrid')::date+30;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 r:=public.banda_accion('ensayo','{"fecha":"2027-07-01","plantilla":"tarde"}');rehearsal:=(r->>'id')::uuid;
 assert exists(select 1 from public.banda_eventos where id=rehearsal and inicio='2027-07-01 18:30Z' and fin='2027-07-01 20:00Z' and lugar='Local de la banda' and latitud is null and longitud is null),'Ensayo tarde de verano sin coordenadas';
 r:=public.banda_accion('ensayo','{"fecha":"2027-01-01","plantilla":"manana"}');
 assert exists(select 1 from public.banda_eventos where id=(r->>'id')::uuid and inicio='2027-01-01 11:00Z' and fin='2027-01-01 13:00Z'),'Ensayo mañana de invierno';
 denied:=false;begin perform public.banda_accion('ensayo','{"fecha":"2027-07-01","plantilla":"tarde"}');exception when others then denied:=true;end;assert denied,'Ensayo duplicado rechazado';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
 denied:=false;begin perform public.banda_accion('respuesta',jsonb_build_object('evento_id',rehearsal,'respuesta','voy'));exception when others then denied:=true;end;assert denied,'No se admiten respuestas de ensayos';
 denied:=false;begin perform public.banda_accion('ensayo','{"fecha":"2027-07-02","plantilla":"tarde"}');exception when others then denied:=true;end;assert denied,'Músico no crea ensayo';
 assert (select count(*) from public.banda_ajustes)=0,'La ubicación habitual es solo de administración';
 denied:=false;begin insert into public.maestro_procesiones(hermandad,localidad,fecha,tipo,estado) values('No autorizado','Prueba',d,'Gloria','Programada');exception when others then denied:=true;end;assert denied,'Músico no publica procesiones';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 insert into public.conciertos(titulo,fecha,hora,fin_hora,lugar,estado) values('Concierto prueba',d,'20:00','22:00','Teatro','Borrador') returning id_concierto into cid;
 assert not exists(select 1 from public.banda_eventos where concierto_id=cid),'Borrador sin convocatoria';
 update public.conciertos set estado='Publicado' where id_concierto=cid;
 select id into eid from public.banda_eventos where concierto_id=cid;assert eid is not null,'Publicación genera convocatoria';
 assert exists(select 1 from public.banda_convocados where evento_id=eid and usuario_id=m),'Músico convocado al publicar';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
 perform public.banda_accion('respuesta',jsonb_build_object('evento_id',eid,'respuesta','voy'));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 update public.conciertos set titulo='Concierto actualizado',hora='21:00',fin_hora='00:30',lugar='Auditorio' where id_concierto=cid;
 assert (select count(*) from public.banda_eventos where concierto_id=cid)=1,'Edición idempotente';
 assert exists(select 1 from public.banda_eventos where id=eid and titulo='Concierto actualizado' and (fin at time zone 'Europe/Madrid')::date=d+1 and lugar='Auditorio'),'Cambios y cruce de medianoche sincronizados';
 assert exists(select 1 from public.banda_respuestas where evento_id=eid and usuario_id=m and respuesta='voy'),'Respuesta conservada al editar';
 perform public.banda_accion('cancelar',jsonb_build_object('evento_id',eid));
 assert (select estado from public.conciertos where id_concierto=cid)='Oculto','Cancelar retira publicación';
 assert (select estado from public.banda_eventos where id=eid)='cancelado','Convocatoria cancelada';
 update public.conciertos set estado='Publicado' where id_concierto=cid;
 assert (select id from public.banda_eventos where concierto_id=cid)=eid,'Republicar reutiliza evento';
 delete from public.conciertos where id_concierto=cid;
 assert (select estado from public.banda_eventos where id=eid)='cancelado','Borrar publicación conserva historial cancelado';
 insert into public.maestro_procesiones(hermandad,tipo,fecha,hora,fin_hora,localidad,lugar,estado) values('Procesión prueba','Gloria',d,'18:00','23:00','Localidad prueba','Plaza','Programada') returning id_procesion into pid;
 select id into eid from public.banda_eventos where procesion_id=pid;assert eid is not null,'Procesión genera convocatoria';
 update public.maestro_procesiones set estado='Activa' where id_procesion=pid;
 assert (select id from public.banda_eventos where procesion_id=pid)=eid,'Activar directo conserva identidad';
 update public.maestro_procesiones set estado='Finalizada' where id_procesion=pid;
 assert (select id from public.banda_eventos where procesion_id=pid)=eid,'Finalizar conserva historial';
 update public.maestro_procesiones set estado='Cancelada' where id_procesion=pid;
 assert (select estado from public.banda_eventos where id=eid)='cancelado','Cancelación de procesión sincronizada';
end $$;
rollback;
