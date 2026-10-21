-- Portal músico: datos internos, justificantes, avisos, repetición e informes.
create table public.banda_detalles(
 evento_id uuid primary key references public.banda_eventos(id) on delete cascade,
 convocatoria timestamptz, uniformidad text not null default '' check(length(uniformidad)<=1000),
 transporte text not null default '' check(length(transporte)<=2000), encuentro text not null default '' check(length(encuentro)<=1000),
 partituras text not null default '' check(length(partituras)<=2000), contacto text not null default '' check(length(contacto)<=1000),
 objetivos jsonb not null default '{}' check(jsonb_typeof(objetivos)='object'), actualizado_en timestamptz not null default now()
);
create table public.banda_justificaciones(
 evento_id uuid not null,usuario_id uuid not null,motivo text not null check(length(trim(motivo)) between 5 and 2000),
 estado text not null default 'pendiente' check(estado in ('pendiente','aceptada','rechazada')),
 revision text not null default '' check(length(revision)<=1000),revisado_por uuid references public.perfiles(id),actualizado_en timestamptz not null default now(),
 primary key(evento_id,usuario_id),foreign key(evento_id,usuario_id) references public.banda_convocados(evento_id,usuario_id) on delete cascade
);
create table public.banda_avisos(
 id bigint generated always as identity primary key,usuario_id uuid not null references public.perfiles(id) on delete cascade,
 evento_id uuid references public.banda_eventos(id) on delete cascade,tipo text not null,titulo text not null,mensaje text not null,
 clave text not null unique,creado_en timestamptz not null default now(),leido_en timestamptz,
 push_estado text not null default 'pendiente',intentos integer not null default 0,push_en timestamptz
);
create index banda_avisos_usuario on public.banda_avisos(usuario_id,creado_en desc);
create index banda_avisos_cola on public.banda_avisos(creado_en) where push_estado in ('pendiente','error','procesando');
create table public.banda_push(
 endpoint text primary key check(length(endpoint)<=2000),usuario_id uuid not null references public.perfiles(id) on delete cascade,
 p256dh text not null,auth text not null,actualizado_en timestamptz not null default now()
);
create index banda_push_usuario on public.banda_push(usuario_id);
alter table public.banda_detalles enable row level security;
alter table public.banda_justificaciones enable row level security;
alter table public.banda_avisos enable row level security;
alter table public.banda_push enable row level security;
revoke all on public.banda_detalles,public.banda_justificaciones,public.banda_avisos,public.banda_push from anon,authenticated;
grant select on public.banda_detalles,public.banda_justificaciones,public.banda_avisos to authenticated;
grant all on public.banda_push,public.banda_avisos to service_role;
create policy detalles_convocados on public.banda_detalles for select to authenticated using(exists(select 1 from public.banda_eventos e where e.id=evento_id));
create policy justificaciones_propias on public.banda_justificaciones for select to authenticated using((select public.es_admin()) or (usuario_id=(select auth.uid()) and exists(select 1 from public.perfiles p where p.id=(select auth.uid()) and p.es_musico)));
create policy avisos_propios on public.banda_avisos for select to authenticated using(usuario_id=(select auth.uid()) and exists(select 1 from public.perfiles p where p.id=(select auth.uid()) and (p.es_musico or p.rol='admin')));
-- The service-only push table has no client policies intentionally.
create or replace function jc_private.avisar_convocatoria() returns trigger language plpgsql security definer set search_path='' as $$
declare eid uuid; mensaje text;titulo_ev text;clave_ev text;
begin
 if TG_TABLE_NAME='banda_convocados' then
  select titulo into titulo_ev from public.banda_eventos where id=new.evento_id;
  insert into public.banda_avisos(usuario_id,evento_id,tipo,titulo,mensaje,clave)
  values(new.usuario_id,new.evento_id,'convocatoria','Nueva convocatoria',titulo_ev,'convocatoria:'||new.evento_id||':'||new.usuario_id) on conflict(clave) do nothing;
  return new;
 elsif TG_TABLE_NAME='banda_eventos' then
  if row(new.titulo,new.inicio,new.fin,new.lugar,new.notas,new.estado) is not distinct from row(old.titulo,old.inicio,old.fin,old.lugar,old.notas,old.estado) then return new; end if;
  eid:=new.id;titulo_ev:=case when new.estado='cancelado' then 'Convocatoria cancelada' else 'Convocatoria actualizada' end;
  mensaje:=new.titulo||'. Revisa los detalles y tu confirmación en el portal.';
 else
  if TG_OP='UPDATE' and to_jsonb(new)-'actualizado_en' is not distinct from to_jsonb(old)-'actualizado_en' then return new; end if;
  eid:=new.evento_id;titulo_ev:='Información de convocatoria';
  select titulo||'. Se ha actualizado la información para músicos.' into mensaje from public.banda_eventos where id=eid;
 end if;
 clave_ev:=eid||':'||TG_TABLE_NAME||':'||clock_timestamp()::text;
 insert into public.banda_avisos(usuario_id,evento_id,tipo,titulo,mensaje,clave)
 select c.usuario_id,eid,'cambio',titulo_ev,mensaje,clave_ev||':'||c.usuario_id from public.banda_convocados c join public.perfiles p on p.id=c.usuario_id where c.evento_id=eid and p.es_musico;
 return new;
