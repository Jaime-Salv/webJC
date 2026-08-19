create table if not exists public.marchas_favoritas (
    usuario_id uuid not null references auth.users(id) on delete cascade,
    id_marcha integer not null references public.catalogo_marchas(id_marcha) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (usuario_id, id_marcha)
);

create index if not exists marchas_favoritas_id_marcha_idx
on public.marchas_favoritas (id_marcha);

alter table public.marchas_favoritas enable row level security;
revoke all on table public.marchas_favoritas from anon;
grant select, insert, delete on table public.marchas_favoritas to authenticated;
grant all on table public.marchas_favoritas to service_role;

create policy "usuarios_ven_sus_favoritas" on public.marchas_favoritas
for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "usuarios_guardan_sus_favoritas" on public.marchas_favoritas
for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "usuarios_borran_sus_favoritas" on public.marchas_favoritas
for delete to authenticated using ((select auth.uid()) = usuario_id);

