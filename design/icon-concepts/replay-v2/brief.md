# rePlay · nuevo icono

Exploración del 27 de octubre de 2026. Dirección final aprobada: C · Retorno con deportista, integrada en los recursos activos. Se conservan las propuestas anteriores como historial.

Referencia leída: Obsidian, Recursos y herramientas.md, Diseño y branding; imagen Adjuntos/iconos-app-referencia.webp. Preferencia explícita: contenedor de esquinas muy redondeadas, un elemento central grande, volumen suave y acabados de cristal o satinados. Solo se desarrolla el icono y sus adaptaciones; no un sistema completo de marca.

Producto actual: cámara con retraso para revisar movimientos en cualquier deporte. Nombre exacto rePlay. Clara, sobria, práctica. Mantener como punto de partida el verde #24542b de la aplicación. Las exploraciones anteriores de Voley Delay se conservan como historial, pero el balón y la V ya no corresponden al alcance del producto.

## Exploración de ideas

1. R con reproducción en su contraforma: identidad y función en una silueta. A, Repetir.
2. Dos fotogramas desplazados, reproducción en el delantero: el mismo movimiento después. B, Eco.
3. Cinta triangular que retorna a su inicio: continuidad y repetición. C, Retorno.
4. Botón play aislado: reconocimiento alto, distinción baja.
5. Flecha circular con reloj: excesivamente literal y recargada.
6. Dos posiciones de un atleta: pierde lectura a 16 px.
7. Cámara con lente de reloj: demasiadas señales simultáneas.
8. Mascota de balón: limita el producto a deportes con pelota.
9. Monograma rP: difícil de leer en pequeño.
10. Línea temporal con dos puntos: poco peso como icono de aplicación.

## Construcción y pruebas

A: R geométrica maciza, contraforma triangular y pierna diagonal. B: fotograma posterior abierto y placa frontal con triángulo calado. C: banda triangular con retorno en la esquina inferior izquierda. SVG monocromos de exploración en lienzos 256 × 256, sin texto vivo, filtros ni imágenes incrustadas.

La lámina vectorial permite inspeccionar reducciones reales. El render con volumen es una propuesta de acabado: sus miniaturas no son una prueba del favicon. Antes de la integración se debe ajustar la geometría elegida y producir un favicon simplificado, iconos PWA any/maskable, Apple touch y marca de cabecera. scripts/assets.mjs regenera los activos al compilar, por lo que la integración debe actualizar también ese generador.

Recomendación inicial: A por asociar la R de rePlay con una forma reconocible de reproducción; B tiene lectura más literal de vídeo y C enfatiza repetición, pero puede confundirse con controles del reproductor.

## Archivos y comprobaciones

- propuestas.png: comparativa con volumen generada mediante la herramienta integrada image_gen. Prompt completo en prompt.txt. Inspección visual: tres opciones, nombre correcto, composición frontal, acabado satinado y sin elementos de un deporte específico. Es una propuesta de acabado, no un activo final recortado.
- conceptos-vector.png y conceptos-vector.svg: pruebas de las siluetas monocromas a 64, 32 y 16 px. Dos pasadas de revisión y auditoría; ajustados ángulos de A y C. El contrapeso de la pierna de la R justifica su margen derecho ligeramente menor.
- a-repetir.svg, b-eco.svg, c-retorno.svg: bases vectoriales editables. La versión de favicon se refinará al elegir dirección.

La primera entrega añadió únicamente propuestas en design/, sin compilación ni despliegue. Después de la aprobación se integró C · Retorno con deportista; documentación y máster de producción en assets/branding/. La integración se comprobó con compilación, TypeScript, lint y Chromium en escritorio, móvil y sin conexión. No se ha desplegado ni comprobado la actualización del icono en instalaciones físicas existentes.
