# rePlay

PWA en español para ver la cámara del móvil con 5, 10, 15, 20 o 30 segundos de retraso. La cámara se procesa localmente, sin micrófono, cuentas, nube ni grabaciones guardadas.

Para revisar movimientos en cualquier deporte. La marca se escribe **rePlay**. El directorio, dominio e identificadores internos originales se conservan para mantener las instalaciones y preferencias existentes.

**Estado: candidata de pruebas. Pendiente de aceptación en dos Android físicos.** iPhone está en evaluación y no se garantiza su compatibilidad.

Aplicación publicada: https://voley-delay.vercel.app

## Desarrollo

Requisitos: Node.js 22 o superior y pnpm 10.

```sh
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
pnpm start
```

`pnpm start` sirve la exportación de producción en localhost:3000.

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

Solo se persiste la selección de retraso (`voley-delay:delay:v1`) y la interfaz estática de la PWA. El vídeo permanece en memoria. No se escribe vídeo en Cache Storage, IndexedDB, galería o archivos, ni se envía por red. No hay analítica.

Los datos de diagnóstico son orientativos y permanecen en la interfaz hasta recargar o comenzar otra sesión. La captura sintética de los tests es un reloj generado, no contenido de cámara del usuario.

## Publicación y actualizaciones

```sh
vercel --yes --prod
```

Configurar `NEXT_PUBLIC_SITE_URL` con el dominio público para canonicals, robots y sitemap; si no se define, se usa el dominio de producción del proyecto Vercel y, en local, el dominio provisional documentado en `.env.example`. No se necesita ninguna clave secreta.

`vercel.json` utiliza `framework: null` y `outputDirectory: out` intencionadamente: Vercel sirve la exportación como archivos estáticos. Seleccionar el adaptador Next.js con ese directorio hace que busque manifiestos de servidor que no existen en la exportación.

El Service Worker precarga una versión completa. Una actualización espera hasta que todas las ventanas consultadas indiquen que no tienen sesión activa. No fuerza una recarga durante una sesión. Las pestañas con código anterior siguen funcionando; reabrir la aplicación utiliza la nueva versión. Si se eliminan datos del navegador, hay que preparar la caché de nuevo.

Después de publicar: dar de alta el dominio en Google Search Console, enviar `/sitemap.xml` y solicitar indexación. `robots.txt` permite todos los rastreadores, incluidos los de IA.

## Validación y mantenimiento

Consultar [el informe del motor](docs/ENGINE.md) y [el protocolo físico](docs/VALIDATION.md). Mantener el lockfile, ejecutar los checks y volver a probar la exportación offline después de cambiar dependencias o recursos. Una compilación correcta o un test de escritorio no certifican batería, temperatura, cámara móvil ni compatibilidad instalada.
