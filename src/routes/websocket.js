// WebSocket Handler
const WebSocket = require('ws');
const logger = require('../utils/logger');
const { WS_HEARTBEAT_INTERVAL } = require('../config/constants');

let playerService = null;
let nodePool = null;
let wss = null;

function setDependencies(ps, np) {
  playerService = ps;
  nodePool = np;
}

function createWebSocketServer(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });
  
  logger.info('WebSocket server initialized');

  wss.on('connection', (ws, req) => {
    const guildId = new URLSearchParams(req.url.split('?')[1]).get('guildId');
    
    if (!guildId) {
      ws.close(1008, 'Missing guildId');
      return;
    }

    logger.info(`WebSocket connected for guild ${guildId}`);
    
    // Store guildId in ws
    ws.guildId = guildId;
    ws.isAlive = true;

    // Send connection success
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      guildId,
      timestamp: Date.now()
    }));

    // Handle messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        handleWebSocketMessage(ws, data);
      } catch (err) {
        logger.error('WebSocket message error', err);
      }
    });

    // Handle close
    ws.on('close', () => {
      logger.info(`WebSocket disconnected for guild ${guildId}`);
      ws.isAlive = false;
    });

    // Handle error
    ws.on('error', (err) => {
      logger.error(`WebSocket error for guild ${guildId}`, err);
    });

    // Handle ping/pong
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  });

  // Heartbeat interval
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      
      ws.isAlive = false;
      ws.ping();
    });
  }, WS_HEARTBEAT_INTERVAL);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}

function handleWebSocketMessage(ws, data) {
  const { type, guildId } = data;
  
  logger.info(`WebSocket command: ${type} for guild ${guildId}`);

  switch (type) {
    case 'PLAY':
      handlePlay(ws, data);
      break;
    case 'PAUSE':
      handlePause(ws, data);
      break;
    case 'RESUME':
      handleResume(ws, data);
      break;
    case 'SEEK':
      handleSeek(ws, data);
      break;
    case 'STOP':
      handleStop(ws, data);
      break;
    case 'SKIP':
      handleSkip(ws, data);
      break;
    case 'ADD_TO_QUEUE':
      handleAddToQueue(ws, data);
      break;
    case 'REMOVE_FROM_QUEUE':
      handleRemoveFromQueue(ws, data);
      break;
    case 'SHUFFLE':
      handleShuffle(ws, data);
      break;
    case 'CLEAR_QUEUE':
      handleClearQueue(ws, data);
      break;
    default:
      ws.send(JSON.stringify({
        type: 'ERROR',
        guildId,
        error: 'UNKNOWN_COMMAND',
        message: `Unknown command: ${type}`
      }));
  }
}

async function handlePlay(ws, data) {
  try {
    const { trackId, guildId } = data;
    const searchService = require('../services/searchService');
    const results = await searchService.search(trackId, 1);
    
    if (results.length === 0) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        guildId,
        error: 'TRACK_NOT_FOUND',
        message: 'Track not found'
      }));
      return;
    }
    
    const result = await playerService.playTrack(guildId, trackId, results[0]);
    
    ws.send(JSON.stringify({
      type: 'TRACK_START',
      guildId,
      track: result.track,
      position: result.position,
      node: result.node
    }));
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      guildId: data.guildId,
      error: 'PLAY_FAILED',
      message: err.message
    }));
  }
}

function handlePause(ws, data) {
  try {
    const result = playerService.pause(data.guildId);
    ws.send(JSON.stringify({
      type: 'PAUSED',
      guildId: data.guildId,
      ...result
    }));
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      guildId: data.guildId,
      error: 'PAUSE_FAILED',
      message: err.message
    }));
  }
}

function handleResume(ws, data) {
  try {
    const result = playerService.resume(data.guildId);
    ws.send(JSON.stringify({
      type: 'RESUMED',
      guildId: data.guildId,
      ...result
    }));
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      guildId: data.guildId,
      error: 'RESUME_FAILED',
      message: err.message
    }));
  }
}

function handleSeek(ws, data) {
  try {
    const result = playerService.seek(data.guildId, data.position);
    ws.send(JSON.stringify({
      type: 'SEEKED',
      guildId: data.guildId,
      ...result
    }));
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      guildId: data.guildId,
      error: 'SEEK_FAILED',
      message: err.message
    }));
  }
}

function handleStop(ws, data) {
  try {
    const result = playerService.stop(data.guildId);
    ws.send(JSON.stringify({
      type: 'STOPPED',
      guildId: data.guildId,
      ...result
    }));
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      guildId: data.guildId,
      error: 'STOP_FAILED',
      message: err.message
    }));
  }
}

async function handleSkip(ws, data) {
  try {
    const result = await playerService.skip(data.guildId);
    ws.send(JSON.stringify({
      type: 'SKIPPED',
      guildId: data.guildId,
      ...result
    }));
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      guildId: data.guildId,
      error: 'SKIP_FAILED',
      message: err.message
    }));
  }
}

async function handleAddToQueue(ws, data) {
  try {
    const { trackId, guildId } = data;
    const searchService = require('../services/searchService');
    const results = await searchService.search(trackId, 1);
    
    if (results.length === 0) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        guildId,
        error: 'TRACK_NOT_FOUND',
        message: 'Track not found'
      }));
      return;
    }
    
    const result = playerService.addToQueue(guildId, trackId, results[0]);
    ws.send(JSON.stringify({
      type: 'ADDED_TO_QUEUE',
      guildId,
      ...result
    }));
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      guildId: data.guildId,
      error: 'ADD_FAILED',
      message: err.message
    }));
  }
}

function handleRemoveFromQueue(ws, data) {
  try {
    const result = playerService.removeFromQueue(data.guildId, data.index);
    ws.send(JSON.stringify({
      type: 'REMOVED_FROM_QUEUE',
      guildId: data.guildId,
      ...result
    }));
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      guildId: data.guildId,
      error: 'REMOVE_FAILED',
      message: err.message
    }));
  }
}

function handleShuffle(ws, data) {
  try {
    const result = playerService.shuffle(data.guildId);
    ws.send(JSON.stringify({
      type: 'SHUFFLED',
      guildId: data.guildId,
      ...result
    }));
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      guildId: data.guildId,
      error: 'SHUFFLE_FAILED',
      message: err.message
    }));
  }
}

function handleClearQueue(ws, data) {
  try {
    const result = playerService.clearQueue(data.guildId);
    ws.send(JSON.stringify({
      type: 'QUEUE_CLEARED',
      guildId: data.guildId,
      ...result
    }));
  } catch (err) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      guildId: data.guildId,
      error: 'CLEAR_FAILED',
      message: err.message
    }));
  }
}

// Broadcast to all clients for a guild
function broadcastToGuild(guildId, message) {
  if (!wss) return;
  
  wss.clients.forEach((client) => {
    if (client.guildId === guildId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

module.exports = { createWebSocketServer, setDependencies, broadcastToGuild };
