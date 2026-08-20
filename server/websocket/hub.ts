import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { db } from '../db/store.js';

interface ClientConnection {
  ws: WebSocket;
  userId?: number;
  userRole?: string;
  threshold: number;
  subscriptions: Set<string>;
  filters: Record<string, any>;
  isAlive: boolean;
}

export class WebSocketHub {
  private wss: WebSocketServer;
  private clients: Set<ClientConnection> = new Set();
  private tickInterval: NodeJS.Timeout | null = null;
  private healthInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupWss();
    this.startSimulationLoops();
  }

  private setupWss() {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const client: ClientConnection = {
        ws,
        threshold: 7,
        subscriptions: new Set(['kpi', 'feed', 'health']),
        filters: {},
        isAlive: true,
      };

      this.clients.add(client);

      ws.on('pong', () => {
        client.isAlive = true;
      });

      ws.on('message', (data: string) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.type === 'subscribe') {
            if (Array.isArray(msg.channels)) {
              client.subscriptions = new Set(msg.channels);
            }
            if (msg.filters) {
              client.filters = msg.filters;
            }
            if (msg.threshold !== undefined) {
              client.threshold = Number(msg.threshold);
            }
            if (msg.userId !== undefined) {
              client.userId = Number(msg.userId);
            }
            if (msg.userRole !== undefined) {
              client.userRole = String(msg.userRole);
            }
          } else if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          }
        } catch (err) {
          // ignore malformed message
        }
      });

      ws.on('close', () => {
        this.clients.delete(client);
      });

      ws.on('error', () => {
        this.clients.delete(client);
      });

      // Send initial welcome & connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString(),
        message: 'WebSocket соединение установлено с дашбордом',
      }));
    });
  }

  private startSimulationLoops() {
    // 1. KPI and Live Feed ticks (every 1.5s)
    this.tickInterval = setInterval(() => {
      if (this.clients.size === 0) return;

      const { newFact, kpiTick, chartPoint } = db.generateLiveTick();

      for (const client of this.clients) {
        if (client.ws.readyState !== WebSocket.OPEN) continue;

        // Check client isolation
        const isClientOwner = !client.userId || client.userRole === 'admin' || client.userRole === 'manager' || (newFact && newFact.owner_user_id === client.userId);

        // Feed item broadcast
        if (client.subscriptions.has('feed') && newFact && isClientOwner) {
          if (newFact.score >= client.threshold) {
            client.ws.send(JSON.stringify({
              type: 'feed_item',
              data: newFact,
              timestamp: new Date().toISOString(),
            }));
          }
        }

        // KPI tick broadcast
        if (client.subscriptions.has('kpi')) {
          client.ws.send(JSON.stringify({
            type: 'kpi_tick',
            data: kpiTick,
            timestamp: new Date().toISOString(),
          }));
        }

        // Minute chart point broadcast
        if (client.subscriptions.has('chart') && chartPoint) {
          client.ws.send(JSON.stringify({
            type: 'chart_point',
            data: chartPoint,
            timestamp: new Date().toISOString(),
          }));
        }
      }
    }, 1500);

    // 2. Health & Host Metrics broadcast (every 5s)
    this.healthInterval = setInterval(() => {
      if (this.clients.size === 0) return;

      const host = db.generateLiveHostMetrics();
      const services = Array.from(db.serviceHealth.values());

      for (const client of this.clients) {
        if (client.ws.readyState !== WebSocket.OPEN) continue;
        if (client.subscriptions.has('health')) {
          client.ws.send(JSON.stringify({
            type: 'health',
            data: { host, services },
            timestamp: new Date().toISOString(),
          }));
        }
      }
    }, 5000);

    // 3. Heartbeat (every 30s)
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(client);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }, 30000);
  }

  public cleanup() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.healthInterval) clearInterval(this.healthInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }
}
