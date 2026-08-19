alter table public.comunidad_repertorios
    add column if not exists visibilidad text not null default 'publica',
    add column if not exists enlace_token uuid not null default gen_random_uuid();

alter table public.comunidad_repertorios
    drop constraint if exists comunidad_repertorios_visibilidad_check;

alter table public.comunidad_repertorios
    add constraint comunidad_repertorios_visibilidad_check
    check (visibilidad in ('publica', 'miembros', 'enlace'));

create unique index if not exists comunidad_repertorios_enlace_token_idx
on public.comunidad_repertorios (enlace_token);

create index if not exists comunidad_repertorios_visibilidad_fecha_idx
on public.comunidad_repertorios (visibilidad, created_at desc);

alter table public.comunidad_repertorios enable row level security;

drop policy if exists "comunidad_repertorios_select_publico" on public.comunidad_repertorios;
drop policy if exists "comunidad_repertorios_update_auth" on public.comunidad_repertorios;
drop policy if exists "comunidad_repertorios_insert_auth" on public.comunidad_repertorios;

create policy "repertorios_publicos_para_todos"
on public.comunidad_repertorios for select
to anon
using (visibilidad = 'publica');

create policy "repertorios_visibles_para_miembros"
on public.comunidad_repertorios for select
to authenticated
using (
    visibilidad in ('publica', 'miembros')
    or (select auth.uid()) = usuario_id
);

create policy "usuarios_publican_repertorios_propios"
on public.comunidad_repertorios for insert
to authenticated
with check ((select auth.uid()) = usuario_id);

create policy "usuarios_actualizan_repertorios_propios"
on public.comunidad_repertorios for update
to authenticated
using ((select auth.uid()) = usuario_id or es_admin())
with check ((select auth.uid()) = usuario_id or es_admin());

create or replace function public.obtener_repertorio_por_enlace(p_token uuid)
returns setof public.comunidad_repertorios
language sql
stable
security definer
set search_path = ''
as $$
    select proyecto.*
    from public.comunidad_repertorios proyecto
    where proyecto.visibilidad = 'enlace'
      and proyecto.enlace_token = p_token
    limit 1;
$$;

revoke all on function public.obtener_repertorio_por_enlace(uuid) from public, anon, authenticated;
grant execute on function public.obtener_repertorio_por_enlace(uuid) to anon, authenticated;

drop policy if exists "Lectura libre" on public.comunidad_comentarios;
drop policy if exists "comunidad_comentarios_select_publico" on public.comunidad_comentarios;
drop policy if exists "Escritura autenticada" on public.comunidad_comentarios;
drop policy if exists "comunidad_comentarios_insert_propio" on public.comunidad_comentarios;

create policy "comentarios_de_repertorios_visibles"
on public.comunidad_comentarios for select
to anon, authenticated
using (
    exists (
        select 1 from public.comunidad_repertorios proyecto
        where proyecto.id = repertorio_id
    )
);

create policy "miembros_comentan_repertorios_visibles"
on public.comunidad_comentarios for insert
to authenticated
with check (
    (select auth.uid()) = usuario_id
    and exists (
        select 1 from public.comunidad_repertorios proyecto
        where proyecto.id = repertorio_id
    )
);

drop policy if exists "Las valoraciones son públicas" on public.comunidad_valoraciones;
drop policy if exists "Los usuarios crean su valoración" on public.comunidad_valoraciones;

create policy "valoraciones_de_repertorios_visibles"
on public.comunidad_valoraciones for select
to anon, authenticated
using (
    exists (
        select 1 from public.comunidad_repertorios proyecto
        where proyecto.id = repertorio_id
    )
);

create policy "miembros_valoran_repertorios_visibles"
on public.comunidad_valoraciones for insert
to authenticated
with check (
    (select auth.uid()) = usuario_id
    and exists (
        select 1 from public.comunidad_repertorios proyecto
        where proyecto.id = repertorio_id
    )
);
