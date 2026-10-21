-- Ensayos con plantillas y actuaciones públicas vinculadas al portal.
-- Los identificadores de origen se conservan al borrar la publicación para mantener el historial.
alter table public.banda_eventos add column concierto_id bigint unique, add column procesion_id integer unique,
 add constraint banda_origen_unico check (num_nonnulls(concierto_id,procesion_id)<=1 and (num_nonnulls(concierto_id,procesion_id)=0 or tipo='actuacion'));
alter table public.conciertos add column fin_hora time;
alter table public.maestro_procesiones add column hora time, add column fin_hora time, add column lugar text, add column descripcion text;
alter table public.maestro_procesiones drop constraint maestro_procesiones_estado_check;
alter table public.maestro_procesiones add constraint maestro_procesiones_estado_check check(estado in ('Programada','Activa','Finalizada','Cancelada'));
-- Remove pre-existing permissive write policies before linking public content to private rosters.
drop policy if exists "Permitir actualizar procesiones" on public.maestro_procesiones;
drop policy if exists "Permitir crear procesiones" on public.maestro_procesiones;
create table public.banda_ajustes(id integer primary key check(id=1),latitud float8 check(latitud between -90 and 90),longitud float8 check(longitud between -180 and 180),radio_m integer not null default 150 check(radio_m between 30 and 1000),check((latitud is null)=(longitud is null)));
insert into public.banda_ajustes(id) values(1);
alter table public.banda_ajustes enable row level security;
revoke all on public.banda_ajustes from anon,authenticated;
grant select on public.banda_ajustes to authenticated;
create policy ajustes_admin on public.banda_ajustes for select to authenticated using((select public.es_admin()));
create or replace function jc_private.sincronizar_actuacion() returns trigger language plpgsql security definer set search_path='' as $$
declare src jsonb; cid bigint; pid integer; eid uuid; oldev public.banda_eventos%rowtype;
 inicio_ev timestamptz; fin_ev timestamptz; fecha_ev date; hora_ev time; fin_h time;
 titulo_ev text; lugar_ev text; visible boolean; changed boolean;
