# Task Tracker — versión web

Versión web del task tracker, con login y conectada en vivo a Supabase
(proyecto `task-app`). Cada usuario tiene sus propias áreas, proyectos y
tareas — separadas del resto — con actualizaciones en tiempo real entre
pestañas/dispositivos de una misma cuenta.

## Cómo publicarla en GitHub Pages

1. Subí esta carpeta entera a un repositorio de GitHub (público o privado).
2. En el repo, andá a **Settings → Pages** y en "Build and deployment" elegí
   **Source: GitHub Actions**.
3. Hacé `git push` a la rama `main`. El workflow en
   `.github/workflows/deploy.yml` compila y publica solo — no hace falta
   compilar nada a mano.
4. A los pocos minutos la app va a estar viva en la URL que te asigna GitHub
   Pages (aparece en Settings → Pages una vez que termina el primer deploy).

## Login — qué falta activar del lado de Supabase

El login por **email** ya funciona de fábrica, sin nada que configurar.

### "Probar sin cuenta" (modo invitado)

1. En el [dashboard de Supabase](https://supabase.com/dashboard/project/ezbhodcepwpoxehlaejp),
   andá a **Authentication → Sign In / Providers**.
2. Buscá **Anonymous Sign-Ins** y activalo.

Sin este paso, el botón "Probar sin cuenta" va a mostrar un error pidiendo
justamente que lo actives.

### Login con Google

Por ahora no está — el trámite de Google exige "verificar" la app o, mientras
no la verificás, muestra un cartel de "app no verificada" a cada usuario que
intenta entrar, lo cual espanta a cualquiera que no sepa que es esperable.
Si en algún momento se vuelve una prioridad (por ejemplo, si el número de
usuarios crece y vale la pena pasar por la verificación de Google), es
cuestión de retomarlo — el resto de la infraestructura de login ya está lista
para sumarlo.

## Desarrollo local

```
npm install
npm run dev
```

## Sobre los datos

- Cada usuario (con cuenta o invitado) tiene su propia fila en la tabla,
  protegida por Row Level Security — nadie puede ver ni tocar los datos de
  otro usuario.
- Un usuario invitado (modo "Probar sin cuenta") queda atado a ese navegador
  puntual — si borra los datos del navegador o entra desde otro dispositivo,
  no va a ver la misma sesión. Si en algún momento se quiere poder "pasar"
  esos datos a una cuenta con email, Supabase soporta convertir una sesión
  anónima en una cuenta real (`linkIdentity`) — es un paso aparte, avisame si
  lo necesitás.
- Las credenciales de Supabase (URL + `anon key`) están directamente en el
  código (`src/App.jsx`). Es intencional: la `anon key` está pensada para ser
  pública — lo que protege los datos es Row Level Security, no ocultar la key.
- **Cifrado de extremo a extremo (zero-knowledge)**: los datos se cifran en
  tu navegador (AES-256-GCM, clave derivada con PBKDF2 vía Web Crypto API)
  *antes* de salir hacia Supabase. Supabase solo recibe y guarda bytes
  cifrados — ni Supabase ni nadie con acceso a la base puede leer tus tareas.
- La contraseña de cifrado es **distinta** de la contraseña de login, y nunca
  se envía a ningún servidor — vive únicamente en la memoria de tu navegador
  mientras usás la app. Se pide una vez por sesión (al cerrar la pestaña o
  recargar, hay que volver a ingresarla).
- **Si la olvidás, no hay forma de recuperar los datos.** No existe un
  "restablecer contraseña" para esto — es la contrapartida inevitable de que
  ni siquiera nosotros podamos leerlos.
- Consecuencia directa de este diseño: como Supabase nunca ve el contenido
  real, **el conector de Supabase de Claude no puede leer ni escribir tareas
  en esta versión** — solo vería bytes cifrados. Si en algún momento se
  prioriza esa integración por sobre el cifrado, es una decisión de diseño
  aparte, no algo que se pueda tener ambas cosas a la vez sobre los mismos
  datos.

## Estructura de la tabla en Supabase

Ya está creada y migrada a "una fila por usuario" en el proyecto `task-app`,
documentada acá por si alguna vez hace falta recrearla:

```sql
create table if not exists app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_data enable row level security;

create policy "users manage their own row"
on app_data for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```
