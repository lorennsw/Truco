# Reglamento implementado

Truco Argentino tradicional con baraja española de 40 cartas (sin 8, 9 ni comodines).
Toda la lógica está en `shared/src/engine.ts` (motor), `shared/src/rules.ts` (configuración)
y `shared/src/cards.ts` (cartas). Las pruebas están en `shared/test/engine.test.ts`.

Donde hay variantes regionales o familiares, se eligió la versión más difundida en Argentina
y, cuando tiene sentido, se dejó configurable por mesa. Este documento enumera cada decisión.

## Mesa y equipos

| Modo   | Jugadores | Equipos                                      |
|--------|-----------|----------------------------------------------|
| 1 vs 1 | 2         | Asiento 0 vs asiento 1                        |
| 2 vs 2 | 4         | Asientos 0 y 2 vs 1 y 3 (compañeros enfrentados) |
| 3 vs 3 | 6         | Asientos 0, 2, 4 vs 1, 3, 5 (intercalados)    |

- Los equipos se intercalan alrededor de la mesa, así que el turno siempre alterna entre equipos.
- El orden de juego va hacia la derecha (asiento siguiente).
- El primer **mano** se sortea al empezar; después la mano rota un asiento por mano.
- Cada jugador recibe 3 cartas.

## Jerarquía de cartas (de mayor a menor)

1. Ancho de espadas · 2. Ancho de bastos · 3. 7 de espadas · 4. 7 de oros · 5. Treses ·
6. Doses · 7. Ancho de copas y de oros · 8. Doces · 9. Onces · 10. Dieces ·
11. 7 de copas y de bastos · 12. Seises · 13. Cincos · 14. Cuatros.

## Bazas y ganador de la mano

- Gana la baza la carta más alta. Si las dos cartas más altas son de **equipos distintos**, la baza es **parda**.
  Si empatan dos compañeros, la baza es de ese equipo (no es parda).
- La siguiente baza la abre quien ganó la anterior. **Después de una parda, la abre el mismo jugador que abrió la baza empardada.** *(Decisión: hay mesas que hacen abrir al mano; elegimos la regla más usada en juego por equipos online.)*
- Gana la mano quien gana dos bazas, con estas reglas de prioridad:
  - Parda en primera → define la segunda. Si también es parda → define la tercera.
  - Tres pardas → gana el equipo del **mano**.
  - Gana primera y empata segunda → gana quien ganó primera.
  - 1-1 y parda en tercera → gana quien ganó primera.

## Truco, retruco y vale cuatro

| Apuesta      | Si se quiere | Si no se quiere |
|--------------|--------------|-----------------|
| (sin cantar) | 1            | —               |
| Truco        | 2            | 1               |
| Retruco      | 3            | 2               |
| Vale cuatro  | 4            | 3               |

Estados de una apuesta: **propuesta** (`truco.pending`), **aceptada** (`truco.level`), **rechazada**
(termina la mano) y **resuelta** (al terminar la mano se cobra el nivel aceptado).

- El truco se canta **en tu turno**. Mientras hay una apuesta pendiente nadie puede jugar cartas.
- Responde cualquier jugador del equipo rival (el primero que responde decide por el equipo).
- Quien acepta queda con **el quiero**: solo ese equipo puede subir la apuesta, y solo en su turno.
- Se puede responder subiendo directamente ("¡Quiero retruco!", "¡Quiero vale cuatro!"): eso acepta la apuesta anterior y propone la siguiente.
- Con el truco aceptado ya no se puede cantar envido.

## Envido

- Se canta solo en la **primera baza**, por un jugador en su turno antes de jugar su carta.
- **"El envido está primero"**: frente a un *truco* (no a un retruco) todavía sin contestar, el equipo que debe responder puede cantar envido. Se resuelve el envido y luego se responde el truco, que sigue pendiente.
- Cantos y combinaciones legales:
  - Primer canto: Envido, Real envido o Falta envido.
  - Después de Envido: Envido (si la mesa lo permite), Real envido o Falta envido.
  - Después de Envido Envido: Real envido o Falta envido.
  - Después de Real envido: solo Falta envido. Falta envido cierra la secuencia.
