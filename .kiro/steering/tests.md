---
inclusion: always
---

# Qué merece un test

No escribir tests por cubrir. Un test sólo vale la pena si prueba algo que
podría romperse sin que nadie se dé cuenta. Dos categorías:

1. **Lógica realmente compleja.** Cálculos con trampas, reglas con casos límite,
   parseo, agregaciones, conversiones. Lo que es difícil de verificar leyéndolo.
2. **Acoplamiento no obvio.** Cuando tocar A puede romper B y no es evidente que
   dependan el uno del otro. En ese caso **B debe tener tests** que fallen si A
   cambia de forma incompatible. Son la red que avisa de que una pieza aparentemente
   lejana se ha quedado desalineada.

## Lo que NO hay que testear

- Código obvio: getters, paso de props, un `map` sin lógica, un wrapper fino.
- Que una librería hace lo que promete.
- Casos que el sistema de tipos ya garantiza.
- Repetir en un test lo que ya comprueba el compilador o el linter.

Un test trivial es peor que ninguno: da falsa sensación de cobertura y hay que
mantenerlo.

## La prueba del algodón antes de escribir un test

Preguntarse: **¿qué cambio futuro quiero que haga fallar este test?** Si no hay
una respuesta concreta, probablemente el test no haga falta. Si la respuesta es
"que alguien toque A sin acordarse de B", ese es exactamente el test que sí hay
que escribir, y conviene que su nombre o un comentario diga qué invariante
protege y por qué A y B están ligados.

## Ejemplos de este proyecto

Casos reales que encajan en la categoría 2 (acoplamiento no obvio) y por eso
tienen o merecen tests:

- Las tres listas de niveles que hay que mantener alineadas (el `CHECK` de la
  tabla `personajes`, `NIVELES_VALIDOS` del limpiador y `NIVELES_PARTIDA` de
  `src/Ranking/niveles.ts`): tocar una sin las otras rompe en silencio.
- El emparejado jugador ↔ puntuación de `emparejarFilas()`: el bug del `.filter()`
  antes del `.map()` desplazaba los puntos al jugador equivocado y no saltaba a
  la vista.
- El parseo del Raw Data (`formatoRawData.ts`): formatos de otra versión, sistema
  de puntuación distinto, filas de alguien que no está en la mesa.
- La aritmética de experiencia/nivel y las agregaciones de estadísticas, donde
  las divisiones enteras y los casos "sin ganador" tienen trampa.
