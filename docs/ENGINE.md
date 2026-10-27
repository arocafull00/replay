# Informe del motor

## Decisión provisional

Canalización candidata: `getUserMedia → MediaRecorder (WebM/VP8) → MediaSource → video`. La elección de producción depende todavía de las pruebas físicas del protocolo de validación.

La API no garantiza que cada Blob de MediaRecorder pueda reproducirse solo. Esta implementación mantiene un grabador continuo y una única secuencia MSE con su inicialización, incorporación ordenada y retirada del contenido ya reproducido. El intervalo solicitado de 250 ms no se utiliza como reloj.

## Comportamiento

- Preferencia de cámara trasera, sin audio. Perfiles: 1280×720 a 30 FPS, 1280×720 a 24 FPS y 854×480 a 24 FPS. Las dimensiones y FPS realmente concedidos se muestran en pantalla.
- Los errores de restricciones permiten probar el siguiente perfil. Una denegación de permiso no provoca solicitudes repetidas. Se puede elegir una calidad inferior antes de iniciar.
- Tiempo objetivo de reproducción: reloj monotónico desde el inicio de captura menos el retraso. Comprobación cada 250 ms; correcciones de velocidad entre 0,94 y 1,06 y búsqueda si el desfase supera 0,9 s.
- La estimación de retraso utiliza el último fotograma presentado, cuando el navegador proporciona requestVideoFrameCallback. No incluye una medición independiente del sensor ni de la pantalla; debe contrastarse con el reloj externo.
- Presupuesto de datos comprimidos de 64 MiB y cola pendiente de 16 MiB. La memoria total del navegador puede ser superior.
- Parada idempotente. Se detienen pistas y grabador, se eliminan colas y referencias, se revoca la URL y se libera Wake Lock. Una cámara que llegue después de cancelar permisos se detiene inmediatamente.

## Evidencia y límites

La suite de navegador usa un canvas de 1280×720 con reloj y movimiento, capturado a 30 FPS y codificado realmente por Chromium. Comprueba 5, 10 y 30 s, margen de ±1 s durante las muestras, continuidad, liberación de pistas y funcionamiento offline.

Esto es evidencia del flujo multimedia en escritorio, no de sesiones de treinta minutos en Android. El informe de ejecución de Playwright indica qué casos pasaron en cada compilación. No hay dispositivos físicos certificados en esta entrega.

Comprobaciones locales del 27 de octubre de 2026: 8 pruebas unitarias y 10 escenarios E2E verificados en Chromium, incluyendo permisos tardíos, parada por visibilidad, accesibilidad WCAG A/AA mediante axe y una actualización solicitada desde una segunda ventana mientras la primera reproduce. Compilación, TypeScript y ESLint correctos. Las muestras sintéticas con 5, 10 y 30 s permanecieron dentro de ±1 s; no equivalen a una sesión larga física.

Publicación comprobada en https://voley-delay.vercel.app el mismo día: los 10 escenarios E2E pasaron contra el dominio HTTPS en 1,6 minutos. Se verificaron respuestas públicas para manifiesto, Service Worker, robots, sitemap, llms y 404; iconos de 192/512 px, maskable, Apple Touch Icon y OG de 1200×630. Las cabeceras limitan la cámara al propio origen y deshabilitan el micrófono. La prueba offline también capturó y reprodujo el reloj sintético con la red desactivada.

## Cuándo evaluar WebCodecs

Si el motor MSE falla en Android por compatibilidad, deriva, discontinuidades o memoria, implementar el mismo contrato con WebCodecs y canvas. Probar H.264 y después VP8 mediante VideoEncoder/VideoDecoder.isConfigSupported, retener fotogramas clave y sus dependencias, acotar las colas y cerrar cada VideoFrame. Aplicar exactamente el mismo protocolo sintético y físico.

No se incluye un segundo motor sin una necesidad demostrada. Si ambos motores fallan en los Android objetivo, detener la entrega final y valorar una aplicación nativa. No declarar inviable toda la PWA por el fallo de un único navegador o dispositivo.

## Fuentes técnicas

- https://www.w3.org/TR/mediastream-recording/
- https://developer.chrome.com/docs/web-platform/best-practices/webcodecs
- https://nextjs.org/docs/app/guides/progressive-web-apps
