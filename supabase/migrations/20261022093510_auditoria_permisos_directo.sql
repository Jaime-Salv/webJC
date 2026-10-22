-- Remove permissive legacy policies that bypass the later admin/ownership rules.
drop policy if exists "Permitir insertar marchas en directo" on public.repertorio_transaccional;
drop policy if exists "permitir editar marchas" on public.repertorio_transaccional;
drop policy if exists "Escritura autenticados chat" on public.directo_chat;
drop policy if exists "Escritura usuarios comentarios procesion" on public.procesion_comentarios;

-- Profiles contain email and personal data, not a public directory.
drop policy if exists "Cualquiera puede ver perfiles" on public.perfiles;
drop policy if exists "Lectura de perfiles" on public.perfiles;
drop policy if exists perfiles_select_publico on public.perfiles;
create policy perfiles_select_propio_admin on public.perfiles for select to authenticated
using (id=(select auth.uid()) or (select public.es_admin()));

create or replace function public.funcion_contar_comentario() returns trigger
language plpgsql set search_path='' as $$
begin
 update public.comunidad_repertorios set total_comentarios=total_comentarios+1 where id=new.repertorio_id;
 return new;
end $$;
