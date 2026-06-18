-- Ejecutar una sola vez en el editor SQL de Supabase.
-- La tabla solo será gestionada por las funciones seguras de Netlify.

create table if not exists public.push_subscriptions (
    endpoint text primary key,
    p256dh text not null,
    auth text not null,
    user_agent text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Sin políticas públicas: solo la service role de las funciones puede acceder.
create index if not exists push_subscriptions_updated_idx
on public.push_subscriptions(updated_at desc);
