import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env['CLIENT_URL'] ?? 'http://localhost:5173' },
});

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

io.on('connection', (socket) => {
  console.log(`socket connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`socket disconnected: ${socket.id}`);
  });
});

const PORT = Number(process.env['PORT'] ?? 4000);
httpServer.listen(PORT, () => {
  console.log(`server listening on port ${PORT}`);
});
