// Application Constants
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

// WebSocket Settings
const WS_HEARTBEAT_INTERVAL = 30000; // 30 seconds
const WS_RECONNECT_DELAY = 5000; // 5 seconds

// Player Settings
const POSITION_UPDATE_INTERVAL = 5000; // 5 seconds
const MAX_QUEUE_SIZE = 100;
const AUTO_PLAY_ON_END = true;

// Node Health Check
const NODE_HEALTH_CHECK_INTERVAL = 60000; // 1 minute
const MAX_NODE_FAILURES = 3;
const NODE_RECONNECT_DELAY = 30000; // 30 seconds

module.exports = {
  PORT,
  PUBLIC_URL,
  WS_HEARTBEAT_INTERVAL,
  WS_RECONNECT_DELAY,
  POSITION_UPDATE_INTERVAL,
  MAX_QUEUE_SIZE,
  AUTO_PLAY_ON_END,
  NODE_HEALTH_CHECK_INTERVAL,
  MAX_NODE_FAILURES,
  NODE_RECONNECT_DELAY
};
