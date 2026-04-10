# Depósito App

PWA offline-first para consulta y control de stock en depósito.

## Stack

- **Astro** (modo hybrid) + **Svelte**
- **IndexedDB** (`idb`) — datos locales, funciona sin internet
- **Supabase** — base de datos remota, sync en segundo plano
- **Fly.io** — hosting

---

## Setup inicial

### 1. Clonar e instalar

```bash
git clone ...
cd deposito-app
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env
# Editá .env con tus credenciales de Supabase
```

### 3. Crear tablas en Supabase

En tu proyecto Supabase → **SQL Editor** → pegá y ejecutá el contenido de:
```
supabase/schema.sql
```

### 4. Importar productos desde el PDF

```bash
# Primero instalá dependencias del script
pip install pymupdf

# Luego corré el script pasándole tu PDF
python scripts/import_pdf.py ruta/al/listado.pdf

# El script genera productos.json y lo sube a Supabase automáticamente
# (necesita SUPABASE_URL y SUPABASE_KEY en el entorno)
```

### 5. Correr en local

```bash
npm run dev
# Abrí http://localhost:4321 en tu teléfono (en la misma red WiFi)
```

---

## Deploy en Fly.io

```bash
# Primera vez
fly launch --no-deploy
fly secrets set PUBLIC_SUPABASE_URL=tu-url PUBLIC_SUPABASE_ANON_KEY=tu-key
fly deploy

# Deploys siguientes
fly deploy
```

---

## Estructura del proyecto

```
src/
├── pages/
│   ├── index.astro          ← app principal (estática + PWA)
│   └── api/
│       └── sync.ts          ← endpoint de sync (server-side)
├── components/
│   ├── Buscador.svelte      ← input de búsqueda
│   ├── ResultsList.svelte   ← lista de resultados
│   ├── StockModal.svelte    ← modal para agregar stock/lote
│   └── SyncStatus.svelte   ← indicador online/offline
├── lib/
│   ├── supabase.ts          ← cliente y helpers de Supabase
│   ├── idb.ts               ← IndexedDB (datos locales)
│   └── sync.ts              ← motor de sincronización
└── sw.ts                    ← Service Worker

scripts/
└── import_pdf.py            ← extrae productos del PDF → Supabase

supabase/
└── schema.sql               ← tablas y políticas RLS
```

---

## Flujo offline-first

1. **Primera vez con WiFi**: la app descarga todos los productos y stock → IndexedDB
2. **Uso diario sin internet**: búsquedas y actualizaciones van a IndexedDB
3. **Cuando volvé el WiFi**: sync automática silenciosa de cambios pendientes
