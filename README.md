# rePlay

PWA en español para ver la cámara del móvil con 5, 10, 15, 20 o 30 segundos de retraso. La cámara se procesa localmente, sin micrófono; los clips guardados se quedan en el dispositivo. Solo entran los entrenadores que da de alta el administrador.

Para revisar movimientos en cualquier deporte. La marca se escribe **rePlay**. El directorio, dominio e identificadores internos originales se conservan para mantener las instalaciones y preferencias existentes.

**Estado: candidata de pruebas. Pendiente de aceptación en dos Android físicos.** iPhone está en evaluación y no se garantiza su compatibilidad.

Aplicación publicada: https://replayapp.vercel.app

## Desarrollo

Requisitos: Node.js 22 o superior y pnpm 10.

```sh
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

`pnpm start` sirve la exportación de producción en localhost:3000.

El servidor de desarrollo utiliza `.next-dev/` y las compilaciones de producción `.next/` (la exportación sigue en `out/`). Así se puede ejecutar `pnpm build` mientras está abierto el servidor sin sobrescribir sus archivos ni provocar un bucle de recargas.

El Service Worker solo se registra en producción. Para probar offline, compilar y servir `out/`; el servidor de desarrollo no es una prueba de la PWA. La cámara requiere HTTPS o localhost; una IP LAN en HTTP no es suficiente.

## Uso e instalación

1. Abrir el enlace con conexión en Chrome para Android.
2. Esperar «Lista para usar sin conexión». Este aviso comprueba que el Service Worker controla la página y que todos los recursos de esta compilación están en caché.
3. Pulsar «Instalar aplicación» cuando aparezca o utilizar el menú de Chrome para añadirla a la pantalla de inicio.
4. Colocar el móvil estable, elegir el retraso y pulsar «Iniciar». Permitir la cámara.
5. Esperar a que se prepare el búfer. La reproducción comienza sola, sin reiniciarse en cada intervalo.
6. Pulsar «Detener» para liberar cámara y vídeo. Tocar la imagen recupera los controles ocultos.

En Safari: Compartir → Añadir a pantalla de inicio. Poder instalar la PWA no demuestra que el motor funcione en iPhone. Si no hay soporte para WebM/VP8 con MediaRecorder y MediaSource, se muestra un aviso.

La aplicación intenta mantener la pantalla encendida y abrir pantalla completa. El navegador puede denegarlo. Al bloquear, cambiar de aplicación o perder la pista de cámara se detiene la sesión: al volver hay que iniciar y llenar un búfer nuevo.

## Arquitectura

- `src/lib/video/engine.ts`: ciclo de vida y canalización MediaRecorder → MediaSource. Los fragmentos se incorporan en orden a un único SourceBuffer; nunca se reproducen como archivos independientes.
- `src/lib/video/policy.ts`: retrasos, calidad, límite de 64 MiB contabilizados y política de sincronización.
- React solo presenta estados y métricas; no guarda fotogramas ni controla el reloj del vídeo.
- `scripts/service-worker.mjs`: recorre la exportación estática después de compilar y genera una precaché con hash de contenido. Incluye también los módulos JavaScript y los recursos de error.

El motor expone `start({ delaySeconds, quality, target })`, `stop()`, `dispose()` y eventos de estado, progreso, calidad, métricas, error e interrupción. `resumePlayback()` permite responder a un bloqueo de reproducción automática mediante un gesto explícito.

Se conservan tres segundos detrás del cabezal para facilitar la continuidad. La ventana completa no puede superar el retraso más ocho segundos. El presupuesto contabiliza datos comprimidos retenidos; no mide toda la memoria de Chrome, GPU o decodificador. Ante exceso de memoria, cola o interrupción prolongada, se detiene y propone menor calidad cuando procede.

## Privacidad y persistencia

Se persisten la selección de retraso (`voley-delay:delay:v1`), la interfaz estática de la PWA y los clips que el entrenador guarda (IndexedDB, solo en su dispositivo). El vídeo de la sesión permanece en memoria y nunca se envía por red. Para las analíticas del panel se envían a `/api/events` eventos de uso (apertura, sesión iniciada, clip guardado) con la hora y el id de usuario; se encolan en `localStorage` (`replay:events:v1`) si no hay conexión. Se usan Vercel Web Analytics y Speed Insights (visitas y métricas de rendimiento anónimas, sin cookies); nunca reciben vídeo.

Los datos de diagnóstico son orientativos y permanecen en la interfaz hasta recargar o comenzar otra sesión. La captura sintética de los tests es un reloj generado, no contenido de cámara del usuario.

## Publicación y actualizaciones

```sh
vercel --yes --prod
```

Configurar `NEXT_PUBLIC_SITE_URL` con el dominio público para canonicals, robots y sitemap; si no se define, se usa el dominio de producción del proyecto Vercel y, en local, el dominio provisional documentado en `.env.example`. Las funciones de `api/` necesitan `CLERK_SECRET_KEY` y `DATABASE_URL` (Neon) en las variables de entorno de Vercel.

`vercel.json` utiliza `framework: null` y `outputDirectory: out` intencionadamente: Vercel sirve la exportación como archivos estáticos. Seleccionar el adaptador Next.js con ese directorio hace que busque manifiestos de servidor que no existen en la exportación.

El Service Worker precarga una versión completa. Una actualización espera hasta que todas las ventanas consultadas indiquen que no tienen sesión activa. No fuerza una recarga durante una sesión. Las pestañas con código anterior siguen funcionando; reabrir la aplicación utiliza la nueva versión. Si se eliminan datos del navegador, hay que preparar la caché de nuevo.

Después de publicar: dar de alta el dominio en Google Search Console, enviar `/sitemap.xml` y solicitar indexación. `robots.txt` permite todos los rastreadores, incluidos los de IA.

## Administración

`/admin` es el panel del administrador: un usuario de Clerk con `publicMetadata.role = "admin"`. Desde ahí se crean, editan, desactivan y borran entrenadores, y se consultan clips, sesiones y aperturas. La gráfica cubre los últimos 30 días (Europe/Madrid), los totales acumulan el histórico y los entrenadores activos cuentan los últimos 7 días. Una sesión cuenta cuando empieza la reproducción de la cámara; un clip, cuando se guarda correctamente en el dispositivo. Los eventos anteriores a la activación de las analíticas no se reconstruyen.

Para preparar el administrador en la misma instancia de Clerk que utiliza la app:

1. En **Users → Create user**, crear su usuario y contraseña.
2. En **Public metadata** de ese usuario, guardar `{"role":"admin"}`. El rol es de lectura pública y solo se puede modificar desde el servidor o Clerk; nunca se toma de campos enviados por el navegador.
3. Abrir `https://replayapp.vercel.app/admin` e iniciar sesión. Para crear un entrenador basta con escribir su nombre: el servidor genera un usuario disponible y una contraseña segura, con rol `coach`. Al terminar aparece el mensaje con la URL y las credenciales para compartirlo mediante el menú del dispositivo o copiarlo. Los datos de acceso no tienen caducidad automática; siguen siendo válidos mientras no se cambien o se desactive o elimine la cuenta. Los creados directamente en Clerk también pueden entrar y aparecen en el panel.

