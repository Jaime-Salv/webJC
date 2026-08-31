-- Repertorios por temporada con numeración independiente del catálogo maestro.
-- Ejecutar en Supabase antes de publicar el frontend de repertorios anuales.

create extension if not exists pgcrypto;
create extension if not exists unaccent;

create table if not exists public.repertorios_temporada (
    id_repertorio uuid primary key default gen_random_uuid(),
    temporada integer not null unique check (temporada between 2000 and 2100),
    nombre text not null,
    estado text not null default 'Borrador'
        check (estado in ('Borrador', 'Activo', 'Archivado')),
    creado_en timestamptz not null default now(),
    activado_en timestamptz
);

create unique index if not exists repertorios_temporada_un_activo_idx
on public.repertorios_temporada ((estado)) where estado = 'Activo';

create table if not exists public.repertorio_temporada_marchas (
    id_repertorio uuid not null
        references public.repertorios_temporada(id_repertorio) on delete cascade,
    id_marcha integer not null
        references public.catalogo_marchas(id_marcha) on delete restrict,
    numero_repertorio integer not null check (numero_repertorio > 0),
    creado_en timestamptz not null default now(),
    primary key (id_repertorio, id_marcha),
    unique (id_repertorio, numero_repertorio)
);

create index if not exists repertorio_temporada_marchas_marcha_idx
on public.repertorio_temporada_marchas (id_marcha);

alter table public.maestro_procesiones
    add column if not exists id_repertorio uuid
    references public.repertorios_temporada(id_repertorio) on delete set null;

alter table public.repertorio_transaccional
    add column if not exists numero_repertorio integer
    check (numero_repertorio is null or numero_repertorio > 0);

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = 'public'
as $$
    select exists (
        select 1 from public.perfiles
        where perfiles.id = auth.uid() and perfiles.rol = 'admin'
    );
$$;

