# rePlay

rePlay no es una app solo de vóley: es una app para ver replays en cualquier deporte. En la práctica es una cámara que te enseña lo que acaba de grabar con unos segundos de retraso, para que puedas revisar tu movimiento justo después de hacerlo.

- No uses balones, redes ni nada propio de un deporte concreto como identidad de la app; el vóley es solo uno de los ejemplos.
- La marca se escribe **rePlay**.
- URL de producción: https://replayapp.vercel.app (proyecto de Vercel `replay`). `voley-delay.vercel.app` es el dominio antiguo.
- Los identificadores internos con `voley` (claves de `localStorage` como `voley-delay:delay:v1` y `voley-delay:onboarding:v1`, y la caché `voley-shell-` del service worker) vienen del nombre anterior y se mantienen a propósito: cambiarlos borraría las preferencias y el onboarding de quien ya tiene la app instalada.
