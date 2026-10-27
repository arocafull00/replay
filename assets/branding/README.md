# Icono rePlay

Dirección aprobada: C · Retorno con deportista. Contenedor grafito, cinta satinada clara y figura que emerge del pliegue; sin equipo que lo limite a un deporte.

- `replay-athlete-master.png`: máster raster con transparencia exterior, preparado con la herramienta integrada de imágenes a partir de la propuesta aprobada. Conserva el acabado con volumen; no es un SVG vectorial.
- `favicon.svg`: adaptación vectorial plana para tamaños pequeños, con huecos amplios y sin sombras. Mantiene figura, cabeza y flecha de retorno.
- `production-prompt.txt`: instrucciones de preparación del máster.

`node scripts/assets.mjs` exporta los recursos a `public/`: marca de cabecera de 96 px, iconos PWA de 192/512 px, variante maskable opaca de 512 px, Apple touch opaco de 180 px, favicon SVG/PNG e ICO de 16/32/48 px, e imagen social de 1200 × 630. `pnpm build` ejecuta este generador antes de Next.js y regenera la precaché por hash después.

Las referencias activas utilizan `v=athlete-1`. El service worker resuelve los archivos precargados por pathname, también cuando la petición incluye esa versión. Cambiar el arte exige regenerar y actualizar esa versión en metadata, manifest y cabecera.

La variante maskable sitúa el icono en 384 × 384 sobre fondo grafito de 512 × 512 para mantener el símbolo en la zona segura circular. No cambiar el identificador de instalación ni las claves de preferencias al cambiar el icono.

Validación local: compilación, TypeScript y lint; tamaños, transparencia, opacidad de Apple/maskable y frames ICO; inspección visual de reducciones y recorte circular; comprobación automatizada con Chromium de la cabecera a 1280/390 px, URLs de metadata y manifest, correspondencia de los iconos servidos con los archivos locales y descarga de todos ellos sin conexión. No constituye prueba de actualización del icono en instalaciones Android/iOS existentes ni de producción.