create or replace function public.crear_repertorio_temporada(
    p_temporada integer,
    p_copiar_desde uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
    nuevo_id uuid;
begin
    if not public.es_admin() then
        raise exception 'Solo un administrador puede crear repertorios';
    end if;
    if p_temporada < 2000 or p_temporada > 2100 then
        raise exception 'Temporada no válida';
    end if;
    insert into public.repertorios_temporada (temporada, nombre, estado)
    values (p_temporada, 'Repertorio ' || p_temporada, 'Borrador')
    returning id_repertorio into nuevo_id;

    if p_copiar_desde is not null then
        if not exists (
            select 1 from public.repertorios_temporada
            where id_repertorio = p_copiar_desde
        ) then
            raise exception 'El repertorio de origen no existe';
        end if;

        insert into public.repertorio_temporada_marchas
            (id_repertorio, id_marcha, numero_repertorio)
        select nuevo_id, id_marcha, numero_repertorio
        from public.repertorio_temporada_marchas
        where id_repertorio = p_copiar_desde;
    end if;
    return nuevo_id;
end;
$$;

create or replace function public.reordenar_repertorio_alfabetico(
    p_id_repertorio uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
    if not public.es_admin() then
        raise exception 'Solo un administrador puede ordenar repertorios';
    end if;
    if not exists (
        select 1 from public.repertorios_temporada
        where id_repertorio = p_id_repertorio and estado = 'Borrador'
    ) then
        raise exception 'Solo se puede ordenar un repertorio en borrador';
    end if;

    -- Evita colisiones con el índice único durante la renumeración.
    update public.repertorio_temporada_marchas
    set numero_repertorio = numero_repertorio + 1000000
    where id_repertorio = p_id_repertorio;

    with ordenadas as (
        select relacion.id_marcha,
               row_number() over (
                   order by lower(marcha.titulo) collate "es-ES-x-icu",
                            relacion.id_marcha
               )::integer as nuevo_numero
        from public.repertorio_temporada_marchas relacion
        join public.catalogo_marchas marcha using (id_marcha)
        where relacion.id_repertorio = p_id_repertorio
    )
    update public.repertorio_temporada_marchas relacion
    set numero_repertorio = ordenadas.nuevo_numero
    from ordenadas
    where relacion.id_repertorio = p_id_repertorio
      and relacion.id_marcha = ordenadas.id_marcha;
end;
$$;

create or replace function public.activar_repertorio_temporada(
    p_id_repertorio uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
    if not public.es_admin() then
        raise exception 'Solo un administrador puede activar repertorios';
    end if;

    if exists (
        select 1 from public.maestro_procesiones where estado = 'Activa'
    ) then
        raise exception 'No se puede cambiar el repertorio activo mientras hay una actuación en directo';
    end if;

    if not exists (
        select 1 from public.repertorios_temporada repertorio
        where repertorio.id_repertorio = p_id_repertorio
          and repertorio.estado = 'Borrador'
          and exists (
              select 1 from public.repertorio_temporada_marchas marchas
              where marchas.id_repertorio = repertorio.id_repertorio
          )
    ) then
        raise exception 'El repertorio debe estar en borrador y contener marchas';
    end if;

    if exists (
        select 1 from public.repertorios_temporada
        where id_repertorio = p_id_repertorio and estado = 'Borrador'
    ) then
        perform public.reordenar_repertorio_alfabetico(p_id_repertorio);
    end if;

    update public.repertorios_temporada
    set estado = 'Archivado'
    where estado = 'Activo' and id_repertorio <> p_id_repertorio;
    update public.repertorios_temporada
    set estado = 'Activo', activado_en = coalesce(activado_en, now())
    where id_repertorio = p_id_repertorio;
end;
$$;

alter table public.repertorios_temporada enable row level security;
alter table public.repertorio_temporada_marchas enable row level security;

drop policy if exists "repertorios_temporada_select_publico" on public.repertorios_temporada;
create policy "repertorios_temporada_select_publico"
on public.repertorios_temporada for select to anon, authenticated using (true);

drop policy if exists "repertorios_temporada_admin_insert" on public.repertorios_temporada;
create policy "repertorios_temporada_admin_insert"
on public.repertorios_temporada for insert to authenticated
with check (public.es_admin());
drop policy if exists "repertorios_temporada_admin_update" on public.repertorios_temporada;
create policy "repertorios_temporada_admin_update"
on public.repertorios_temporada for update to authenticated
using (public.es_admin()) with check (public.es_admin());
drop policy if exists "repertorios_temporada_admin_delete" on public.repertorios_temporada;
create policy "repertorios_temporada_admin_delete"
on public.repertorios_temporada for delete to authenticated
using (public.es_admin());

drop policy if exists "repertorio_temporada_marchas_select_publico" on public.repertorio_temporada_marchas;
create policy "repertorio_temporada_marchas_select_publico"
on public.repertorio_temporada_marchas for select to anon, authenticated using (true);

drop policy if exists "repertorio_temporada_marchas_admin_insert" on public.repertorio_temporada_marchas;
create policy "repertorio_temporada_marchas_admin_insert"
on public.repertorio_temporada_marchas for insert to authenticated
with check (public.es_admin());
drop policy if exists "repertorio_temporada_marchas_admin_update" on public.repertorio_temporada_marchas;
create policy "repertorio_temporada_marchas_admin_update"
on public.repertorio_temporada_marchas for update to authenticated
using (public.es_admin()) with check (public.es_admin());
drop policy if exists "repertorio_temporada_marchas_admin_delete" on public.repertorio_temporada_marchas;
create policy "repertorio_temporada_marchas_admin_delete"
on public.repertorio_temporada_marchas for delete to authenticated
using (public.es_admin());

revoke all on function public.crear_repertorio_temporada(integer, uuid) from public, anon;
revoke all on function public.reordenar_repertorio_alfabetico(uuid) from public, anon;
revoke all on function public.activar_repertorio_temporada(uuid) from public, anon;
revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.crear_repertorio_temporada(integer, uuid) to authenticated;
grant execute on function public.reordenar_repertorio_alfabetico(uuid) to authenticated;
grant execute on function public.activar_repertorio_temporada(uuid) to authenticated;
grant select
on public.repertorios_temporada, public.repertorio_temporada_marchas
to anon;
grant select, insert, update, delete
on public.repertorios_temporada, public.repertorio_temporada_marchas
to authenticated;