La contraseña se muestra solo al crear el acceso o cambiarla desde **Editar**; no se guarda en la caché del panel ni puede recuperarse después de cerrar el mensaje. Si se pierde, el administrador puede establecer una nueva desde **Editar** y compartir los nuevos datos. Cambiar la contraseña cierra las otras sesiones del entrenador. El formulario de entrada permite que el navegador guarde y complete las credenciales.

En **User & authentication**, habilitar nombre, usuario y contraseña (el correo no es obligatorio); en **Access mode**, mantener **Invite-only** (`restricted`). Ocultar el formulario de registro no sustituye esta configuración de Clerk. No hay registro público en la app. La instancia conectada actualmente es de desarrollo; al cambiar a una instancia de producción deben copiarse también estas opciones y configurar sus claves y dominio de Clerk.

- `api/admin/users.ts` y `api/admin/stats.ts` comprueban el rol en el servidor; `/api/session` y `/api/events` también comprueban que la cuenta esté activa y la sesión no esté revocada. Las respuestas privadas llevan `Cache-Control: private, no-store`.
- La sesión se muestra desde caché y se verifica en segundo plano al abrir, volver a la pestaña, recuperar conexión y cada minuto. Al recibir 401 se cierra la sesión. Sin conexión, una desactivación se detecta al recuperar conectividad.
- Los datos del panel y la cola de eventos pertenecen a una cuenta concreta y se limpian al cerrar sesión. Los clips guardados son archivos del usuario, no caché: permanecen en su dispositivo y separados por cuenta.
- Los eventos llevan un identificador estable: los reintentos al recuperar conexión no duplican el conteo. El panel permite actualizar manualmente y se refresca cada minuto mientras está visible.
- Esquema de la base de datos en `scripts/schema.sql`; se aplica con `pnpm db:setup` (lee `.env.local`).
- Para probar las funciones en local: `vercel dev --listen 3001` (`pnpm dev` no sirve `api/`).
- `pnpm test` usa el runner de Node con Clerk y Neon simulados para probar permisos, sesiones revocadas, gestión de entrenadores, paginación y validación de eventos, sin alterar cuentas ni métricas reales.

## Validación y mantenimiento

Consultar [el informe del motor](docs/ENGINE.md) y [el protocolo físico](docs/VALIDATION.md). Mantener el lockfile, ejecutar los checks y volver a probar la exportación offline después de cambiar dependencias o recursos. Una compilación correcta o un test de escritorio no certifican batería, temperatura, cámara móvil ni compatibilidad instalada.
