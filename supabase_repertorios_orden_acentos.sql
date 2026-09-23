-- Actualiza la ordenación A-Z de los repertorios anuales en borrador.
-- Mantiene los signos y tildes en el título visible; solo cambia la comparación.
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
