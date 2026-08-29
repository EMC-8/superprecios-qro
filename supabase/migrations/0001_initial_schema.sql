-- SuperPrecios QRO — esquema inicial
--
-- Idea central: los precios son un HISTÓRICO inmutable, no un valor mutable.
-- Cada scrapeo escribe observaciones nuevas en price_observations; nada se
-- actualiza en su lugar. Eso permite graficar tendencias, auditar de dónde
-- salió cada precio y volver atrás si un scrapeo sale mal.
--
-- Lo que la app consume es la vista current_prices (la observación más reciente
-- por producto+tienda) a través de la función prices_snapshot().

-- ---------------------------------------------------------------------------
-- Catálogo de cadenas y sucursales
-- ---------------------------------------------------------------------------

create table if not exists public.stores (
  id                  text primary key,          -- 'aurrera', 'walmart', ...
  name                text not null,
  short_name          text not null,
  color               text,
  accent_color        text,
  logo_text           text,
  search_url_template text,                      -- {query} se sustituye en cliente
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

comment on table public.stores is 'Cadenas de supermercado. El id debe coincidir con SUPERMARKETS en js/data.js.';

create table if not exists public.branches (
  id          text primary key,                  -- 'walmart-bernardo-quintana'
  store_id    text not null references public.stores(id) on delete cascade,
  name        text not null,
  zone        text,
  postal_code text,
  lat         double precision,
  lng         double precision,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists branches_store_idx on public.branches (store_id) where is_active;

comment on column public.branches.postal_code is
  'CP con el que hay que consultar el sitio de la cadena. Sin esto los sitios devuelven catálogo de Marketplace en vez del súper físico.';

-- ---------------------------------------------------------------------------
-- Catálogo de productos
-- ---------------------------------------------------------------------------

create table if not exists public.categories (
  id   text primary key,
  name text not null,
  icon text
);

create table if not exists public.products (
  ean                   text primary key,        -- EAN-13 / GTIN
  slug                  text unique not null,    -- coincide con el id en PRODUCTS_CATALOG
  name                  text not null,
  category_id           text references public.categories(id) on delete set null,
  unit                  text not null,           -- pz | pqte | sixpack
  pack_amount           numeric not null check (pack_amount > 0),
  pack_unit             text not null check (pack_unit in ('g', 'ml', 'pz')),
  aliases               text[] not null default '{}',
  official_registry_url text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),

  constraint products_ean_format check (ean ~ '^[0-9]{8,14}$')
);

create index if not exists products_category_idx on public.products (category_id) where is_active;

comment on column public.products.pack_amount is
  'Contenido real de la presentación, en la unidad base de pack_unit. Es lo que permite convertir "500g" a número de paquetes.';

-- ---------------------------------------------------------------------------
-- Precios: histórico inmutable
-- ---------------------------------------------------------------------------

create table if not exists public.price_observations (
  id          bigint generated always as identity primary key,
  ean         text not null references public.products(ean) on delete cascade,
  store_id    text not null references public.stores(id) on delete cascade,
  branch_id   text references public.branches(id) on delete set null,
  price       numeric(10, 2) not null check (price > 0),
  currency    text not null default 'MXN',
  captured_at timestamptz not null default now(),
  source      text not null,                     -- 'scraper-v1', 'captura-manual', ...
  source_url  text,
  raw         jsonb                              -- payload original, para depurar
);

-- La consulta caliente es "última observación por producto+tienda".
create index if not exists price_obs_latest_idx
  on public.price_observations (ean, store_id, captured_at desc);

create index if not exists price_obs_captured_idx
  on public.price_observations (captured_at desc);

-- Evita duplicados exactos si un scrapeo se corre dos veces sin cambios.
create unique index if not exists price_obs_dedupe_idx
  on public.price_observations (ean, store_id, coalesce(branch_id, ''), captured_at);

comment on table public.price_observations is
  'Histórico inmutable de precios. Nunca se hace UPDATE: cada captura es una fila nueva.';

-- ---------------------------------------------------------------------------
-- Bitácora de corridas del scraper
-- ---------------------------------------------------------------------------

create table if not exists public.scrape_runs (
  id             bigint generated always as identity primary key,
  source         text not null,
  status         text not null default 'running'
                 check (status in ('running', 'ok', 'partial', 'failed')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  products_seen  integer not null default 0,
  prices_written integer not null default 0,
  errors         jsonb
);

create index if not exists scrape_runs_recent_idx on public.scrape_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Vista: precio vigente por producto y tienda
-- ---------------------------------------------------------------------------

create or replace view public.current_prices
with (security_invoker = true) as
select distinct on (ean, store_id)
  ean,
  store_id,
  branch_id,
  price,
  currency,
  captured_at,
  source,
  source_url
from public.price_observations
order by ean, store_id, captured_at desc;

comment on view public.current_prices is
  'Observación más reciente por producto+tienda. Es lo que ve la app.';
