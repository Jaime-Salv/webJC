do $patch$ declare definition text;begin
select pg_get_functiondef('jc_private.avisar_convocatoria()'::regprocedure) into definition;
definition:=replace(definition,$before$  insert into public.banda_avisos(usuario_id,evento_id,tipo,titulo,mensaje,clave)
  values(new.usuario_id,new.evento_id,'convocatoria','Nueva convocatoria',titulo_ev,'convocatoria:'||new.evento_id||':'||new.usuario_id) on conflict(clave) do nothing;
$before$,$after$  insert into public.banda_avisos(usuario_id,evento_id,tipo,titulo,mensaje,clave,push_estado)
  values(new.usuario_id,new.evento_id,'convocatoria','Nueva convocatoria',titulo_ev,'convocatoria:'||new.evento_id||':'||new.usuario_id,case when current_setting('jc.portal_repetir',true)='true' then 'agrupado' else 'pendiente' end) on conflict(clave) do nothing;
$after$);
execute definition;
select pg_get_functiondef('jc_private.banda_portal_accion(text,jsonb)'::regprocedure) into definition;
definition:=replace(definition,$before$  for dia in select generate_series(d_desde,d_hasta,interval '1 day')::date loop
$before$,$after$  perform set_config('jc.portal_repetir','true',true);
  for dia in select generate_series(d_desde,d_hasta,interval '1 day')::date loop
$after$);
definition:=replace(definition,$before$  return jsonb_build_object('creados',creados,'existentes',omitidos);
$before$,$after$  perform set_config('jc.portal_repetir','false',true);
  if creados>0 then
   insert into public.banda_avisos(usuario_id,tipo,titulo,mensaje,clave)
   select id,'serie','Nuevos ensayos en el calendario',creados||' ensayos añadidos. Consulta las fechas en el portal.','serie:'||actor||':'||clock_timestamp()||':'||id from public.perfiles where es_musico;
  end if;
  return jsonb_build_object('creados',creados,'existentes',omitidos);
$after$);
execute definition;
select pg_get_functiondef('jc_private.banda_avisos_lote()'::regprocedure) into definition;
definition:=replace(definition,$before$ with candidatos as (select a.id from public.banda_avisos a join public.perfiles p on p.id=a.usuario_id where a.push_estado in ('pendiente','error','procesando') and a.intentos<3 and (a.push_en is null or a.push_en<now()-interval '10 minutes') and p.es_musico order by a.id for update of a skip locked limit 20),
$before$,$after$ with candidatos as (select a.id from public.banda_avisos a join public.perfiles p on p.id=a.usuario_id where a.push_estado in ('pendiente','error','procesando') and a.intentos<3 and (a.push_en is null or a.push_en<now()-interval '10 minutes') and p.es_musico order by a.id for update of a skip locked limit 100),
$after$);
execute definition;
end $patch$;