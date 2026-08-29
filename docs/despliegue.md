# Runbook de despliegue

Guía operativa para conectar Supabase y Vercel. Escrita para que alguien que no
estuvo en el desarrollo pueda ejecutarla de principio a fin.

**Las partes A, B y C son independientes.** La app funciona sin Supabase (lee
`data/prices.json`), así que puedes desplegar en Vercel hoy y conectar la base
después. No hay orden obligatorio salvo dentro de cada parte.

---

## Antes de empezar

| Requisito | Estado |
|---|---|
| Repo | `EMC-8/superprecios-qro` — **público** |
| Rama de producción | `main` |
| Build | **ninguno**. Es un sitio estático de módulos ES. |
| Node para scripts locales | 22+ |

Clona y verifica que todo pasa antes de tocar infraestructura:

```bash
npm test
```

Deben salir **41 pruebas en verde**. Si algo falla, para y avisa: no despliegues
sobre una base rota.

---

## Parte A — Vercel

### A.1 Importar el proyecto

El repositorio es público, así que la GitHub App de Vercel lo ve sin
configuración extra.

1. [vercel.com/new](https://vercel.com/new) → importar `EMC-8/superprecios-qro`.
2. **Framework Preset:** `Other`
3. **Build Command:** vacío
4. **Output Directory:** vacío
5. **Install Command:** vacío
6. Deploy.

> No pongas build. Si Vercel intenta construir algo, la configuración quedó mal:
> este proyecto sirve los archivos tal cual.

El repo ya trae `vercel.json` con las cabeceras necesarias:

| Ruta | Cabecera | Por qué |
|---|---|---|
| `/sw.js` | `no-cache` | Un Service Worker cacheado nunca se actualiza |
| `/data/prices.json` | `max-age=0, must-revalidate` | Los precios deben poder cambiar sin esperar un caché |
| `/assets/*` | `max-age=604800` | Íconos que casi nunca cambian |

### A.2 Verificar

Abre la URL de producción y confirma:

- [ ] Cargan las 5 pestañas: Ahorro & Ruta, Mi Lista, Modo Súper, Compra Guiada, Catálogo.
- [ ] El badge del header dice **"Precios ..."** con una fecha, no "Sin precios cargados".
- [ ] En *Ahorro & Ruta* aparece un total y las tarjetas por tienda.
- [ ] DevTools → *Application* → *Service Workers*: aparece `superprecios-qro-v6`
      **activated and running**.
- [ ] DevTools → *Application* → *Cache Storage*: el caché `superprecios-qro-v6`
      tiene 18 entradas, incluida `data/prices.json`.

> El punto del Service Worker no se pudo verificar durante el desarrollo (el
> navegador usado bloqueaba el registro). **Es la verificación más importante de
> esta lista**: si falla, la app no sirve sin señal, que es justo el escenario
> dentro del súper. Si no se registra, revisa la consola y que `/sw.js` se sirva
> con `Content-Type: application/javascript`.

A partir de aquí, cada push a `main` despliega producción y cada rama genera su
propia URL de preview.

---

## Parte B — Supabase

Sin esto la app funciona. Con esto obtienes histórico de precios y
actualizaciones sin necesidad de commitear.

### B.1 Conseguir un proyecto — bloqueo conocido

La organización **ETER** ya tiene sus 2 proyectos gratuitos activos:
`ETERID` y `torrent-studio-crm`. Supabase no deja crear un tercero.

Tres salidas:

1. **Pausar o borrar uno de esos dos.** Decisión del dueño; nadie más debería
   tomarla.
2. **Subir de plan** la organización.
3. **Usar un proyecto existente.** Es viable: todas las tablas van al esquema
   `public` con nombres propios del dominio (`stores`, `branches`, `categories`,
   `products`, `price_observations`, `scrape_runs`) y no tocan nada previo.
   Revisa antes que esos nombres estén libres en el proyecto que elijas.

### B.2 Aplicar el esquema

En **SQL Editor**, correr **en este orden**:

| # | Archivo | Qué hace |
|---|---|---|
| 1 | `supabase/migrations/0001_initial_schema.sql` | Tablas, índices y la vista `current_prices` |
| 2 | `supabase/migrations/0002_rls_and_snapshot.sql` | RLS de sólo lectura + `prices_snapshot()` + `price_history()` |
| 3 | `supabase/seed.sql` | 6 cadenas, 19 sucursales, 5 categorías, 19 productos, 114 precios |

O con la CLI:

```bash
supabase link --project-ref TU_PROJECT_REF
```

```bash
supabase db push
```

> `supabase/seed.sql` está **generado** desde `js/data.js`. No lo edites a mano:
> si cambias el catálogo, corre `npm run seed` y vuelve a aplicarlo.

### B.3 Verificar el esquema

```sql
select public.prices_snapshot();
```

Debe devolver un JSON con `generatedAt`, `currency`, `region` y `products` con
19 llaves EAN. Si `products` sale vacío, el seed no se aplicó.

Comprobar que RLS quedó bien puesto — esto **debe fallar**:

```sql
set role anon;
insert into public.price_observations (ean, store_id, price, source)
values ('7501020513478', 'aurrera', 1.00, 'prueba');
```

Si ese insert **funciona**, RLS no está activo y cualquiera podría escribir
precios. Para y revisa la migración 0002 antes de seguir.

```sql
reset role;
```

### B.4 Conectar la app

En **Project Settings → API**, copia la URL y la *publishable key* (la pública,
**no** la `service_role`), y ponlas en `js/config.js`:

```js
export const SUPABASE = {
  url: 'https://TU_PROJECT_REF.supabase.co',
  publishableKey: 'sb_publishable_...'
};
```

Commitear esa llave es correcto y esperado: es pública por diseño, sólo permite
leer, y lo que protege los datos es RLS.

**La `service_role` key nunca va en `js/config.js` ni en ningún archivo del
repo.** Sólo vive en los secretos de CI (Parte C). Si alguna vez aparece en un
commit, hay que rotarla en Supabase, no sólo borrarla del archivo.

### B.5 Verificar la conexión

Haz push, espera el deploy y abre la app. El badge del header debe decir:

> 🏷️ Precios hoy **· en vivo**

Ese "· en vivo" es la señal de que está leyendo de Supabase. Si dice sólo
"Precios ..." sin el sufijo, está cayendo al archivo: revisa la consola, suele
ser CORS o la llave mal copiada.

---

## Parte C — Actualización automática de precios

El workflow `.github/workflows/actualizar-precios.yml` ya existe. Corre lunes y
jueves: ejecuta el scraper, valida el resultado, corre las pruebas y commitea
`data/prices.json`. Ese commit dispara el redespliegue en Vercel.

En **GitHub → Settings → Secrets and variables → Actions**, agrega:

| Secreto | De dónde sale |
|---|---|
| `SUPABASE_URL` | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` |

Sin esos secretos el workflow igual funciona: escribe `data/prices.json` y omite
la base de datos.

### Probarlo sin esperar al cron

**Actions → Actualizar precios → Run workflow.**

O localmente, sin escribir nada:

```bash
npm run scrape:dry
```

Descarga ~150 MB del CSV de PROFECO, así que tarda. Salida esperada: encuentra
la quincena publicada más reciente, lee ~437,000 filas, y reporta cobertura por
tienda.

---

## Lo que conviene no romper

Antes de cambiar algo del comportamiento, lee
[`CONTINUIDAD.md`](../CONTINUIDAD.md) sección 2. En corto:

- **Un precio ausente no vale cero.** Está cubierto por pruebas.
- **La `service_role` key no entra al repo ni al cliente.**
- **`supabase/seed.sql` es generado**, no se edita a mano.
- **Todo nombre que se pinte debe pasar por `escaparHtml()`**: la canasta
  compartible acepta contenido de terceros por URL.

---

## Orden sugerido

1. **A** — acceso de Vercel al repo e importar. Ya hay URL para probar. *(no depende de nada)*
2. **B.1** — decidir qué hacer con el límite de proyectos de Supabase. *(decisión del dueño)*
3. **B.2–B.5** — esquema, seed, llaves, verificación.
4. **C** — secretos de CI y disparar el workflow una vez a mano.