end $$;
revoke all on function jc_private.avisar_convocatoria() from public,anon,authenticated;
create trigger banda_convocatoria_aviso after insert on public.banda_convocados for each row execute function jc_private.avisar_convocatoria();
create trigger banda_evento_aviso after update on public.banda_eventos for each row execute function jc_private.avisar_convocatoria();
create trigger banda_detalle_aviso after insert or update on public.banda_detalles for each row execute function jc_private.avisar_convocatoria();
create or replace function jc_private.banda_portal_accion(p_accion text,p_datos jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();admin boolean;musico boolean;eid uuid;uid uuid;ev public.banda_eventos%rowtype;
 datos jsonb;v text;k text;n int;d_desde date;d_hasta date;dia date;fecha_conv timestamptz;creados int:=0;omitidos int:=0;resultado jsonb;
begin
 if actor is null then raise exception 'Inicia sesión.';end if;
 select rol='admin',es_musico into admin,musico from public.perfiles where id=actor;
 if not coalesce(admin,false) and not coalesce(musico,false) then raise exception 'Acceso exclusivo al portal de músicos.';end if;
 if p_accion in ('detalle','revisar','repetir','recordar') and not coalesce(admin,false) then raise exception 'Solo administración puede realizar esta acción.';end if;
 if p_accion='leer' then
  update public.banda_avisos set leido_en=now() where usuario_id=actor and (nullif(p_datos->>'id','') is null or id=(p_datos->>'id')::bigint) and leido_en is null;
  return jsonb_build_object('ok',true);
 elsif p_accion='informe' then
  d_desde:=coalesce(nullif(p_datos->>'desde','')::date,date_trunc('year',now())::date);d_hasta:=coalesce(nullif(p_datos->>'hasta','')::date,(now() at time zone 'Europe/Madrid')::date);
  if d_hasta<d_desde or d_hasta-d_desde>1830 then raise exception 'Elige un período válido de hasta cinco años.';end if;
  uid:=case when admin then nullif(p_datos->>'usuario_id','')::uuid else actor end;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into resultado from (
   select c.usuario_id,coalesce(nullif(f.nombre,''),p.nombre_completo,p.username,'Sin nombre') nombre,coalesce(nullif(trim(f.instrumento),''),'Sin instrumento') instrumento,e.tipo,
   count(*) total,count(*) filter(where a.estado='presente') presentes,
   count(*) filter(where a.estado='ausente') ausentes,
   count(*) filter(where a.estado='justificada' or (a.estado is null and j.estado='aceptada')) justificadas,
   count(*) filter(where a.estado='incidencia') incidencias,
   count(*) filter(where a.estado is null and coalesce(j.estado,'')<>'aceptada') sin_fichaje
   from public.banda_convocados c join public.banda_eventos e on e.id=c.evento_id join public.perfiles p on p.id=c.usuario_id
   left join public.banda_fichas f on f.usuario_id=c.usuario_id left join public.banda_asistencias a on a.evento_id=c.evento_id and a.usuario_id=c.usuario_id
   left join public.banda_justificaciones j on j.evento_id=c.evento_id and j.usuario_id=c.usuario_id
   where e.estado='publicado' and e.fin<=now() and (e.inicio at time zone 'Europe/Madrid')::date between d_desde and d_hasta and (uid is null or c.usuario_id=uid)
   group by c.usuario_id,p.nombre_completo,p.username,f.nombre,f.instrumento,e.tipo order by nombre,e.tipo
  ) x;
  return resultado;
 elsif p_accion='repetir' then
  d_desde:=(p_datos->>'desde')::date;d_hasta:=(p_datos->>'hasta')::date;
  if d_desde is null or d_hasta is null or d_hasta<d_desde or d_hasta-d_desde>183 then raise exception 'Elige un período de hasta seis meses.';end if;
  if coalesce(p_datos->>'plantilla','') not in ('manana','tarde') or jsonb_typeof(p_datos->'dias') is distinct from 'array' or jsonb_array_length(p_datos->'dias') not between 1 and 7 then raise exception 'Selecciona plantilla y días de la semana.';end if;
  for v in select jsonb_array_elements_text(p_datos->'dias') loop if v !~ '^[0-6]$' then raise exception 'Día de la semana no válido.';end if;end loop;
  for dia in select generate_series(d_desde,d_hasta,interval '1 day')::date loop
   if exists(select 1 from jsonb_array_elements_text(p_datos->'dias') as z(value) where z.value::int=extract(dow from dia)::int)
   and not coalesce(p_datos->'excluir','[]') @> jsonb_build_array(dia::text) then
    fecha_conv:=(dia+case when p_datos->>'plantilla'='tarde' then time '20:30' else time '12:00' end) at time zone 'Europe/Madrid';
    perform pg_advisory_xact_lock(hashtextextended('ensayo:'||dia::text||':'||(p_datos->>'plantilla'),0));
    if exists(select 1 from public.banda_eventos e2 where e2.tipo='ensayo' and e2.estado='publicado' and e2.inicio=fecha_conv) then omitidos:=omitidos+1;
    else perform public.banda_accion('ensayo',jsonb_build_object('fecha',dia,'plantilla',p_datos->>'plantilla'));creados:=creados+1;end if;
    if creados+omitidos>60 then raise exception 'Selecciona como máximo 60 ensayos por tanda.';end if;
   end if;
  end loop;
  return jsonb_build_object('creados',creados,'existentes',omitidos);
 end if;
 eid:=nullif(p_datos->>'evento_id','')::uuid;select * into ev from public.banda_eventos where id=eid for update;
 if not found then raise exception 'Convocatoria no encontrada.';end if;
 if not admin and not exists(select 1 from public.banda_convocados where evento_id=eid and usuario_id=actor) then raise exception 'No estás convocado.';end if;
 if p_accion='detalle' then
  fecha_conv:=coalesce(nullif(p_datos->>'convocatoria','')::timestamptz,ev.inicio);
  if fecha_conv>ev.inicio or fecha_conv<ev.inicio-interval '7 days' then raise exception 'La convocatoria debe ser anterior al d_desde público y estar dentro de los siete días anteriores.';end if;
  if ev.fichaje_abierto then raise exception 'Cierra el fichaje antes de cambiar los detalles.';end if;
  datos:=coalesce(p_datos->'objetivos','{}');if jsonb_typeof(datos)<>'object' or length(datos::text)>6000 then raise exception 'Objetivos por instrumento no válidos.';end if;
  for k,v in select * from jsonb_each_text(datos) loop
   if length(trim(k)) not between 1 and 80 or v !~ '^[0-9]{1,3}$' or v::int>200 then raise exception 'Cada objetivo debe ser un número de 0 a 200.';end if;
  end loop;
  insert into public.banda_detalles(evento_id,convocatoria,uniformidad,transporte,encuentro,partituras,contacto,objetivos)
  values(eid,fecha_conv,coalesce(p_datos->>'uniformidad',''),coalesce(p_datos->>'transporte',''),coalesce(p_datos->>'encuentro',''),coalesce(p_datos->>'partituras',''),coalesce(p_datos->>'contacto',''),datos)
  on conflict(evento_id) do update set convocatoria=excluded.convocatoria,uniformidad=excluded.uniformidad,transporte=excluded.transporte,encuentro=excluded.encuentro,partituras=excluded.partituras,contacto=excluded.contacto,objetivos=excluded.objetivos,actualizado_en=now();
  update public.banda_eventos set limite_respuesta=least(limite_respuesta,fecha_conv) where id=eid and tipo='actuacion';
 elsif p_accion='justificar' then
  if not musico or ev.tipo<>'actuacion' or ev.estado<>'publicado' or now()>=ev.fin then raise exception 'Solo se justifican actuaciones abiertas.';end if;
  if not exists(select 1 from public.banda_respuestas where evento_id=eid and usuario_id=actor and respuesta='no_voy') then raise exception 'Indica primero «No voy».';end if;
  if length(trim(coalesce(p_datos->>'motivo',''))) not between 5 and 2000 then raise exception 'Explica el motivo con entre 5 y 2000 caracteres.';end if;
  insert into public.banda_justificaciones(evento_id,usuario_id,motivo) values(eid,actor,trim(p_datos->>'motivo'))
  on conflict(evento_id,usuario_id) do update set motivo=excluded.motivo,estado='pendiente',revision='',revisado_por=null,actualizado_en=now();
 elsif p_accion='revisar' then
  uid:=(p_datos->>'usuario_id')::uuid;
  if coalesce(p_datos->>'estado','') not in ('aceptada','rechazada') then raise exception 'Revisión no válida.';end if;
  update public.banda_justificaciones set estado=p_datos->>'estado',revision=coalesce(p_datos->>'revision',''),revisado_por=actor,actualizado_en=now() where evento_id=eid and usuario_id=uid;
  if not found then raise exception 'Justificación no encontrada.';end if;
  insert into public.banda_avisos(usuario_id,evento_id,tipo,titulo,mensaje,clave) values(uid,eid,'justificacion','Justificación revisada',ev.titulo||'. Consulta el resultado en tu portal.','revision:'||eid||':'||uid||':'||clock_timestamp());
 elsif p_accion='recordar' then
  if ev.tipo<>'actuacion' or ev.estado<>'publicado' or now()>ev.limite_respuesta or now()>=ev.fin then raise exception 'El plazo de confirmación está cerrado.';end if;
  insert into public.banda_avisos(usuario_id,evento_id,tipo,titulo,mensaje,clave)
  select c.usuario_id,eid,'recordatorio','Confirma tu asistencia',ev.titulo||'. Todavía no has respondido.','manual:'||eid||':'||c.usuario_id||':'||floor(extract(epoch from now())/10800)::text
  from public.banda_convocados c join public.perfiles p on p.id=c.usuario_id where c.evento_id=eid and p.es_musico and not exists(select 1 from public.banda_respuestas r where r.evento_id=eid and r.usuario_id=c.usuario_id) on conflict(clave) do nothing;
  get diagnostics n=row_count;return jsonb_build_object('avisos',n);
 else raise exception 'Acción no reconocida.';end if;
 insert into public.banda_auditoria(actor_id,accion,evento_id,usuario_id,detalle) values(actor,'portal_'||p_accion,eid,case when p_accion='justificar' then actor else uid end,jsonb_build_object('estado',p_datos->>'estado'));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function jc_private.banda_portal_accion(text,jsonb) from public,anon;
grant execute on function jc_private.banda_portal_accion(text,jsonb) to authenticated;
create function public.banda_portal_accion(p_accion text,p_datos jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select jc_private.banda_portal_accion(p_accion,p_datos)$$;
revoke all on function public.banda_portal_accion(text,jsonb) from public,anon;
grant execute on function public.banda_portal_accion(text,jsonb) to authenticated;
-- Service-only queue claim: deduplicated reminders and push delivery, never public.
create function jc_private.banda_avisos_lote() returns jsonb language plpgsql security definer set search_path='' as $$
declare resultado jsonb;
begin
 insert into public.banda_avisos(usuario_id,evento_id,tipo,titulo,mensaje,clave)
 select c.usuario_id,e.id,'recordatorio','Confirma tu asistencia',e.titulo||'. El plazo de confirmación termina en las próximas 24 horas.','auto:'||e.id||':'||c.usuario_id||':'||e.limite_respuesta::date
 from public.banda_eventos e join public.banda_convocados c on c.evento_id=e.id join public.perfiles p on p.id=c.usuario_id
 where e.tipo='actuacion' and e.estado='publicado' and e.fin>now() and e.limite_respuesta>now() and e.limite_respuesta<=now()+interval '24 hours' and p.es_musico
 and not exists(select 1 from public.banda_respuestas r where r.evento_id=e.id and r.usuario_id=c.usuario_id) on conflict(clave) do nothing;
 update public.banda_avisos a set push_estado='sin_suscripcion' where a.push_estado='pendiente' and not exists(select 1 from public.banda_push s join public.perfiles p on p.id=s.usuario_id where s.usuario_id=a.usuario_id and p.es_musico);
 with candidatos as (select a.id from public.banda_avisos a join public.perfiles p on p.id=a.usuario_id where a.push_estado in ('pendiente','error','procesando') and a.intentos<3 and (a.push_en is null or a.push_en<now()-interval '10 minutes') and p.es_musico order by a.id for update of a skip locked limit 20),
 lote as (update public.banda_avisos a set push_estado='procesando',push_en=now(),intentos=intentos+1 from candidatos c where a.id=c.id returning a.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'usuario_id',l.usuario_id,'titulo',l.titulo,'mensaje',l.mensaje,'suscripciones',(select coalesce(jsonb_agg(jsonb_build_object('endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)),'[]') from public.banda_push s where s.usuario_id=l.usuario_id))),'[]') into resultado from lote l;
 return resultado;
end $$;
revoke all on function jc_private.banda_avisos_lote() from public,anon,authenticated;
grant execute on function jc_private.banda_avisos_lote() to service_role;
grant usage on schema jc_private to service_role;
create function public.banda_avisos_lote() returns jsonb language sql security invoker set search_path='' as $$select jc_private.banda_avisos_lote()$$;
revoke all on function public.banda_avisos_lote() from public,anon,authenticated;
grant execute on function public.banda_avisos_lote() to service_role;

-- Preserve the internal lead time if a public performance is rescheduled.
create function jc_private.ajustar_convocatoria() returns trigger language plpgsql security definer set search_path='' as $$
declare llamada timestamptz;
begin
 if new.inicio is distinct from old.inicio then
  update public.banda_detalles set convocatoria=convocatoria+(new.inicio-old.inicio),actualizado_en=now() where evento_id=new.id and convocatoria is not null returning convocatoria into llamada;
  if llamada is not null then new.limite_respuesta:=least(new.limite_respuesta,llamada);end if;
 end if;
 return new;
end $$;
revoke all on function jc_private.ajustar_convocatoria() from public,anon,authenticated;
create trigger banda_reprogramar before update of inicio on public.banda_eventos for each row execute function jc_private.ajustar_convocatoria();

-- QR window follows the internal call time; it never uses GPS.
do $patch$ declare definition text;begin
 select pg_get_functiondef('jc_private.banda_accion(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,$old$ev.inicio-interval '2 hours'$old$,$new$coalesce((select d.convocatoria from public.banda_detalles d where d.evento_id=eid),ev.inicio)-interval '2 hours'$new$);
 execute definition;
end $patch$;
notify pgrst,'reload schema';
