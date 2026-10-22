-- Concerts reuse the live performance engine, keeping their original musician call.
alter table public.maestro_procesiones add column concierto_id bigint unique references public.conciertos(id_concierto) on delete set null;
alter table public.maestro_procesiones drop constraint maestro_procesiones_tipo_check;
alter table public.maestro_procesiones add constraint maestro_procesiones_tipo_check check(tipo in ('Semana Santa','Gloria','Concierto'));
create unique index maestro_un_directo_activo on public.maestro_procesiones((true)) where estado='Activa';

-- New musicians join all unfinished published calls; historic responses remain immutable.
create function jc_private.convocar_nuevo_musico() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.es_musico and (TG_OP='INSERT' or not old.es_musico) then
  insert into public.banda_convocados(evento_id,usuario_id)
  select e.id,new.id from public.banda_eventos e where e.estado='publicado' and e.fin>now()
   and not exists(select 1 from public.maestro_procesiones p where (p.id_procesion=e.procesion_id or (e.concierto_id is not null and p.concierto_id=e.concierto_id)) and p.estado='Finalizada')
  on conflict do nothing;
 end if;return new;
end $$;
revoke all on function jc_private.convocar_nuevo_musico() from public,anon,authenticated;
create trigger banda_nuevo_musico after insert or update of es_musico on public.perfiles for each row execute function jc_private.convocar_nuevo_musico();
insert into public.banda_convocados(evento_id,usuario_id)
select e.id,p.id from public.banda_eventos e cross join public.perfiles p
where p.es_musico and e.estado='publicado' and e.fin>now()
and not exists(select 1 from public.maestro_procesiones m where (m.id_procesion=e.procesion_id or (e.concierto_id is not null and m.concierto_id=e.concierto_id)) and m.estado='Finalizada') on conflict do nothing;

-- A concert live row must not create a second internal call.
do $patch$ declare d text;begin
 select pg_get_functiondef('jc_private.sincronizar_actuacion()'::regprocedure) into d;
 d:=replace(d,'if TG_TABLE_NAME=''conciertos'' then','if TG_TABLE_NAME=''maestro_procesiones'' and nullif(src->>''concierto_id'','''') is not null then return case when TG_OP=''DELETE'' then old else new end; end if;'||chr(10)||' if TG_TABLE_NAME=''conciertos'' then');
 execute d;
end $patch$;

create function jc_private.iniciar_directo_programado(eid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.banda_eventos%rowtype;p public.maestro_procesiones%rowtype;c public.conciertos%rowtype;rid uuid;
begin
 if auth.uid() is null or not coalesce(public.es_admin(),false) then raise exception 'Acceso exclusivo para administración.';end if;
 perform pg_advisory_xact_lock(9942211);
 select * into e from public.banda_eventos where id=eid for update;
 if not found or e.estado<>'publicado' or e.tipo<>'actuacion' then raise exception 'No hay una actuación publicada vinculada.';end if;
 if e.procesion_id is not null then select * into p from public.maestro_procesiones where id_procesion=e.procesion_id for update;
 elsif e.concierto_id is not null then
  select * into c from public.conciertos where id_concierto=e.concierto_id for update;
  if c.estado<>'Publicado' then raise exception 'Publica primero el concierto.';end if;
  select * into p from public.maestro_procesiones where concierto_id=e.concierto_id for update;
 else raise exception 'Esta convocatoria no tiene publicación pública.';end if;
 if p.estado='Activa' then return jsonb_build_object('directo',to_jsonb(p),'ya_activo',true);end if;
 if p.estado in ('Finalizada','Cancelada') then raise exception 'Esta actuación ya está finalizada o cancelada.';end if;
 if exists(select 1 from public.maestro_procesiones where estado='Activa') then raise exception 'Finaliza el directo actual antes de empezar otro.';end if;
 if p.id_procesion is null then
  insert into public.maestro_procesiones(tipo,fecha,hermandad,localidad,estado,hora,fin_hora,lugar,url_foto,concierto_id)
  values('Concierto',c.fecha,c.titulo,coalesce(c.localidad,''),'Activa',c.hora,c.fin_hora,c.lugar,c.cartel_url,c.id_concierto) returning * into p;
 else
  update public.maestro_procesiones set estado='Activa' where id_procesion=p.id_procesion returning * into p;
 end if;
 insert into public.banda_auditoria(actor_id,accion,evento_id,detalle) values(auth.uid(),'empezar_directo',eid,jsonb_build_object('id_procesion',p.id_procesion));
 return jsonb_build_object('directo',to_jsonb(p),'ya_activo',false);
end $$;
revoke all on function jc_private.iniciar_directo_programado(uuid) from public,anon;
grant execute on function jc_private.iniciar_directo_programado(uuid) to authenticated;
create function public.iniciar_directo_programado(eid uuid) returns jsonb language sql security invoker set search_path='' as $$ select jc_private.iniciar_directo_programado(eid) $$;
revoke all on function public.iniciar_directo_programado(uuid) from public,anon;
grant execute on function public.iniciar_directo_programado(uuid) to authenticated;

create function jc_private.archivar_directo() returns trigger language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 if new.estado='Finalizada' and old.estado is distinct from new.estado then
  for eid in select id from public.banda_eventos where procesion_id=new.id_procesion or (new.concierto_id is not null and concierto_id=new.concierto_id) loop
   update public.banda_eventos set fichaje_abierto=false,abierto_hasta=null where id=eid;
   delete from jc_private.banda_qr where evento_id=eid;
  end loop;
 end if;return new;
end $$;
revoke all on function jc_private.archivar_directo() from public,anon,authenticated;
create trigger banda_archivar_directo after update of estado on public.maestro_procesiones for each row execute function jc_private.archivar_directo();