begin
 src:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if TG_TABLE_NAME='conciertos' then
  cid:=(src->>'id_concierto')::bigint; titulo_ev:=src->>'titulo';
  lugar_ev:=concat_ws(' · ',nullif(src->>'lugar',''),nullif(src->>'localidad','')); visible:=src->>'estado'='Publicado';
 else
  pid:=(src->>'id_procesion')::integer; titulo_ev:=src->>'hermandad';
  lugar_ev:=concat_ws(' · ',nullif(src->>'lugar',''),nullif(src->>'localidad','')); visible:=src->>'estado' in ('Programada','Activa','Finalizada');
 end if;
 select * into oldev from public.banda_eventos where (cid is not null and concierto_id=cid) or (pid is not null and procesion_id=pid) for update;
 eid:=oldev.id;
 if TG_OP='DELETE' or not visible then
  if eid is not null then
   update public.banda_eventos set estado='cancelado',fichaje_abierto=false,abierto_hasta=null where id=eid;
   delete from jc_private.banda_qr where evento_id=eid;
   insert into public.banda_auditoria(actor_id,accion,evento_id) values(auth.uid(),'publicacion_retirada',eid);
  end if;
  return case when TG_OP='DELETE' then old else new end;
 end if;
 fecha_ev:=(src->>'fecha')::date; hora_ev:=(src->>'hora')::time; fin_h:=(src->>'fin_hora')::time;
 -- Existing historic publications and old instant-live flow remain compatible.
 if eid is null and (fecha_ev is null or fecha_ev<(now() at time zone 'Europe/Madrid')::date) then return new; end if;
 if fecha_ev is null or hora_ev is null or fin_h is null or nullif(trim(lugar_ev),'') is null then
  if TG_TABLE_NAME='maestro_procesiones' and src->>'estado' in ('Activa','Finalizada') and eid is null then return new; end if;
  raise exception 'Para publicar una próxima actuación completa fecha, hora de inicio, fin y lugar.';
 end if;
 inicio_ev:=(fecha_ev+hora_ev) at time zone 'Europe/Madrid';
 fin_ev:=(fecha_ev+case when fin_h<=hora_ev then 1 else 0 end+fin_h) at time zone 'Europe/Madrid';
 if eid is null then
  if fin_ev<=now() then return new; end if;
  if auth.uid() is null then raise exception 'Publica la actuación desde una cuenta administradora.'; end if;
  insert into public.banda_eventos(titulo,tipo,inicio,fin,lugar,limite_respuesta,concierto_id,procesion_id,creado_por)
  values(titulo_ev,'actuacion',inicio_ev,fin_ev,lugar_ev,inicio_ev,cid,pid,auth.uid()) returning id into eid;
  insert into public.banda_convocados(evento_id,usuario_id) select eid,id from public.perfiles where es_musico;
 else
  changed:=oldev.inicio is distinct from inicio_ev or oldev.fin is distinct from fin_ev or oldev.lugar is distinct from lugar_ev;
  update public.banda_eventos set titulo=titulo_ev,inicio=inicio_ev,fin=fin_ev,lugar=lugar_ev,estado='publicado',
   limite_respuesta=case when oldev.inicio is distinct from inicio_ev then least(oldev.limite_respuesta,inicio_ev) else oldev.limite_respuesta end,
   fichaje_abierto=case when changed then false else fichaje_abierto end,abierto_hasta=case when changed then null else abierto_hasta end where id=eid;
  if changed then delete from jc_private.banda_qr where evento_id=eid; end if;
 end if;
 insert into public.banda_auditoria(actor_id,accion,evento_id,detalle) values(auth.uid(),'sincronizar_publicacion',eid,jsonb_build_object('anterior',to_jsonb(oldev),'concierto_id',cid,'procesion_id',pid));
 return new;
end $$;
revoke all on function jc_private.sincronizar_actuacion() from public,anon,authenticated;
create trigger conciertos_portal after insert or update of titulo,fecha,hora,fin_hora,lugar,localidad,estado or delete on public.conciertos for each row execute function jc_private.sincronizar_actuacion();
create trigger procesiones_portal after insert or update of hermandad,fecha,hora,fin_hora,lugar,localidad,estado or delete on public.maestro_procesiones for each row execute function jc_private.sincronizar_actuacion();

create or replace function jc_private.banda_accion(p_accion text,p_datos jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); rol text; musico boolean; eid uuid; uid uuid; ev public.banda_eventos%rowtype;
 anterior jsonb; resultado jsonb; qr jc_private.banda_qr%rowtype;
 est text; ahora timestamptz:=clock_timestamp();
