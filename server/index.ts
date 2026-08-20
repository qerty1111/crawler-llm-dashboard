import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { analyticsRouter } from './routes/analytics.js';
import { linksRouter } from './routes/links.js';
import { projectsRouter } from './routes/projects.js';
import { queriesRouter } from './routes/queries.js';
import { settingsRouter } from './routes/settings.js';
import { promptRouter } from './routes/prompt.js';
import { systemRouter } from './routes/system.js';
import { adminRouter } from './routes/admin.js';
import { exportRouter } from './routes/export.js';
import { WebSocketHub } from './websocket/hub.js';

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 3001;

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${req.method}] ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api', analyticsRouter);
app.use('/api/links', linksRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/queries', queriesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/prompt', promptRouter);
app.use('/api/system', systemRouter);
app.use('/api', adminRouter); // /api/users, /api/audit
app.use('/api/export', exportRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timezone: 'Europe/Kyiv', timestamp: new Date().toISOString() });
});

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');

// Serve static frontend in production / standalone
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Initialize WebSocket Hub
const wsHub = new WebSocketHub(server);

// Start HTTP Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Crawler & LLM Dashboard Backend listening on port ${PORT}`);
  console.log(`📡 WebSocket Hub available at ws://localhost:${PORT}/ws`);
  console.log(`🌍 Timezone: Europe/Kyiv | Status: Ready`);
  console.log(`=======================================================`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  wsHub.cleanup();
  server.close(() => process.exit(0));
});