- Valores: Envido = 2, Real envido = 3. Si se **quiere**, se suman todos los cantos (p. ej. Envido + Envido + Real = 7). Si se **quiere la falta**, vale la falta (reemplaza a lo acumulado).
- Si **no se quiere**, quien hizo el último canto cobra lo acumulado antes de ese canto; si fue el primer canto, 1 punto. Ejemplos: Envido no querido = 1; Envido + Real no querido = 2; Envido + Real + Falta no querido = 5.
- **Cálculo del tanto**: dos cartas del mismo palo = 20 + la suma de sus valores (las figuras 10, 11 y 12 valen 0). Con tres del mismo palo, se toman las dos mejores. Sin palo repetido, vale la carta más alta (figuras = 0).
- **Resolución**: gana el mejor tanto de cada equipo. **Empate: gana el que es mano o el más cercano a la mano** en el orden de juego.
- El sistema calcula y muestra los tantos automáticamente (no hay "son buenas" manual).

### Falta envido (configurable: `faltaEnvido`)

- `buenasMalas` *(por defecto)*: si quien va ganando el partido está **en malas** (menos de la mitad del objetivo), la falta **gana el partido**; si está en buenas, vale **lo que le falta al que va ganando** para llegar al objetivo. En partidas a 15 no hay malas y buenas: vale lo que le falta al líder.
- `faltaLider`: siempre vale lo que le falta al que va ganando.
- `partidoCompleto`: quien gana la falta gana el partido.

## Flor (configurable: `flor`, `contraflor`)

- Hay flor con tres cartas del mismo palo. Tanto de flor = 20 + la suma de las tres (figuras = 0).
- Se canta en la primera baza antes de jugar tu carta: en tu turno, como respuesta a un envido o como respuesta a un truco. **La flor anula el envido** de esa mano.
- Si **nadie del equipo rival tiene flor**: el equipo cobra **3 puntos por cada flor** que tengan sus jugadores (se resuelve en el acto).
- Si el rival tiene flor, debe responder:
  - **Con flor me achico**: el equipo que cantó flor cobra **4 puntos**.
  - **Contraflor**: querida = **6 puntos** al de mejor flor; no querida = **4** para quien la cantó. Se puede subir a contraflor al resto.
  - **Contraflor al resto**: querida = la falta (igual que la falta envido) para el de mejor flor; no querida = 4 para quien la cantó (6 si venía de una contraflor).
- Empate de flor: gana el mano o el más cercano a la mano.
- La flor no es obligatoria: si el jugador juega su primera carta sin cantarla, la pierde.
- Prioridad de respuestas: flor > envido > truco.

## Irse al mazo

- Se puede en tu turno o al responder un truco. El equipo abandona la mano y el rival cobra los puntos del truco **aceptado** (1 si no hubo truco).
- `mazoPenaltyFirstRound` *(por defecto activado)*: si alguien se va al mazo en primera sin que se haya cantado envido ni flor, el rival suma 1 punto extra (el envido "no cantado").

## Partido

- Objetivo: 15, 24 o 30 puntos (`targetScore`). Para 24 y 30 se muestran malas y buenas.
- Los puntos se suman en el momento en que se ganan (envido y flor durante la mano), así que un envido puede terminar el partido antes de jugar las cartas.

## Tiempo por jugada (`turnTimeSec`)

0 (libre), 30, 45, 60 o 90 segundos. Al vencer, el servidor juega por el jugador con la lógica del bot.
Un jugador desconectado es reemplazado por la lógica del bot después de 20 segundos mientras dure la desconexión; al volver recupera el control.

## Variantes no implementadas

- **Pica-pica** del 3 vs 3 (manos individuales en cierto tramo del puntaje).
- Cantos "son buenas" y "tengo X" manuales: el tanto se calcula y se revela automáticamente.
- Señas entre compañeros (se puede usar el chat).
