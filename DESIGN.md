# Diseño

Un entrenador consulta un móvil sobre un trípode en una pista con iluminación intensa: la configuración usa superficie blanca y texto oscuro; durante el ejercicio el vídeo necesita un fondo negro y controles opacos legibles.

- Estrategia contenida: blanco, tinta neutra y verde anclado en OKLCH hue 140.
- Primario `oklch(0.40 0.10 140)`, texto blanco; superficie `oklch(1 0 0)`, tinta `oklch(0.20 0 0)`.
- Tipografía de sistema, escala fija, números tabulares para el retraso y la cuenta atrás.
- Sin sombras decorativas; radios de 8–16 px, selector segmentado y botones de 52 px como mínimo.
- Vídeo con object-fit contain, sin espejo ni recortes, ajustado a 100dvh y safe areas.
- Controles desaparecen a los cuatro segundos y reaparecen al tocar o recibir foco. No se ocultan mientras contienen foco.
- Transiciones de opacidad de 160 ms, instantáneas con movimiento reducido.
