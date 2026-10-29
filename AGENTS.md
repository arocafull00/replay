# rePlay

rePlay no es una app solo de vóley: es una app para ver replays en cualquier deporte. En la práctica es una cámara que te enseña lo que acaba de grabar con unos segundos de retraso, para que puedas revisar tu movimiento justo después de hacerlo.

- No uses balones, redes ni nada propio de un deporte concreto como identidad de la app; el vóley es solo uno de los ejemplos.
- La marca se escribe **rePlay**.
- URL de producción: https://replayapp.vercel.app (proyecto de Vercel `replay`). `voley-delay.vercel.app` es el dominio antiguo.
- Los identificadores internos con `voley` (claves de `localStorage` como `voley-delay:delay:v1` y `voley-delay:onboarding:v1`, y la caché `voley-shell-` del service worker) vienen del nombre anterior y se mantienen a propósito: cambiarlos borraría las preferencias y el onboarding de quien ya tiene la app instalada.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