begin
 if actor is null then raise exception 'Inicia sesión para continuar.'; end if;
 rol:=jc_private.rol_actual();
 select es_musico into musico from public.perfiles where id=actor;
 if p_accion='perfil' then
  if rol not in ('admin','musico') then raise exception 'Acceso exclusivo para músicos.'; end if;
  uid:=coalesce((p_datos->>'usuario_id')::uuid,actor);
  if uid<>actor and rol<>'admin' then raise exception 'No puedes editar otro perfil.'; end if;
  if rol<>'admin' and p_datos ? 'incorporacion' then raise exception 'El año de incorporación lo gestiona administración.'; end if;
  select to_jsonb(f) into anterior from public.banda_fichas f where usuario_id=uid;
  insert into public.banda_fichas(usuario_id,nombre,instrumento) values(uid,trim(coalesce(p_datos->>'nombre','')),trim(coalesce(p_datos->>'instrumento','')))
  on conflict(usuario_id) do update set nombre=excluded.nombre,instrumento=excluded.instrumento,actualizado_en=ahora;
  if rol='admin' and p_datos ? 'incorporacion' then update public.banda_fichas set incorporacion=nullif(p_datos->>'incorporacion','')::int where usuario_id=uid; end if;
  insert into public.banda_auditoria(actor_id,accion,usuario_id,detalle) values(actor,'perfil',uid,jsonb_build_object('anterior',anterior,'nuevo',p_datos));
  return jsonb_build_object('ok',true);
 end if;
 if p_accion in ('ensayo','rol','evento','cancelar','abrir','cerrar','qr','manual','convocar') and rol<>'admin' then raise exception 'Acceso exclusivo para administración.'; end if;

 if p_accion='ensayo' then
  if coalesce(p_datos->>'plantilla','') not in ('manana','tarde') or nullif(p_datos->>'fecha','') is null then raise exception 'Selecciona fecha y tipo de ensayo.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ensayo:'||(p_datos->>'fecha')||':'||(p_datos->>'plantilla'),0));
  if exists(select 1 from public.banda_eventos where tipo='ensayo' and estado='publicado' and inicio=((p_datos->>'fecha')::date+case when p_datos->>'plantilla'='tarde' then time '20:30' else time '12:00' end) at time zone 'Europe/Madrid') then raise exception 'Este ensayo ya existe en el calendario.'; end if;
  insert into public.banda_eventos(titulo,tipo,inicio,fin,limite_respuesta,lugar,creado_por)
  select case when p_datos->>'plantilla'='tarde' then 'Ensayo tarde' else 'Ensayo mañana' end,'ensayo',
   ((p_datos->>'fecha')::date+case when p_datos->>'plantilla'='tarde' then time '20:30' else time '12:00' end) at time zone 'Europe/Madrid',
   ((p_datos->>'fecha')::date+case when p_datos->>'plantilla'='tarde' then time '22:00' else time '14:00' end) at time zone 'Europe/Madrid',
   ((p_datos->>'fecha')::date+case when p_datos->>'plantilla'='tarde' then time '20:30' else time '12:00' end) at time zone 'Europe/Madrid',
   'Local de la banda',actor returning id into eid;
  insert into public.banda_convocados(evento_id,usuario_id) select eid,id from public.perfiles where es_musico;
  insert into public.banda_auditoria(actor_id,accion,evento_id,detalle) values(actor,'ensayo',eid,p_datos);
  return jsonb_build_object('ok',true,'id',eid);
 end if;
 if p_accion='rol' then
  uid:=(p_datos->>'usuario_id')::uuid;
  if uid=actor and (p_datos->>'rol') is distinct from 'admin' then raise exception 'No puedes quitarte el permiso de administrador.'; end if;
  if (p_datos->>'rol') is null or (p_datos->>'rol') not in ('usuario','musico','admin') then raise exception 'Rol no válido.'; end if;
  select to_jsonb(p) into anterior from public.perfiles p where id=uid;
  if anterior is null then raise exception 'Usuario no encontrado.'; end if;
  update public.perfiles set
   rol=case when p_datos->>'rol'='admin' then 'admin' when coalesce((p_datos->>'es_musico')::boolean,p_datos->>'rol'='musico') then 'musico' else 'usuario' end,
   es_musico=coalesce((p_datos->>'es_musico')::boolean,p_datos->>'rol'='musico' or (p_datos->>'rol'='admin' and es_musico)),updated_at=ahora where id=uid;
  insert into public.banda_auditoria(actor_id,accion,usuario_id,detalle) values(actor,'rol',uid,jsonb_build_object('anterior',jsonb_build_object('rol',anterior->>'rol','es_musico',anterior->'es_musico'),'nuevo',p_datos));
  return jsonb_build_object('ok',true);
 end if;
 if p_accion='evento' then
  eid:=nullif(p_datos->>'id','')::uuid;
  if eid is not null then
   select * into ev from public.banda_eventos where id=eid for update;
   if not found then raise exception 'Evento no encontrado.'; end if;
   if ev.fichaje_abierto then raise exception 'Cierra el fichaje antes de editar el evento.'; end if;
   anterior:=to_jsonb(ev);
   if ev.concierto_id is not null or ev.procesion_id is not null then
    p_datos:=p_datos||jsonb_build_object('titulo',ev.titulo,'tipo',ev.tipo,'inicio',ev.inicio,'fin',ev.fin,'lugar',ev.lugar);
   end if;
  end if;
  if eid is null then
   insert into public.banda_eventos(titulo,tipo,inicio,fin,lugar,notas,limite_respuesta,creado_por)
   values(trim(p_datos->>'titulo'),p_datos->>'tipo',(p_datos->>'inicio')::timestamptz,(p_datos->>'fin')::timestamptz,trim(p_datos->>'lugar'),coalesce(p_datos->>'notas',''),(p_datos->>'limite_respuesta')::timestamptz,actor) returning id into eid;
   insert into public.banda_convocados(evento_id,usuario_id) select eid,id from public.perfiles where perfiles.es_musico;
  else
   update public.banda_eventos set titulo=trim(p_datos->>'titulo'),tipo=p_datos->>'tipo',inicio=(p_datos->>'inicio')::timestamptz,fin=(p_datos->>'fin')::timestamptz,lugar=trim(p_datos->>'lugar'),notas=coalesce(p_datos->>'notas',''),limite_respuesta=(p_datos->>'limite_respuesta')::timestamptz where id=eid;
  end if;
  insert into public.banda_auditoria(actor_id,accion,evento_id,detalle) values(actor,'evento',eid,jsonb_build_object('anterior',anterior,'nuevo',p_datos));
  return jsonb_build_object('ok',true,'id',eid);
 end if;
 eid:=(p_datos->>'evento_id')::uuid;
 select * into ev from public.banda_eventos where id=eid for update;
 if not found then raise exception 'Evento no encontrado.'; end if;
 if p_accion='convocar' then
  if ev.estado='cancelado' or ahora>ev.fin then raise exception 'El evento ya está cerrado.'; end if;
  insert into public.banda_convocados(evento_id,usuario_id) select eid,id from public.perfiles where perfiles.es_musico on conflict do nothing;
 elsif p_accion='cancelar' then
  if ev.concierto_id is not null then update public.conciertos set estado='Oculto' where id_concierto=ev.concierto_id; end if;
  if ev.procesion_id is not null then update public.maestro_procesiones set estado='Cancelada' where id_procesion=ev.procesion_id; end if;
  update public.banda_eventos set estado='cancelado',fichaje_abierto=false,abierto_hasta=null where id=eid;
  delete from jc_private.banda_qr where evento_id=eid;
 elsif p_accion='abrir' then
  if ev.estado<>'publicado' or ahora<ev.inicio-interval '2 hours' or ahora>ev.fin then raise exception 'El fichaje solo puede abrirse desde 2 horas antes hasta el final del evento.'; end if;
  update public.banda_eventos set fichaje_abierto=true,abierto_hasta=least(ahora+interval '2 hours',fin) where id=eid;
 elsif p_accion='cerrar' then
  update public.banda_eventos set fichaje_abierto=false,abierto_hasta=null where id=eid;
  delete from jc_private.banda_qr where evento_id=eid;
 elsif p_accion='qr' then
  if not ev.fichaje_abierto or ev.estado<>'publicado' or ahora>=ev.abierto_hasta or ahora>=ev.fin then raise exception 'El fichaje está cerrado.'; end if;
  insert into jc_private.banda_qr(evento_id,token,expira) values(eid,gen_random_uuid(),least(ahora+interval '60 seconds',ev.abierto_hasta,ev.fin))
  on conflict(evento_id) do update set token=excluded.token,expira=excluded.expira returning * into qr;
  return jsonb_build_object('token',qr.token,'expira',qr.expira,'servidor',ahora);
 elsif p_accion='respuesta' then
  if ev.tipo='ensayo' then raise exception 'Los ensayos no requieren confirmación previa; registra tu llegada con el QR.'; end if;
  if not coalesce(musico,false) or not exists(select 1 from public.banda_convocados where evento_id=eid and usuario_id=actor) then raise exception 'No estás convocado a este evento.'; end if;
  if ev.estado<>'publicado' or ahora>ev.limite_respuesta or ahora>=ev.fin then raise exception 'El plazo de respuesta está cerrado.'; end if;
  select to_jsonb(r) into anterior from public.banda_respuestas r where evento_id=eid and usuario_id=actor;
  insert into public.banda_respuestas(evento_id,usuario_id,respuesta) values(eid,actor,p_datos->>'respuesta') on conflict(evento_id,usuario_id) do update set respuesta=excluded.respuesta,actualizado_en=ahora;
  insert into public.banda_auditoria(actor_id,accion,evento_id,usuario_id,detalle) values(actor,'respuesta',eid,actor,jsonb_build_object('anterior',anterior,'respuesta',p_datos->>'respuesta'));
  return jsonb_build_object('ok',true);
 elsif p_accion='fichar' then
  if not coalesce(musico,false) or not exists(select 1 from public.banda_convocados where evento_id=eid and usuario_id=actor) then raise exception 'No estás convocado a este evento.'; end if;
  if ev.estado<>'publicado' or not ev.fichaje_abierto or ev.abierto_hasta is null or ahora>=ev.abierto_hasta or ahora>=ev.fin or ahora<ev.inicio-interval '2 hours' then raise exception 'El fichaje está cerrado.'; end if;
  select * into qr from jc_private.banda_qr where evento_id=eid;
  if qr.token is null or (p_datos->>'token') is null or qr.token<>(p_datos->>'token')::uuid or qr.expira<=ahora then raise exception 'El QR ha caducado. Escanea el que se muestra ahora.'; end if;
  if exists(select 1 from public.banda_asistencias where evento_id=eid and usuario_id=actor) then raise exception 'Ya existe un registro. Si hay una incidencia, consulta a administración.'; end if;
  est:='presente';
  insert into public.banda_asistencias(evento_id,usuario_id,estado,metodo) values(eid,actor,est,'qr');
  insert into public.banda_auditoria(actor_id,accion,evento_id,usuario_id,detalle) values(actor,'fichar',eid,actor,jsonb_build_object('estado',est));
  return jsonb_build_object('ok',true,'estado',est);
 elsif p_accion='manual' then
  uid:=(p_datos->>'usuario_id')::uuid;
  if length(trim(coalesce(p_datos->>'motivo','')))<5 or length(p_datos->>'motivo')>1000 then raise exception 'Indica un motivo de entre 5 y 1000 caracteres.'; end if;
  if ev.estado='cancelado' then raise exception 'El evento está cancelado.'; end if;
  select to_jsonb(a) into anterior from public.banda_asistencias a where evento_id=eid and usuario_id=uid;
  insert into public.banda_asistencias(evento_id,usuario_id,estado,metodo,motivo,revisado_por) values(eid,uid,p_datos->>'estado','manual',trim(p_datos->>'motivo'),actor)
  on conflict(evento_id,usuario_id) do update set estado=excluded.estado,metodo='manual',motivo=excluded.motivo,revisado_por=actor,actualizado_en=ahora;
  insert into public.banda_auditoria(actor_id,accion,evento_id,usuario_id,detalle) values(actor,'manual',eid,uid,jsonb_build_object('anterior',anterior,'estado',p_datos->>'estado','motivo',p_datos->>'motivo'));
  return jsonb_build_object('ok',true);
 else raise exception 'Acción no reconocida.';
 end if;
 insert into public.banda_auditoria(actor_id,accion,evento_id) values(actor,p_accion,eid);
 return jsonb_build_object('ok',true);
end $$;

notify pgrst,'reload schema';
