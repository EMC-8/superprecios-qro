# Despliegue

La app es un sitio estático sin paso de build. Eso hace el despliegue trivial y
el rollback también. La base de datos es opcional: sin ella la app funciona
leyendo `data/prices.json`.

---

## 1. Subir el repositorio

Ya existe el repo privado `JETER3/superprecios-qro` y el remoto local apunta ahí.
Falta empujar la rama:

```bash
git push -u origin main
```

> El remoto `upstream` sigue apuntando a `EMC-8/superprecios-qro`, el repositorio
> original. Si algún día tienes permiso de escritura ahí, puedes empujar con
> `git push upstream main`.

---

## 2. Vercel

### Opción A — enlazar el repositorio (recomendada)

Es la que quieres para "ir probando mientras mejoramos": cada `git push`
despliega solo.

1. Entra a [vercel.com/new](https://vercel.com/new).
2. Importa `JETER3/superprecios-qro`.
3. **No configures build**: Framework Preset `Other`, Build Command vacío,
   Output Directory vacío. El repo ya trae `vercel.json` con las cabeceras
   correctas.
4. Deploy.

Cada push a `main` genera producción; cada rama genera su propia URL de preview.

### Opción B — desde la terminal

```bash
npx vercel --prod
```

### Qué hace `vercel.json`

| Ruta | Cabecera | Por qué |
|---|---|---|
| `/sw.js` | `no-cache` | Un Service Worker cacheado es un Service Worker que nunca se actualiza |
| `/data/prices.json` | `max-age=0, must-revalidate` | Los precios tienen que poder cambiar sin esperar a que expire un caché |
| `/assets/*` | `max-age=604800` | Íconos que casi nunca cambian |

---

## 3. Supabase (opcional pero recomendado)

Sin esto la app funciona; con esto obtienes histórico de precios y
actualizaciones sin necesidad de commitear.

### 3.1 Crear el proyecto

> **Bloqueo actual:** tu organización *ETER* ya tiene 2 proyectos gratuitos
> activos (`ETERID` y `torrent-studio-crm`), que es el límite del plan. Para
> crear uno nuevo tienes que pausar o borrar alguno de esos, o subir de plan.
> Alternativa sin tocar nada: usar un proyecto existente, ya que todas las
> tablas viven en el esquema `public` con nombres propios del dominio
> (`products`, `stores`, `price_observations`…).

Una vez con proyecto disponible, en **SQL Editor** corre en orden:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_rls_and_snapshot.sql`
3. `supabase/seed.sql`

O con la CLI:

```bash
supabase link --project-ref TU_PROJECT_REF
```

```bash
supabase db push
```

### 3.2 Conectar la app

En **Project Settings → API** copia la URL y la *publishable key*, y ponlas en
[`js/config.js`](../js/config.js):

```js
export const SUPABASE = {
  url: 'https://TU_PROJECT_REF.supabase.co',
  publishableKey: 'sb_publishable_...'
};
```

Commitear esa llave es correcto: es pública por diseño, sólo permite leer, y lo
que protege los datos es RLS. **La `service_role` key nunca va aquí** — esa sólo
vive en los secretos de CI.

Al recargar, el badge del header debe decir **"Precios hoy · en vivo"**.

### 3.3 Verificar

```sql
select public.prices_snapshot();
```

Debe devolver un JSON con la misma forma que `data/prices.json`.

---

## 4. Actualización automática de precios

El workflow [`.github/workflows/actualizar-precios.yml`](../.github/workflows/actualizar-precios.yml)
corre el scraper lunes y jueves, valida el resultado, corre las pruebas y
commitea `data/prices.json`. Ese commit dispara el redespliegue en Vercel.

En **GitHub → Settings → Secrets and variables → Actions**, agrega:

| Secreto | De dónde sale |
|---|---|
| `SUPABASE_URL` | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` |

Sin esos secretos el workflow igual funciona: escribe `data/prices.json` y omite
la base de datos.

Para dispararlo a mano: pestaña **Actions → Actualizar precios → Run workflow**.

---

## 5. Orden recomendado

1. `git push` → repo en GitHub.
2. Importar en Vercel → **ya tienes URL para probar**. Esto no depende de nada más.
3. Cuando liberes un espacio de Supabase: migraciones + seed + `js/config.js`.
4. Cuando la base esté lista: secretos de CI y activar el workflow.

Los pasos 3 y 4 no bloquean al 2. Puedes estar probando la app hoy mismo.
