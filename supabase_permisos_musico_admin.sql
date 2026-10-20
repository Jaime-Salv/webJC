alter table public.perfiles add column if not exists es_musico boolean not null default false;
update public.perfiles set es_musico=true where rol in ('musico','admin');

create or replace function jc_private.proteger_rol() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then
  if TG_OP='INSERT' and (coalesce(new.rol,'usuario')<>'usuario' or new.es_musico) and jc_private.rol_actual()<>'admin' then
   raise exception 'Solo administración puede asignar permisos.';
  end if;
  if TG_OP='UPDATE' and (new.rol is distinct from old.rol or new.es_musico is distinct from old.es_musico) then
   if jc_private.rol_actual()<>'admin' then raise exception 'Solo administración puede asignar permisos.'; end if;
   if old.id=auth.uid() and new.rol is distinct from old.rol then raise exception 'No puedes quitarte el permiso de administrador.'; end if;
  end if;
 end if;
 if new.rol is null then new.rol:='usuario'; end if;
 if new.rol not in ('usuario','musico','admin') then raise exception 'Rol no válido.'; end if;
 if new.rol='musico' then new.es_musico:=true;
 elsif new.rol='usuario' then
  if TG_OP='UPDATE' and new.rol is distinct from old.rol then new.es_musico:=false;
  elsif new.es_musico then new.rol:='musico'; end if;
 end if;
 return new;
end $$;

create or replace function jc_private.banda_accion(p_accion text,p_datos jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); rol text; musico boolean; eid uuid; uid uuid; ev public.banda_eventos%rowtype;
 anterior jsonb; resultado jsonb; qr jc_private.banda_qr%rowtype;
 lat double precision; lon double precision; prec double precision; distancia double precision;
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
 if p_accion in ('rol','evento','cancelar','abrir','cerrar','qr','manual','convocar') and rol<>'admin' then raise exception 'Acceso exclusivo para administración.'; end if;
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
  end if;
  if eid is null then
   insert into public.banda_eventos(titulo,tipo,inicio,fin,lugar,notas,limite_respuesta,latitud,longitud,radio_m,creado_por)
   values(trim(p_datos->>'titulo'),p_datos->>'tipo',(p_datos->>'inicio')::timestamptz,(p_datos->>'fin')::timestamptz,trim(p_datos->>'lugar'),coalesce(p_datos->>'notas',''),(p_datos->>'limite_respuesta')::timestamptz,nullif(p_datos->>'latitud','')::float8,nullif(p_datos->>'longitud','')::float8,(p_datos->>'radio_m')::int,actor) returning id into eid;
   insert into public.banda_convocados(evento_id,usuario_id) select eid,id from public.perfiles where perfiles.es_musico;
  else
   update public.banda_eventos set titulo=trim(p_datos->>'titulo'),tipo=p_datos->>'tipo',inicio=(p_datos->>'inicio')::timestamptz,fin=(p_datos->>'fin')::timestamptz,lugar=trim(p_datos->>'lugar'),notas=coalesce(p_datos->>'notas',''),limite_respuesta=(p_datos->>'limite_respuesta')::timestamptz,latitud=nullif(p_datos->>'latitud','')::float8,longitud=nullif(p_datos->>'longitud','')::float8,radio_m=(p_datos->>'radio_m')::int where id=eid;
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
  update public.banda_eventos set estado='cancelado',fichaje_abierto=false,abierto_hasta=null where id=eid;
  delete from jc_private.banda_qr where evento_id=eid;
 elsif p_accion='abrir' then
  if ev.estado<>'publicado' or ahora<ev.inicio-interval '2 hours' or ahora>ev.fin then raise exception 'El fichaje solo puede abrirse desde 2 horas antes hasta el final del evento.'; end if;
  if ev.latitud is null then raise exception 'Configura la ubicación del evento antes de abrir el fichaje.'; end if;
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
  lat:=(p_datos->>'latitud')::float8; lon:=(p_datos->>'longitud')::float8; prec:=(p_datos->>'precision')::float8;
  if lat is null or lon is null or prec is null or not(lat between -90 and 90) or not(lon between -180 and 180) or not(prec between 0 and 10000) then raise exception 'La ubicación no es válida. Activa la ubicación o solicita registro manual.'; end if;
  distancia:=6371000*2*asin(sqrt(least(1.0,power(sin(radians(lat-ev.latitud)/2),2)+cos(radians(lat))*cos(radians(ev.latitud))*power(sin(radians(lon-ev.longitud)/2),2))));
  est:=case when distancia<=ev.radio_m and prec<=least(100,ev.radio_m) then 'presente' else 'incidencia' end;
  insert into public.banda_asistencias(evento_id,usuario_id,estado,metodo,distancia_m,precision_m,motivo) values(eid,actor,est,'qr',round(distancia)::int,round(prec)::int,case when est='incidencia' then 'Ubicación fuera del radio o con precisión insuficiente. Pendiente de revisión.' else '' end);
  insert into public.banda_auditoria(actor_id,accion,evento_id,usuario_id,detalle) values(actor,'fichar',eid,actor,jsonb_build_object('estado',est,'distancia_m',round(distancia),'precision_m',round(prec)));
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
