import { createTrucoServer } from './app';

const PORT = Number(process.env.PORT ?? 3001);
const { httpServer, clientDist } = createTrucoServer();

httpServer.listen(PORT, () => {
  console.log(`Servidor de Truco escuchando en http://localhost:${PORT}${clientDist ? ' (sirviendo el cliente)' : ''}`);
});
