-- Ejecutar antes de publicar el panel de repertorios anuales.
-- Las funciones usan los permisos y las políticas RLS del administrador autenticado.

create or replace function public.reordenar_repertorio_alfabetico(p_id_repertorio uuid)
returns void language plpgsql set search_path = '' as $$
declare
    v_desplazamiento integer;
begin
    if not public.es_admin() then
        raise exception 'Solo un administrador puede reordenar repertorios.' using errcode = '42501';
    end if;
    perform 1 from public.repertorios_temporada
    where id_repertorio = p_id_repertorio and estado = 'Borrador' for update;
    if not found then
        raise exception 'Solo se puede reordenar un repertorio en borrador.' using errcode = '22023';
    end if;

    select coalesce(max(numero_repertorio), 0) + count(*) + 1
    into v_desplazamiento
    from public.repertorio_temporada_marchas where id_repertorio = p_id_repertorio;
    update public.repertorio_temporada_marchas
    set numero_repertorio = numero_repertorio + v_desplazamiento
    where id_repertorio = p_id_repertorio;

    with orden as (
        select m.id_marcha, row_number() over (
            -- Descarta signos iniciales y neutraliza tildes antes de comparar.
            order by translate(regexp_replace(lower(trim(c.titulo)), '^[^[:alnum:]]+', ''),
                               'áéíóúü', 'aeiouu') collate "es-ES-x-icu",
                     lower(c.titulo) collate "es-ES-x-icu", c.id_marcha
        )::integer as nuevo_numero
        from public.repertorio_temporada_marchas m
        join public.catalogo_marchas c on c.id_marcha = m.id_marcha
        where m.id_repertorio = p_id_repertorio
    )
    update public.repertorio_temporada_marchas m
    set numero_repertorio = o.nuevo_numero from orden o
    where m.id_repertorio = p_id_repertorio and m.id_marcha = o.id_marcha;
end;
$$;

create or replace function public.reordenar_repertorio_personalizado(
    p_id_repertorio uuid, p_ids_marchas integer[]
)
returns void language plpgsql set search_path = '' as $$
declare
    v_desplazamiento integer;
begin
    if not public.es_admin() then
        raise exception 'Solo un administrador puede reordenar repertorios.' using errcode = '42501';
    end if;
    perform 1 from public.repertorios_temporada
    where id_repertorio = p_id_repertorio and estado = 'Borrador' for update;
    if not found then
        raise exception 'Solo se puede reordenar un repertorio en borrador.' using errcode = '22023';
    end if;
    if p_ids_marchas is null or cardinality(p_ids_marchas) = 0
       or array_position(p_ids_marchas, null) is not null
       or (select count(distinct id) from unnest(p_ids_marchas) as t(id)) <> cardinality(p_ids_marchas)
       or (select count(*) from public.repertorio_temporada_marchas
           where id_repertorio = p_id_repertorio) <> cardinality(p_ids_marchas)
       or exists (
           select m.id_marcha from public.repertorio_temporada_marchas m
           where m.id_repertorio = p_id_repertorio
           except select id from unnest(p_ids_marchas) as t(id)
       ) then
        raise exception 'El orden debe contener exactamente las marchas de la temporada, sin repetidos.' using errcode = '22023';
    end if;

    select coalesce(max(numero_repertorio), 0) + count(*) + 1
    into v_desplazamiento
    from public.repertorio_temporada_marchas where id_repertorio = p_id_repertorio;
    update public.repertorio_temporada_marchas
    set numero_repertorio = numero_repertorio + v_desplazamiento
    where id_repertorio = p_id_repertorio;

    update public.repertorio_temporada_marchas m
    set numero_repertorio = o.posicion::integer
    from unnest(p_ids_marchas) with ordinality as o(id_marcha, posicion)
    where m.id_repertorio = p_id_repertorio and m.id_marcha = o.id_marcha;
end;
$$;

create or replace function public.activar_repertorio_temporada(p_id_repertorio uuid)
returns void language plpgsql set search_path = '' as $$
declare
    v_estado text;
begin
    if not public.es_admin() then
        raise exception 'Solo un administrador puede activar repertorios.' using errcode = '42501';
    end if;
    if exists (select 1 from public.maestro_procesiones where estado = 'Activa') then
        raise exception 'No se puede cambiar el repertorio activo mientras hay una actuación en directo.' using errcode = '55000';
    end if;
    select estado into v_estado from public.repertorios_temporada
    where id_repertorio = p_id_repertorio for update;
    if v_estado is null then
        raise exception 'El repertorio no existe.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.repertorio_temporada_marchas
                   where id_repertorio = p_id_repertorio) then
        raise exception 'No se puede activar un repertorio vacío.' using errcode = '22023';
    end if;
    -- Se respeta el orden revisado por el administrador; A-Z es una acción aparte.
    update public.repertorios_temporada set estado = 'Archivado'
    where estado = 'Activo' and id_repertorio <> p_id_repertorio;
    update public.repertorios_temporada
    set estado = 'Activo', activado_en = coalesce(activado_en, now())
    where id_repertorio = p_id_repertorio;
end;
$$;

revoke all on function public.reordenar_repertorio_personalizado(uuid, integer[]) from public, anon;
grant execute on function public.reordenar_repertorio_personalizado(uuid, integer[]) to authenticated;
