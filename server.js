// ═══════════════════════════════════════════════════════════════
//  NITROZEN BACKEND v4  —  Lavalink Powered Music Streaming
//  Dual node support with automatic failover
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const { Shoukaku } = require('shoukaku');
const { LAVALINK_NODES } = require('./config/lavalink');
const { PORT, PUBLIC_URL, NODE_HEALTH_CHECK_INTERVAL, POSITION_UPDATE_INTERVAL } = require('./config/constants');
const logger = require('./utils/logger');
const LavalinkNodePool = require('./services/nodePool');
const PlayerService = require('./services/playerService');
const { router: apiRouter, setDependencies: setApiDependencies } = require('./routes/api');
const { createWebSocketServer, setDependencies: setWsDependencies } = require('./routes/websocket');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// Initialize services
const nodePool = new LavalinkNodePool();
const playerService = new PlayerService(nodePool);

// Set dependencies
setApiDependencies(playerService, nodePool);
setWsDependencies(playerService, nodePool);

// API Routes
app.use('/api/v1', apiRouter);

// ═══════════════════════════════════════════════════════════════
//  Initialize Shoukaku (Lavalink Client)
// ═══════════════════════════════════════════════════════════════

const shoukakuOptions = {
  moveOnDisconnect: true,
  resumable: true,
  resumableTimeout: 30,
  reconnectTries: 5,
  restTimeout: 10000
};

const nodes = LAVALINK_NODES.map(node => ({
  name: node.name,
  url: `${node.secure ? 'wss' : 'ws'}://${node.host}:${node.port}`,
  auth: node.password,
  resume: true,
  resumeKey: `nitrozen-${node.name}`,
  resumeTimeout: 60
}));

const shoukaku = new Shoukaku(shoukakuOptions, nodes);

// Shoukaku event handlers
shoukaku.on('ready', (name) => {
  logger.success(`Lavalink node ${name} is ready`);
  nodePool.markNodeConnected(name);
});

shoukaku.on('error', (name, error) => {
  logger.error(`Lavalink node ${name} error`, error);
  nodePool.markNodeFailure(name, error.message);
});

shoukaku.on('disconnect', (name, players) => {
  logger.warn(`Lavalink node ${name} disconnected`);
  nodePool.markNodeFailure(name, 'DISCONNECTED');
  
  // Attempt to reconnect players to other nodes
  players.forEach(player => {
    const guildId = player.guildId;
    logger.player(`Attempting to reconnect guild ${guildId}`);
    // Reconnection logic would go here
  });
});

shoukaku.on('debug', (name, info) => {
  logger.node(name, 'Debug', info);
});

// ═══════════════════════════════════════════════════════════════
//  Start Server
// ═══════════════════════════════════════════════════════════════

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.success('═══════════════════════════════════════════════════');
  logger.success('  Nitrozen Mobile API v4');
  logger.success('  Lavalink Powered Music Streaming');
  logger.success('  Server Online');
  logger.success(`  Public URL: ${PUBLIC_URL}`);
  logger.success(`  Port: ${PORT}`);
  logger.success('  ─────────────────────────────────────────────────');
  logger.success('  Lavalink Nodes:');
  LAVALINK_NODES.forEach(node => {
    logger.success(`    ${node.name}: ${node.host}:${node.port}`);
  });
  logger.success('  ─────────────────────────────────────────────────');
  logger.success('  API Endpoints:');
  logger.success('       GET  /api/v1/              -> Health check');
  logger.success('       GET  /api/v1/search?q=     -> Search YouTube');
  logger.success('       POST /api/v1/player/play   -> Play track');
  logger.success('       POST /api/v1/player/pause  -> Pause playback');
  logger.success('       POST /api/v1/player/resume -> Resume playback');
  logger.success('       POST /api/v1/player/seek   -> Seek position');
  logger.success('       POST /api/v1/player/stop   -> Stop playback');
  logger.success('       GET  /api/v1/queue/:id      -> Get queue');
  logger.success('       POST /api/v1/queue/add     -> Add to queue');
  logger.success('       POST /api/v1/queue/remove  -> Remove from queue');
  logger.success('       POST /api/v1/queue/skip    -> Skip track');
  logger.success('       POST /api/v1/queue/shuffle -> Shuffle queue');
  logger.success('       DEL  /api/v1/queue/clear   -> Clear queue');
  logger.success('       GET  /api/v1/nodes/status  -> Node status');
  logger.success('  ─────────────────────────────────────────────────');
  logger.success('  WebSocket:');
  logger.success('       WS   /ws?guildId=          -> Real-time events');
  logger.success('═══════════════════════════════════════════════════');
  logger.info('Ready! Waiting for requests...\n');
});

// Create WebSocket server
createWebSocketServer(server);

// ═══════════════════════════════════════════════════════════════
//  Health Check & Maintenance Intervals
// ═══════════════════════════════════════════════════════════════

// Node health check interval
setInterval(async () => {
  await nodePool.reconnectNodes(shoukaku);
}, NODE_HEALTH_CHECK_INTERVAL);

// Position update interval (simulate for now)
setInterval(() => {
  const sessions = playerService.getAllSessions();
  sessions.forEach(session => {
    if (session.isPlaying && !session.isPaused) {
      session.position += POSITION_UPDATE_INTERVAL;
      
      // Broadcast position update
      const { broadcastToGuild } = require('./routes/websocket');
      broadcastToGuild(session.guildId, {
        type: 'POSITION_UPDATE',
        guildId: session.guildId,
        position: session.position,
        duration: session.currentTrack?.durationSeconds * 1000 || 0
      });
    }
  });
}, POSITION_UPDATE_INTERVAL);

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  
  // Disconnect Shoukaku
  shoukaku.destroy();
  
  // Close server
  server.close(() => {
    logger.success('Server closed');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown');
    process.exit(1);
  }, 10000);
});

module.exports = { app, shoukaku, nodePool, playerService };
