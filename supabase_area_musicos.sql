-- Área privada de músicos JC. Aplicar como una única migración.
create schema if not exists jc_private;
revoke all on schema jc_private from public, anon;
grant usage on schema jc_private to authenticated;

create table public.banda_fichas (
 usuario_id uuid primary key references public.perfiles(id) on delete cascade,
 nombre text not null default '' check(length(nombre)<=160),
 instrumento text not null default '' check(length(instrumento)<=80),
 incorporacion integer check(incorporacion between 1852 and 2100),
 actualizado_en timestamptz not null default now()
);
create table public.banda_eventos (
 id uuid primary key default gen_random_uuid(), titulo text not null check(length(titulo) between 1 and 180),
 tipo text not null check(tipo in ('ensayo','actuacion')), inicio timestamptz not null, fin timestamptz not null,
 lugar text not null check(length(lugar) between 1 and 240), notas text not null default '' check(length(notas)<=4000),
 limite_respuesta timestamptz not null, estado text not null default 'publicado' check(estado in ('publicado','cancelado')),
 latitud double precision check(latitud between -90 and 90), longitud double precision check(longitud between -180 and 180),
 radio_m integer not null default 150 check(radio_m between 30 and 1000),
 fichaje_abierto boolean not null default false, abierto_hasta timestamptz,
 creado_por uuid not null references auth.users(id), creado_en timestamptz not null default now(),
 check(fin>inicio), check(limite_respuesta<=fin), check((latitud is null)=(longitud is null))
);
create index banda_eventos_inicio_idx on public.banda_eventos(inicio);
create table public.banda_convocados (
 evento_id uuid references public.banda_eventos(id) on delete cascade,
 usuario_id uuid references public.perfiles(id) on delete cascade,
 primary key(evento_id,usuario_id)
);
create index banda_convocados_usuario_idx on public.banda_convocados(usuario_id);
create table public.banda_respuestas (
 evento_id uuid not null, usuario_id uuid not null, respuesta text not null check(respuesta in ('voy','no_voy')),
 actualizado_en timestamptz not null default now(), primary key(evento_id,usuario_id),
 foreign key(evento_id,usuario_id) references public.banda_convocados(evento_id,usuario_id) on delete cascade
);
create table public.banda_asistencias (
 evento_id uuid not null, usuario_id uuid not null,
 estado text not null check(estado in ('presente','incidencia','ausente','justificada')),
 metodo text not null check(metodo in ('qr','manual')),
 registrado_en timestamptz not null default now(), actualizado_en timestamptz not null default now(),
 distancia_m integer, precision_m integer, motivo text not null default '',
 revisado_por uuid references auth.users(id), primary key(evento_id,usuario_id),
 foreign key(evento_id,usuario_id) references public.banda_convocados(evento_id,usuario_id) on delete cascade
);
create table public.banda_auditoria (
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id), accion text not null, evento_id uuid references public.banda_eventos(id),
 usuario_id uuid references public.perfiles(id), detalle jsonb not null default '{}', creado_en timestamptz not null default now()
);
create table jc_private.banda_qr (
 evento_id uuid primary key references public.banda_eventos(id) on delete cascade,
 token uuid not null default gen_random_uuid(), expira timestamptz not null
);
alter table jc_private.banda_qr enable row level security;
revoke all on jc_private.banda_qr from public,anon,authenticated;

-- Consulta de rol en esquema interno para evitar recursión de RLS.
create function jc_private.rol_actual() returns text language sql stable security definer set search_path='' as $$
 select coalesce((select rol from public.perfiles where id=auth.uid()),'usuario') where auth.uid() is not null
$$;
revoke all on function jc_private.rol_actual() from public,anon;
grant execute on function jc_private.rol_actual() to authenticated;

-- Un usuario no puede asignarse permisos mediante una llamada directa a la API.
create function jc_private.proteger_rol() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then
  if TG_OP='INSERT' and coalesce(new.rol,'usuario')<>'usuario' and jc_private.rol_actual()<>'admin' then
   raise exception 'Solo administración puede asignar roles.';
  end if;
  if TG_OP='UPDATE' and new.rol is distinct from old.rol then
   if jc_private.rol_actual()<>'admin' then raise exception 'Solo administración puede asignar roles.'; end if;
   if old.id=auth.uid() then raise exception 'No puedes cambiar tu propio rol de administrador.'; end if;
  end if;
 end if;
 if new.rol is null then new.rol:='usuario'; end if;
 if new.rol not in ('usuario','musico','admin') then raise exception 'Rol no válido.'; end if;
 return new;
end $$;
revoke all on function jc_private.proteger_rol() from public,anon,authenticated;
create trigger banda_proteger_rol before insert or update on public.perfiles for each row execute function jc_private.proteger_rol();

create function jc_private.crear_perfil() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.perfiles(id,email,username,rol) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name','Usuario'),'usuario') on conflict(id) do nothing;
 return new;
end $$;
revoke all on function jc_private.crear_perfil() from public,anon,authenticated;
create trigger banda_crear_perfil after insert on auth.users for each row execute function jc_private.crear_perfil();
insert into public.perfiles(id,email,username,rol) select id,email,coalesce(raw_user_meta_data->>'full_name','Usuario'),'usuario' from auth.users on conflict(id) do nothing;

