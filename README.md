# Task Tracker — versión web

Versión web del task tracker, conectada en vivo a Supabase (proyecto `task-app`).
Es la misma app que la versión de escritorio, pero sin cifrado local ni archivo
en disco — todo vive directo en la base de datos, con actualizaciones en tiempo
real (si editás en otra pestaña o dispositivo, se refleja solo, sin recargar).

## Cómo publicarla en GitHub Pages

1. Subí esta carpeta entera a un repositorio de GitHub (público o privado, ambos
   sirven para Pages en cuentas normales).
2. En el repo, andá a **Settings → Pages** y en "Build and deployment" elegí
   **Source: GitHub Actions**.
3. Hacé `git push` a la rama `main`. El workflow en
   `.github/workflows/deploy.yml` se encarga solo de compilar (`npm run build`)
   y publicar el resultado — no hace falta que compiles nada a mano.
4. A los pocos minutos, la app va a estar viva en la URL que GitHub Pages te
   asigna (aparece en la misma pantalla de Settings → Pages una vez que termina
   el primer deploy).

Cada vez que vuelvas a hacer `git push`, se vuelve a publicar sola.

## Desarrollo local

```
npm install
npm run dev
```

## Sobre los datos

- Las credenciales de Supabase (URL + `anon key`) están directamente en el
  código (`src/App.jsx`, arriba de todo). Esto es intencional y normal para
  este tipo de app: la `anon key` está pensada para ser pública — lo que
  protege los datos es la política de Row Level Security de la tabla
  `app_data`, no que la key esté escondida.
- Hoy es un solo espacio de datos compartido (no hay login de usuarios) —
  cualquiera que tenga el link a esta página puede ver y editar las mismas
  tareas. Si en algún momento hace falta que cada persona tenga lo suyo, hay
  que sumar Supabase Auth — es un paso aparte, avisame si lo necesitás.
- No hay cifrado de por medio en esta versión — los datos viajan y se guardan
  en texto plano en Supabase. La versión de escritorio sigue siendo la que
  tiene cifrado local opcional.

## Estructura de la tabla en Supabase

Ya está creada en el proyecto `task-app`, pero por las dudas quede
documentado — si alguna vez necesitás recrearla:

```sql
create table if not exists app_data (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_data enable row level security;

create policy "tasktracker row access"
on app_data for all
using (id = 'tasktracker')
with check (id = 'tasktracker');
```
