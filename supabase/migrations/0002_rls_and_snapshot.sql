-- SuperPrecios QRO — seguridad y función de snapshot
--
-- Modelo de acceso:
--   - anon / authenticated: SOLO LECTURA de todo. Los precios son información
--     pública; la app es un cliente estático sin login.
--   - El scraper escribe con la service_role key, que salta RLS. Esa llave
--     nunca debe salir del servidor ni del secreto de CI.

-- ---------------------------------------------------------------------------
-- RLS: activar en todas las tablas y permitir solo lectura pública
-- ---------------------------------------------------------------------------

alter table public.stores             enable row level security;
alter table public.branches           enable row level security;
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.price_observations enable row level security;
alter table public.scrape_runs        enable row level security;

drop policy if exists "lectura publica de tiendas"     on public.stores;
drop policy if exists "lectura publica de sucursales"  on public.branches;
drop policy if exists "lectura publica de categorias"  on public.categories;
drop policy if exists "lectura publica de productos"   on public.products;
drop policy if exists "lectura publica de precios"     on public.price_observations;
drop policy if exists "lectura publica de corridas"    on public.scrape_runs;

create policy "lectura publica de tiendas"
  on public.stores for select to anon, authenticated using (true);

create policy "lectura publica de sucursales"
  on public.branches for select to anon, authenticated using (true);

create policy "lectura publica de categorias"
  on public.categories for select to anon, authenticated using (true);

create policy "lectura publica de productos"
  on public.products for select to anon, authenticated using (true);

create policy "lectura publica de precios"
  on public.price_observations for select to anon, authenticated using (true);

create policy "lectura publica de corridas"
  on public.scrape_runs for select to anon, authenticated using (true);

-- No se crean policies de INSERT/UPDATE/DELETE a propósito: con RLS activo y
-- sin policy de escritura, anon no puede modificar nada. La service_role key
-- salta RLS y es la única que escribe.

-- ---------------------------------------------------------------------------
-- prices_snapshot(): devuelve exactamente el mismo documento que data/prices.json
-- ---------------------------------------------------------------------------
--
-- Que el formato sea idéntico al del archivo estático es deliberado: la app
-- puede leer de la base o del archivo sin ninguna rama extra en el cliente,
-- y el archivo sigue sirviendo como respaldo offline.

create or replace function public.prices_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with por_producto as (
    select
      ean,
      jsonb_object_agg(store_id, price) as precios,
      max(captured_at)                  as ultimo
    from public.current_prices
    group by ean
  )
  select jsonb_build_object(
    'generatedAt', coalesce(to_char(max(ultimo) at time zone 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                            to_char(now() at time zone 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    'source',      'supabase',
    'sourceLabel', 'Base de datos SuperPrecios QRO',
    'currency',    'MXN',
    'region',      'Queretaro, Qro., MX',
    'postalCode',  '76000',
    'products',    coalesce(jsonb_object_agg(ean, precios), '{}'::jsonb)
  )
  from por_producto;
$$;

comment on function public.prices_snapshot() is
  'Devuelve la tabla de precios vigente con el mismo esquema que data/prices.json.';

grant execute on function public.prices_snapshot() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- price_history(): serie de tiempo de un producto, para graficar tendencias
-- ---------------------------------------------------------------------------

create or replace function public.price_history(
  p_ean  text,
  p_days integer default 90
)
returns table (
  store_id    text,
  price       numeric,
  captured_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select store_id, price, captured_at
  from public.price_observations
  where ean = p_ean
    and captured_at >= now() - make_interval(days => greatest(p_days, 1))
  order by captured_at asc;
$$;

grant execute on function public.price_history(text, integer) to anon, authenticated;
