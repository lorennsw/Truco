# Truco Argentino online

Juego web multijugador en tiempo real de Truco Argentino: **1 vs 1, 2 vs 2 y 3 vs 3**, mesas
privadas con código o enlace, mesas públicas, bots para completar lugares, reconexión automática,
chat y reglamento configurable por mesa.

## Inicio rápido

```bash
npm install
npm run dev        # servidor en :3001 y cliente en http://localhost:5173
```

Abrí `http://localhost:5173` en dos ventanas (o una normal y una de incógnito) para jugar contra vos mismo,
o creá una mesa y completala con bots.

```bash
npm test           # pruebas del motor de reglas y del multijugador
npm run typecheck  # chequeo de tipos de los tres paquetes
npm run build      # compila cliente (client/dist) y servidor (server/dist)
npm start          # servidor de producción: sirve también el cliente en :3001
```

## Arquitectura

```
shared/   Motor del juego y contrato de mensajes (TypeScript puro, sin dependencias)
  src/cards.ts      Baraja, jerarquía, cálculo de envido y flor
  src/rules.ts      Configuración de reglas por mesa (validación + descripción legible)
  src/engine.ts     Máquina de estados: acciones legales, aplicar acción, vista por jugador
  src/bot.ts        Jugador automático (bots, desconectados y tiempo vencido)
  src/protocol.ts   Tipos de los eventos Socket.IO cliente ↔ servidor
  test/             Pruebas del reglamento (vitest)
server/   Node.js + Express + Socket.IO
  src/rooms.ts      Salas, asientos, equipos, sesiones, temporizadores, bots, chat
  src/app.ts        Servidor HTTP/WebSocket; sirve el cliente compilado si existe
  test/             Pruebas de punta a punta con clientes Socket.IO reales
client/   React + TypeScript + Vite + Tailwind CSS
  src/store.ts      Conexión, sesión persistente y estado global
  src/components/   Inicio, sala de espera, mesa de juego, cartas SVG, puntaje con fósforos, chat
docs/REGLAS.md      Reglamento implementado y decisiones sobre variantes
```

**El servidor es la única autoridad.** Cada acción del cliente (`game:action`) se valida con
`legalActions` y se aplica con `applyAction` sobre el estado del servidor. Cada jugador recibe una
vista filtrada (`getPlayerView`): nunca llegan al navegador las cartas de los demás. El motor es
puro y determinista, así que se prueba sin red y lo comparten cliente y servidor.

### Multijugador

- **Crear mesa** privada o pública, elegir modo y reglamento. **Unirse** por código, por enlace
  (`/?sala=CODIGO`) o con **partida rápida** (primera mesa pública con lugar).
- **Lista de partidas públicas** en vivo, con modo, reglamento y lugares ocupados.
- **Asientos y equipos**: cada jugador elige su lugar (los equipos se intercalan y los compañeros
  quedan enfrentados), el anfitrión puede **sortear equipos**, agregar/quitar **bots** y editar el reglamento.
- **Reconexión**: la sesión se guarda en el navegador (id + token). Si se corta la conexión o se
  recarga la página, el jugador vuelve a su lugar con sus cartas. Mientras está desconectado, el bot
  juega por él después de 20 s.
- **Abandono**: si alguien sale durante la partida, un bot ocupa su lugar; un espectador puede
  tomar el lugar de un bot.
- **Tiempo por jugada** configurable; al vencer, el servidor juega automáticamente.
- **Chat** de mesa con mensajes rápidos, e **historial de jugadas**.
- **Chat privado de equipo** (pestaña EQUIPO, solo en 2 vs 2 y 3 vs 3). La privacidad la garantiza el
  servidor: el evento `teamChat:send` solo trae el texto; el servidor identifica al jugador por su sesión,
  verifica que esté sentado en una partida en curso, obtiene su equipo del asiento real (pares contra
  impares), valida el texto (vacío, máximo 300 caracteres) y aplica un límite de 5 mensajes cada 5 s.
  El mensaje se guarda en el historial de ese equipo para esa partida (`gameId` nuevo en cada partida,
  máximo 100 mensajes) y se envía solo a los integrantes de ese equipo. Cada jugador recibe en
  `room:state` únicamente el historial de su equipo; rivales, espectadores y otras partidas nunca lo
  reciben. Un `clientId` por mensaje evita duplicados en reintentos. Pruebas: `server/test/teamchat.test.ts`.
- **Sonido ambiente** en la mesa, bajito y con botón para silenciarlo (se recuerda la preferencia).
- Al terminar, el anfitrión vuelve a la sala para la revancha.

### Por qué no hay base de datos (todavía)

Las partidas de truco son efímeras: el estado vive en memoria del servidor, que es lo más simple y
rápido para tiempo real. La identidad es anónima (nombre + token en el navegador), así que no hace
falta registrarse para jugar. Si más adelante se quieren cuentas, ranking o historial, el lugar natural
es **Supabase** (Auth + Postgres): guardar el resultado en `RoomManager.update` cuando la partida pasa a
`finished` y asociar `playerId` con el usuario de Supabase.

## Despliegue

El estado está en memoria, por lo que el servidor debe correr como **una sola instancia**
(para escalar horizontalmente habría que agregar el adaptador de Redis de Socket.IO y sesiones fijas).

### Opción A: un solo servicio (recomendada)

El servidor sirve el cliente compilado y el WebSocket en el mismo origen.

- **Render**: el repo incluye `render.yaml` (build `npm ci && npm run build`, start `npm start`, health `/health`).
- **Railway / Fly.io / cualquier host con Docker**: usar el `Dockerfile` incluido.
- **Cualquier VPS**: `npm ci && npm run build && PORT=80 npm start`.

### Opción B: cliente y servidor separados

1. Servidor (Render, Railway, Fly.io…): `npm run build -w server && npm start`. Variable
   `CLIENT_ORIGIN=https://tu-cliente.vercel.app` para restringir CORS.
2. Cliente (Vercel, Netlify, Cloudflare Pages): directorio `client`, build `npm run build`,
   salida `dist`, variable `VITE_SERVER_URL=https://tu-servidor.onrender.com`. El enlace de
   invitación usa query string (`?sala=`), así que no hacen falta reglas de reescritura.

## Reglamento

Resumen de lo configurable por mesa (ver detalle y decisiones en [docs/REGLAS.md](docs/REGLAS.md)):

- Partida a 15, 24 o 30 puntos.
- Flor activada o no; contraflor y contraflor al resto activadas o no.
- Envido envido permitido o no.
- Falta envido: tradicional (malas/buenas), lo que le falta al líder, o partido completo.
- Punto extra por irse al mazo en primera sin envido.
- Tiempo por jugada.

Los jugadores ven el reglamento activo en la sala de espera y durante la partida (botón **Reglas**).
