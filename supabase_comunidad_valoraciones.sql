-- Ejecutar una sola vez en el editor SQL de Supabase.
-- Sustituye los votos guardados en localStorage por votos reales por usuario.

create table if not exists public.comunidad_valoraciones (
    repertorio_id uuid not null references public.comunidad_repertorios(id) on delete cascade,
    usuario_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (repertorio_id, usuario_id)
);

alter table public.comunidad_valoraciones enable row level security;

drop policy if exists "Las valoraciones son públicas" on public.comunidad_valoraciones;
create policy "Las valoraciones son públicas"
on public.comunidad_valoraciones
for select
using (true);

drop policy if exists "Los usuarios crean su valoración" on public.comunidad_valoraciones;
create policy "Los usuarios crean su valoración"
on public.comunidad_valoraciones
for insert
to authenticated
with check (auth.uid() = usuario_id);

drop policy if exists "Los usuarios eliminan su valoración" on public.comunidad_valoraciones;
create policy "Los usuarios eliminan su valoración"
on public.comunidad_valoraciones
for delete
to authenticated
using (auth.uid() = usuario_id);

create index if not exists comunidad_valoraciones_repertorio_idx
on public.comunidad_valoraciones(repertorio_id);