alter table public.banda_fichas enable row level security;
alter table public.banda_eventos enable row level security;
alter table public.banda_convocados enable row level security;
alter table public.banda_respuestas enable row level security;
alter table public.banda_asistencias enable row level security;
alter table public.banda_auditoria enable row level security;
create policy fichas_lectura on public.banda_fichas for select to authenticated using ((select jc_private.rol_actual())='admin' or (usuario_id=(select auth.uid()) and (select jc_private.rol_actual())='musico'));
create policy convocados_lectura on public.banda_convocados for select to authenticated using ((select jc_private.rol_actual())='admin' or (usuario_id=(select auth.uid()) and (select jc_private.rol_actual())='musico'));
create policy eventos_lectura on public.banda_eventos for select to authenticated using ((select jc_private.rol_actual())='admin' or ((select jc_private.rol_actual())='musico' and exists(select 1 from public.banda_convocados c where c.evento_id=id and c.usuario_id=(select auth.uid()))));
create policy respuestas_lectura on public.banda_respuestas for select to authenticated using ((select jc_private.rol_actual())='admin' or (usuario_id=(select auth.uid()) and (select jc_private.rol_actual())='musico'));
create policy asistencias_lectura on public.banda_asistencias for select to authenticated using ((select jc_private.rol_actual())='admin' or (usuario_id=(select auth.uid()) and (select jc_private.rol_actual())='musico'));
create policy auditoria_lectura on public.banda_auditoria for select to authenticated using ((select jc_private.rol_actual())='admin');
revoke all on public.banda_fichas,public.banda_eventos,public.banda_convocados,public.banda_respuestas,public.banda_asistencias,public.banda_auditoria from public,anon,authenticated;
grant select on public.banda_fichas,public.banda_eventos,public.banda_convocados,public.banda_respuestas,public.banda_asistencias,public.banda_auditoria to authenticated;

-- Todas las escrituras se validan aquí, incluyendo identidad, rol, horario y QR.
-- SECURITY DEFINER es deliberado: las tablas no admiten escrituras del cliente.
create function jc_private.banda_accion(p_accion text,p_datos jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); rol text; eid uuid; uid uuid; ev public.banda_eventos%rowtype;
 anterior jsonb; resultado jsonb; qr jc_private.banda_qr%rowtype;
 lat double precision; lon double precision; prec double precision; distancia double precision;
 est text; ahora timestamptz:=clock_timestamp();
begin
 if actor is null then raise exception 'Inicia sesión para continuar.'; end if;
 rol:=jc_private.rol_actual();
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
  if uid=actor then raise exception 'No puedes cambiar tu propio rol.'; end if;
  select to_jsonb(p) into anterior from public.perfiles p where id=uid;
  if anterior is null then raise exception 'Usuario no encontrado.'; end if;
  update public.perfiles set rol=p_datos->>'rol',updated_at=ahora where id=uid;
  insert into public.banda_auditoria(actor_id,accion,usuario_id,detalle) values(actor,'rol',uid,jsonb_build_object('anterior',anterior->>'rol','nuevo',p_datos->>'rol'));
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
   insert into public.banda_convocados(evento_id,usuario_id) select eid,id from public.perfiles where perfiles.rol in ('musico','admin');
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
  insert into public.banda_convocados(evento_id,usuario_id) select eid,id from public.perfiles where perfiles.rol in ('musico','admin') on conflict do nothing;
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
  if rol not in ('musico','admin') or not exists(select 1 from public.banda_convocados where evento_id=eid and usuario_id=actor) then raise exception 'No estás convocado a este evento.'; end if;
  if ev.estado<>'publicado' or ahora>ev.limite_respuesta or ahora>=ev.fin then raise exception 'El plazo de respuesta está cerrado.'; end if;
  select to_jsonb(r) into anterior from public.banda_respuestas r where evento_id=eid and usuario_id=actor;
  insert into public.banda_respuestas(evento_id,usuario_id,respuesta) values(eid,actor,p_datos->>'respuesta') on conflict(evento_id,usuario_id) do update set respuesta=excluded.respuesta,actualizado_en=ahora;
  insert into public.banda_auditoria(actor_id,accion,evento_id,usuario_id,detalle) values(actor,'respuesta',eid,actor,jsonb_build_object('anterior',anterior,'respuesta',p_datos->>'respuesta'));
  return jsonb_build_object('ok',true);
 elsif p_accion='fichar' then
  if rol not in ('musico','admin') or not exists(select 1 from public.banda_convocados where evento_id=eid and usuario_id=actor) then raise exception 'No estás convocado a este evento.'; end if;
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
revoke all on function jc_private.banda_accion(text,jsonb) from public,anon;
grant execute on function jc_private.banda_accion(text,jsonb) to authenticated;
create function public.banda_accion(p_accion text,p_datos jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select jc_private.banda_accion(p_accion,p_datos) $$;
revoke all on function public.banda_accion(text,jsonb) from public,anon;
grant execute on function public.banda_accion(text,jsonb) to authenticated;
notify pgrst,'reload schema';
