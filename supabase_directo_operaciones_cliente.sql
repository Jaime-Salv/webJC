-- Identifica cada envío del móvil para reconocer reintentos tras un corte de red.
alter table public.repertorio_transaccional
    add column if not exists id_operacion_cliente text;

create unique index if not exists repertorio_transaccional_operacion_cliente_idx
    on public.repertorio_transaccional (id_procesion, id_operacion_cliente)
    where id_operacion_cliente is not null;
