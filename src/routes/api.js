// API Routes
const express = require('express');
const router = express.Router();
const searchService = require('../services/searchService');
const logger = require('../utils/logger');

// Initialize with playerService (will be set by server.js)
let playerService = null;
let nodePool = null;

function setDependencies(ps, np) {
  playerService = ps;
  nodePool = np;
}

// Health check
router.get('/', (req, res) => {
  logger.info('Health check');
  res.json({ status: 'ok', message: 'Nitrozen Backend v4 🎵 (Lavalink Powered)' });
});

// Search
router.get('/search', async (req, res) => {
  const query = req.query.q;
  const limit = parseInt(req.query.limit) || 10;
  
  try {
    const results = await searchService.search(query, limit);
    res.json({ status: 'ok', results });
  } catch (err) {
    logger.error('Search endpoint error', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Player - Play
router.post('/player/play', async (req, res) => {
  const { trackId, guildId } = req.body;
  
  if (!trackId || !guildId) {
    return res.status(400).json({ status: 'error', error: 'Missing trackId or guildId' });
  }

  try {
    // Get track info from search
    const results = await searchService.search(trackId, 1);
    if (results.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Track not found' });
    }
    
    const result = await playerService.playTrack(guildId, trackId, results[0]);
    res.json(result);
  } catch (err) {
    logger.error('Play endpoint error', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Player - Pause
router.post('/player/pause', (req, res) => {
  const { guildId } = req.body;
  
  if (!guildId) {
    return res.status(400).json({ status: 'error', error: 'Missing guildId' });
  }

  try {
    const result = playerService.pause(guildId);
    res.json(result);
  } catch (err) {
    logger.error('Pause endpoint error', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Player - Resume
router.post('/player/resume', (req, res) => {
  const { guildId } = req.body;
  
  if (!guildId) {
    return res.status(400).json({ status: 'error', error: 'Missing guildId' });
  }

  try {
    const result = playerService.resume(guildId);
    res.json(result);
  } catch (err) {
    logger.error('Resume endpoint error', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Player - Seek
router.post('/player/seek', (req, res) => {
  const { guildId, position } = req.body;
  
  if (!guildId || position === undefined) {
    return res.status(400).json({ status: 'error', error: 'Missing guildId or position' });
  }

  try {
    const result = playerService.seek(guildId, position);
    res.json(result);
  } catch (err) {
    logger.error('Seek endpoint error', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Player - Stop
router.post('/player/stop', (req, res) => {
  const { guildId } = req.body;
  
  if (!guildId) {
    return res.status(400).json({ status: 'error', error: 'Missing guildId' });
  }

  try {
    const result = playerService.stop(guildId);
    res.json(result);
  } catch (err) {
    logger.error('Stop endpoint error', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Queue - Get
router.get('/queue/:guildId', (req, res) => {
  const { guildId } = req.params;
  
  try {
    const result = playerService.getQueue(guildId);
    res.json(result);
  } catch (err) {
    logger.error('Get queue endpoint error', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Queue - Add
router.post('/queue/add', async (req, res) => {
  const { guildId, trackId } = req.body;
  
  if (!guildId || !trackId) {
    return res.status(400).json({ status: 'error', error: 'Missing guildId or trackId' });
  }

  try {
    const results = await searchService.search(trackId, 1);
    if (results.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Track not found' });
    }
    
    const result = playerService.addToQueue(guildId, trackId, results[0]);
    res.json(result);
  } catch (err) {
    logger.error('Add to queue endpoint error', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Queue - Remove
router.post('/queue/remove', (req, res) => {
  const { guildId, index } = req.body;
  
  if (!guildId || index === undefined) {
    return res.status(400).json({ status: 'error', error: 'Missing guildId or index' });
  }

  try {
    const result = playerService.removeFromQueue(guildId, index);
    res.json(result);
  } catch (err) {
    logger.error('Remove from queue endpoint error', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Queue - Skip
router.post('/queue/skip', async (req, res) => {
  const { guildId } = req.body;
  
  if (!guildId) {
    return res.status(400).json({ status: 'error', error: 'Missing guildId' });
  }

  try {
    const result = await playerService.skip(guildId);
    res.json(result);
  } catch (err) {
    logger.error('Skip endpoint error', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Queue - Shuffle
router.post('/queue/shuffle', (req, res) => {
  const { guildId } = req.body;
  
  if (!guildId) {
    return res.status(400).json({ status: 'error', error: 'Missing guildId' });
  }

  try {
    const result = playerService.shuffle(guildId);
    res.json(result);
  } catch (err) {
    logger.error('Shuffle endpoint error', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Queue - Clear
router.delete('/queue/clear', (req, res) => {
  const { guildId } = req.body;
  
  if (!guildId) {
    return res.status(400).json({ status: 'error', error: 'Missing guildId' });
  }

  try {
    const result = playerService.clearQueue(guildId);
    res.json(result);
  } catch (err) {
    logger.error('Clear queue endpoint error', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Nodes - Status
router.get('/nodes/status', (req, res) => {
  try {
    const status = nodePool.getStatus();
    res.json({ status: 'ok', nodes: status });
  } catch (err) {
    logger.error('Node status endpoint error', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = { router, setDependencies };
