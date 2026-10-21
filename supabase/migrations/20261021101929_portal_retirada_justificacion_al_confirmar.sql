-- A musician who changes to "Voy" withdraws their absence justification.
create function jc_private.retirar_justificacion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.respuesta='voy' then
  with retiradas as (delete from public.banda_justificaciones j where j.evento_id=new.evento_id and j.usuario_id=new.usuario_id returning to_jsonb(j) anterior)
  insert into public.banda_auditoria(actor_id,accion,evento_id,usuario_id,detalle)
  select coalesce(auth.uid(),new.usuario_id),'justificacion_retirada',new.evento_id,new.usuario_id,jsonb_build_object('anterior',anterior) from retiradas;
 end if;
 return new;
end $$;
revoke all on function jc_private.retirar_justificacion() from public,anon,authenticated;
create trigger banda_respuesta_retira_motivo after insert or update of respuesta on public.banda_respuestas for each row execute function jc_private.retirar_justificacion();
