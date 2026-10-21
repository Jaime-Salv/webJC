-- Prueba de integración transaccional: no conserva usuarios, eventos ni fichajes.
begin;
do $$
declare a uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); u uuid:=gen_random_uuid();
begin
 perform set_config('jc.test_admin',a::text,true); perform set_config('jc.test_musico',m::text,true); perform set_config('jc.test_publico',u::text,true);
 insert into auth.users(id,email) values(a,'jc-test-admin-'||a||'@example.invalid'),(m,'jc-test-musico-'||m||'@example.invalid'),(u,'jc-test-publico-'||u||'@example.invalid');
 update public.perfiles set rol='admin' where id=a;
 update public.perfiles set rol='musico' where id=m;
end $$;
set local role authenticated;
do $$
declare
 a uuid:=current_setting('jc.test_admin')::uuid; m uuid:=current_setting('jc.test_musico')::uuid; u uuid:=current_setting('jc.test_publico')::uuid;
 ev uuid; ev2 uuid; token text; old_token text; result jsonb; denied boolean; payload jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 assert jc_private.rol_actual()='admin','Rol admin';
 perform public.banda_accion('rol',jsonb_build_object('usuario_id',a,'rol','admin','es_musico',true));
 assert jc_private.rol_actual()='admin' and (select es_musico from public.perfiles where id=a),'Administrador y músico simultáneos';
 payload:=jsonb_build_object('titulo','Prueba transaccional JC','tipo','actuacion','inicio',now()-interval '15 minutes','fin',now()+interval '1 hour','limite_respuesta',now()+interval '30 minutes','lugar','Local de prueba');
 result:=public.banda_accion('evento',payload);ev:=(result->>'id')::uuid;
 assert exists(select 1 from public.banda_convocados where evento_id=ev and usuario_id=m),'Convocatoria músico';
 assert not exists(select 1 from public.banda_convocados where evento_id=ev and usuario_id=u),'Público no convocado';
 perform public.banda_accion('abrir',jsonb_build_object('evento_id',ev));
 result:=public.banda_accion('qr',jsonb_build_object('evento_id',ev));token:=result->>'token';
 assert exists(select 1 from public.banda_convocados where evento_id=ev and usuario_id=a),'Administrador músico convocado';
 perform public.banda_accion('respuesta',jsonb_build_object('evento_id',ev,'respuesta','voy'));
 perform public.banda_accion('rol',jsonb_build_object('usuario_id',a,'rol','admin','es_musico',false));
 assert jc_private.rol_actual()='admin' and not (select es_musico from public.perfiles where id=a),'Retirar músico conserva administrador';
 denied:=false;begin perform public.banda_accion('respuesta',jsonb_build_object('evento_id',ev,'respuesta','no_voy'));exception when others then denied:=true;end;assert denied,'Administrador sin músico no confirma';
 denied:=false;begin perform public.banda_accion('rol',jsonb_build_object('usuario_id',a,'rol','usuario','es_musico',false));exception when others then denied:=true;end;assert denied,'No se puede quitar el permiso de administrador propio';

 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 assert (select count(*) from public.banda_eventos)=0,'Público no ve eventos internos';
 denied:=false;begin update public.perfiles set es_musico=true where id=u;exception when others then denied:=true;end;assert denied,'Autoasignación de permiso músico bloqueada';
 denied:=false;begin perform public.banda_accion('evento',payload);exception when others then denied:=true;end;assert denied,'Público no crea eventos';
 denied:=false;begin update public.perfiles set rol='admin' where id=u;exception when others then denied:=true;end;assert denied,'Autoasignación de admin bloqueada';
 denied:=false;begin update public.perfiles set rol='musico' where id=u;exception when others then denied:=true;end;assert denied,'Autoasignación de músico bloqueada';
 denied:=false;begin perform public.banda_accion('fichar',jsonb_build_object('evento_id',ev,'token',token));exception when others then denied:=true;end;assert denied,'Público no ficha';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
 assert (select count(*) from public.banda_eventos where id=ev)=1,'Músico ve convocatoria';
 perform public.banda_accion('perfil',jsonb_build_object('nombre','Músico prueba','instrumento','Clarinete'));
 denied:=false;begin perform public.banda_accion('perfil',jsonb_build_object('nombre','Prueba','instrumento','Clarinete','incorporacion',2000));exception when others then denied:=true;end;assert denied,'Año reservado a administración';
 denied:=false;begin perform public.banda_accion('perfil',jsonb_build_object('usuario_id',a,'nombre','Cambio ajeno'));exception when others then denied:=true;end;assert denied,'Perfil ajeno bloqueado';
 perform public.banda_accion('respuesta',jsonb_build_object('evento_id',ev,'respuesta','voy'));
 perform public.banda_accion('respuesta',jsonb_build_object('evento_id',ev,'respuesta','no_voy'));
 assert (select respuesta from public.banda_respuestas where evento_id=ev and usuario_id=m)='no_voy','Cambio de respuesta único';
 denied:=false;begin insert into public.banda_asistencias(evento_id,usuario_id,estado,metodo) values(ev,m,'presente','qr');exception when insufficient_privilege then denied:=true;end;assert denied,'Escritura directa de asistencia bloqueada';
 denied:=false;begin perform public.banda_accion('fichar',jsonb_build_object('evento_id',ev,'token',gen_random_uuid()));exception when others then denied:=true;end;assert denied,'QR inventado bloqueado';
 result:=public.banda_accion('fichar',jsonb_build_object('evento_id',ev,'token',token));
 assert result->>'estado'='presente','QR válido registra presencia sin coordenadas';
 assert exists(select 1 from public.banda_asistencias where evento_id=ev and usuario_id=m and distancia_m is null and precision_m is null),'No se registra ubicación';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 denied:=false;begin perform public.banda_accion('manual',jsonb_build_object('evento_id',ev,'usuario_id',m,'estado','presente','motivo',''));exception when others then denied:=true;end;assert denied,'Corrección exige motivo';
 perform public.banda_accion('manual',jsonb_build_object('evento_id',ev,'usuario_id',m,'estado','presente','motivo','Verificado personalmente en ensayo'));
 assert exists(select 1 from public.banda_auditoria where evento_id=ev and accion='manual' and detalle->'anterior'->>'estado'='presente'),'Auditoría conserva el original';
 -- Segundo evento: presencia válida, QR rotado y cierre de fichaje.
 result:=public.banda_accion('evento',payload);ev2:=(result->>'id')::uuid;
 assert not exists(select 1 from public.banda_convocados where evento_id=ev2 and usuario_id=a),'Administrador sin músico no convocado';
 perform public.banda_accion('abrir',jsonb_build_object('evento_id',ev2));
 result:=public.banda_accion('qr',jsonb_build_object('evento_id',ev2));token:=result->>'token';
 old_token:=token;result:=public.banda_accion('qr',jsonb_build_object('evento_id',ev2));token:=result->>'token';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
 denied:=false;begin perform public.banda_accion('fichar',jsonb_build_object('evento_id',ev2,'token',old_token));exception when others then denied:=true;end;assert denied,'QR sustituido no funciona';
 result:=public.banda_accion('fichar',jsonb_build_object('evento_id',ev2,'token',token));
 assert result->>'estado'='presente','QR válido registra presencia sin GPS';
 denied:=false;begin perform public.banda_accion('fichar',jsonb_build_object('evento_id',ev2,'token',token));exception when others then denied:=true;end;assert denied,'Fichaje duplicado bloqueado';
 assert (select count(*) from public.banda_asistencias where usuario_id<>m)=0,'Músico no ve asistencias ajenas';
 assert (select count(*) from public.banda_auditoria)=0,'Músico no ve auditoría interna';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 perform public.banda_accion('cerrar',jsonb_build_object('evento_id',ev2));
 denied:=false;begin perform public.banda_accion('qr',jsonb_build_object('evento_id',ev2));exception when others then denied:=true;end;assert denied,'No se genera QR con fichaje cerrado';
 perform public.banda_accion('rol',jsonb_build_object('usuario_id',m,'rol','usuario'));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
 assert (select count(*) from public.banda_eventos)=0,'Retirada del rol revoca acceso sin renovar JWT';
end $$;
rollback;
