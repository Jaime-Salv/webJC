-- Keep the own-user/admin guard and audit log; allow musicians to edit their year.
do $patch$ declare d text;begin
 select pg_get_functiondef('jc_private.banda_accion(text,jsonb)'::regprocedure) into d;
 if position('El año de incorporación lo gestiona administración.' in d)=0 then raise exception 'No se encuentra la restricción esperada';end if;
 d:=replace(d,'if rol<>''admin'' and p_datos ? ''incorporacion'' then raise exception ''El año de incorporación lo gestiona administración.''; end if;','');
 d:=replace(d,'if rol=''admin'' and p_datos ? ''incorporacion'' then update public.banda_fichas','if p_datos ? ''incorporacion'' then update public.banda_fichas');
 execute d;
end $patch$;
