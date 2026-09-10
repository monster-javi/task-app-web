# Task Tracker — versión de escritorio (Tauri)

Es la misma app que la versión web — literalmente el mismo `src/App.jsx`,
sin cambiar una línea — corriendo dentro de una ventana nativa en vez de un
navegador. Habla con el **mismo proyecto de Supabase** que la web, así que
tus tareas y tu cifrado son compartidos entre las dos: activás cifrado en
una, la otra te pide la misma contraseña para desbloquear.

## Por qué Tauri en vez de Electron

Electron empaqueta un Chromium + Node completos adentro de cada app (~150-300MB).
Tauri usa el navegador que **ya viene instalado en Windows** (WebView2) y un
backend en Rust en vez de Node — el resultado típico es un instalador de
unos pocos MB en vez de cientos. Como toda la lógica de esta app (datos,
cifrado, sincronización) ya vive en el frontend hablando directo con
Supabase, el lado Rust quedó mínimo — literalmente solo abre la ventana,
nada más.

## Cómo conseguir el .exe

Este proyecto se compila en la nube, no localmente:

1. Subí esta carpeta a un repositorio de GitHub (mismo procedimiento que ya
   usaste con la versión web).
2. Con el primer `push` a `main`, se dispara solo el workflow en
   `.github/workflows/build.yml` — usa una máquina Windows real que GitHub
   presta gratis para compilar.
3. Andá a la pestaña **Actions** del repo, entrá a la corrida que terminó
   (tilde verde, tarda varios minutos la primera vez), y al final de esa
   página vas a encontrar un artifact llamado **TaskTracker-Windows** para
   descargar — ahí adentro está el instalador `.exe` (NSIS) y el `.msi`.

Por qué así y no como con la versión de Electron: esa vez alcanzaba con
"Wine" para retocar un ejecutable ya armado. Tauri compila código Rust de
verdad para Windows, y ese paso necesita piezas que este entorno no puede
descargar — por eso el build corre en la propia infraestructura de GitHub
en vez de acá. Es, de hecho, el método que el propio equipo de Tauri
recomienda para esto.

## Desarrollo local

Necesitás Node y Rust instalados (`rustup.rs` para Rust, es lo más simple en
Windows/Mac/Linux):

```
npm install
npm run tauri dev
```

Para compilar vos mismo en tu PC (en vez de esperar a GitHub Actions):

```
npm run tauri build
```

## Sobre los datos y el cifrado

- Mismo proyecto de Supabase, mismas credenciales, mismo esquema — están en
  `src/App.jsx`, igual que en la versión web.
- El cifrado de extremo a extremo (AES-256-GCM + PBKDF2, Web Crypto API) es
  exactamente el mismo código, porque WebView2 (el motor que usa Tauri en
  Windows) soporta Web Crypto igual que cualquier navegador moderno. No hay
  nada que "adaptar" — es el mismo archivo.
- Iniciá sesión con la misma cuenta (email o invitado) que uses en la web
  para ver las mismas tareas acá.
