-- Permite crear una marcha indicando únicamente el título.
-- La secuencia comienza después del mayor ID existente y conserva la
-- compatibilidad con las altas que proporcionan un ID manualmente.

create sequence if not exists public.catalogo_marchas_id_marcha_seq;

select setval(
  'public.catalogo_marchas_id_marcha_seq',
  coalesce((select max(id_marcha) from public.catalogo_marchas), 0) + 1,
  false
);

alter sequence public.catalogo_marchas_id_marcha_seq
  owned by public.catalogo_marchas.id_marcha;

alter table public.catalogo_marchas
  alter column id_marcha
  set default nextval('public.catalogo_marchas_id_marcha_seq');

grant usage, select
  on sequence public.catalogo_marchas_id_marcha_seq
  to authenticated;
