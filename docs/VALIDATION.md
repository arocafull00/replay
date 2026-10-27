# Pruebas en móviles reales

**Estado: pendiente. Ningún móvil físico se considera certificado todavía.**

El usuario probará los enlaces. Se necesitan dos Android de distinta gama, con Chrome actualizado. Anotar las versiones exactas: la compatibilidad se atribuye a esas combinaciones, no a todos los Android.

## Ficha por dispositivo

| Campo | Resultado |
|---|---|
| Modelo y memoria RAM | Pendiente |
| Android y versión de Chrome | Pendiente |
| Enlace y fecha de la compilación | Pendiente |
| Navegador / instalada | Pendiente |
| Calidad solicitada / concedida | Pendiente |
| Retraso | Pendiente |
| Duración de sesión | Pendiente |
| Batería inicial / final | Pendiente |
| Cargando / sin cargador | Pendiente |
| Temperatura ambiente / del móvil si está disponible | Pendiente |
| Avisos térmicos, bajada de brillo o tirones | Pendiente |
| Retraso mínimo / máximo observado | Pendiente |
| Memoria y descartes al inicio / mitad / final | Pendiente |
| Incidencias y momento en que aparecen | Pendiente |

## Preparación

1. Abrir con conexión y esperar «Lista para usar sin conexión». Instalarla.
2. Colocar el móvil en trípode, preferiblemente horizontal, en condiciones similares al entrenamiento. No tapar el dispositivo.
3. Enfocar un reloj externo con segundos y, preferiblemente, décimas. Otro móvil puede mostrar un cronómetro, pero no usar el mismo que captura.
4. Comparar el reloj externo en directo con el mostrado en el vídeo retardado. No inferir precisión solo desde «Retraso estimado».
5. Abrir «Datos para las pruebas» para anotar dimensiones/FPS reales, datos comprimidos, descartes y estimación de retraso.

## Sesiones

En cada Android, ejecutar 30 minutos para retrasos de 5, 10 y 30 s. Comprobar también 15 y 20 s durante al menos dos minutos. Cubrir navegador e instalada; al menos una sesión larga debe ejecutarse instalada y sin conexión. Si se reduce calidad, repetir la prueba larga con ese perfil y documentar la limitación.

Anotar reloj y diagnóstico al comenzar la reproducción y en los minutos 5, 15, 25 y 30. Observar también entre mediciones: no deben aparecer paradas periódicas, recargas de búfer ni deriva creciente.

Para memoria total, utilizar depuración remota de Chrome si está disponible. El dato mostrado por la aplicación solo contabiliza vídeo comprimido. Es normal una subida inicial al llenarse el búfer; después debe estabilizarse. No aceptar crecimiento sostenido hasta agotar recursos.

## Escenarios de interrupción

- Detener y confirmar que se apaga el indicador de cámara. Iniciar otra vez con un retraso diferente.
- Iniciar, dejar abierto el diálogo de permisos y pulsar Detener; si se concede después, comprobar que la cámara se libera.
- Denegar permisos y verificar un mensaje con pasos de recuperación. Cambiar el permiso desde Chrome y reiniciar.
- Cambiar orientación en reposo y durante la sesión: imagen completa, sin recortes ni espejo.
- Bloquear pantalla y cambiar de aplicación. Al volver, la sesión debe estar detenida y exigir iniciar de nuevo.
- Abrir tras cerrar completamente Chrome en modo avión y reproducir con cámara, no solo ver la pantalla inicial.
- Desconectar internet durante una sesión; no debe afectar al vídeo local.
- Comprobar que tocar el vídeo recupera controles y que Detener puede alcanzarse con teclado/lector si se usan.
- Probar una actualización con una sesión activa: no debe recargarse ni activarse a mitad del ejercicio.
- Revisar tráfico de red: ninguna imagen ni fragmento de vídeo debe salir del móvil.
- Comprobar galería y almacenamiento: no aparecen grabaciones permanentes.

## Criterios de aceptación

- Reproducción continua durante las sesiones largas, retraso dentro de ±1 s durante reproducción estable y ausencia de deriva progresiva.
- Calidad efectiva comunicada y suficiente para revisar los movimientos en los dispositivos de referencia.
- Búfer acotado, sin cierres, avisos térmicos que impidan el uso ni degradación progresiva.
- Cámara liberada tras parada o interrupción, apertura y captura offline, errores comprensibles e interfaz móvil legible.

Si falla una condición, adjuntar modelo, perfil, retraso y momento del fallo. No marcar el MVP como aceptado hasta resolverlo o concretar una limitación aceptada. Safari/PWA en iPhone se registran en una ficha separada como evaluación adicional.
