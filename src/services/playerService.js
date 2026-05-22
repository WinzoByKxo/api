// Player Service - Manages player sessions and queue
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { MAX_QUEUE_SIZE, AUTO_PLAY_ON_END } = require('../config/constants');

class PlayerService {
  constructor(nodePool) {
    this.nodePool = nodePool;
    this.sessions = new Map(); // guildId -> session data
  }

  // Create or get session
  getSession(guildId) {
    if (!this.sessions.has(guildId)) {
      this.sessions.set(guildId, {
        guildId,
        currentNode: null,
        player: null,
        queue: [],
        currentTrack: null,
        position: 0,
        isPlaying: false,
        isPaused: false,
        volume: 100,
        createdAt: Date.now()
      });
    }
    return this.sessions.get(guildId);
  }

  // Play track
  async playTrack(guildId, trackId, trackInfo) {
    logger.player(`Play request for guild ${guildId}, track ${trackId}`);
    
    const session = this.getSession(guildId);
    const node = this.nodePool.getBestNode();
    
    if (!node) {
      throw new Error('No available Lavalink nodes');
    }

    try {
      // If player exists, stop it
      if (session.player) {
        session.player.stopTrack();
      }

      // Update session
      session.currentNode = node.name;
      session.currentTrack = { ...trackInfo, id: trackId };
      session.position = 0;
      session.isPlaying = true;
      session.isPaused = false;

      this.nodePool.incrementPlayers(node.name);
      
      logger.success(`Track queued on node ${node.name}`);
      return {
        status: 'ok',
        track: session.currentTrack,
        node: node.name,
        position: 0
      };
    } catch (err) {
      logger.error('Play track failed', err);
      this.nodePool.markNodeFailure(node.name, err.message);
      throw err;
    }
  }

  // Pause playback
  pause(guildId) {
    const session = this.getSession(guildId);
    
    if (!session.player || !session.isPlaying) {
      throw new Error('Nothing is playing');
    }

    session.isPaused = true;
    session.isPlaying = false;
    
    logger.player(`Paused playback for guild ${guildId}`);
    return { status: 'ok', isPaused: true };
  }

  // Resume playback
  resume(guildId) {
    const session = this.getSession(guildId);
    
    if (!session.player || !session.currentTrack) {
      throw new Error('Nothing to resume');
    }

    session.isPaused = false;
    session.isPlaying = true;
    
    logger.player(`Resumed playback for guild ${guildId}`);
    return { status: 'ok', isPlaying: true };
  }

  // Seek to position
  seek(guildId, position) {
    const session = this.getSession(guildId);
    
    if (!session.player || !session.currentTrack) {
      throw new Error('Nothing is playing');
    }

    session.position = position;
    
    logger.player(`Seeked to ${position}ms for guild ${guildId}`);
    return { status: 'ok', position };
  }

  // Stop playback
  stop(guildId) {
    const session = this.getSession(guildId);
    
    if (session.currentNode) {
      this.nodePool.decrementPlayers(session.currentNode);
    }

    session.player = null;
    session.currentTrack = null;
    session.position = 0;
    session.isPlaying = false;
    session.isPaused = false;
    
    logger.player(`Stopped playback for guild ${guildId}`);
    return { status: 'ok' };
  }

  // Add track to queue
  addToQueue(guildId, trackId, trackInfo) {
    const session = this.getSession(guildId);
    
    if (session.queue.length >= MAX_QUEUE_SIZE) {
      throw new Error('Queue is full');
    }

    session.queue.push({ ...trackInfo, id: trackId });
    
    logger.player(`Added track to queue for guild ${guildId} (queue size: ${session.queue.length})`);
    return { status: 'ok', queueSize: session.queue.length };
  }

  // Remove track from queue
  removeFromQueue(guildId, index) {
    const session = this.getSession(guildId);
    
    if (index < 0 || index >= session.queue.length) {
      throw new Error('Invalid queue index');
    }

    const removed = session.queue.splice(index, 1)[0];
    
    logger.player(`Removed track from queue for guild ${guildId}`);
    return { status: 'ok', removed };
  }

  // Get queue
  getQueue(guildId) {
    const session = this.getSession(guildId);
    
    return {
      status: 'ok',
      current: session.currentTrack,
      queue: session.queue,
      position: session.position,
      isPlaying: session.isPlaying,
      isPaused: session.isPaused
    };
  }

  // Skip to next track
  async skip(guildId) {
    const session = this.getSession(guildId);
    
    if (session.queue.length === 0) {
      // Stop if no more tracks
      return this.stop(guildId);
    }

    // Get next track
    const nextTrack = session.queue.shift();
    
    // Play next track
    return this.playTrack(guildId, nextTrack.id, nextTrack);
  }

  // Shuffle queue
  shuffle(guildId) {
    const session = this.getSession(guildId);
    
    // Fisher-Yates shuffle
    for (let i = session.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [session.queue[i], session.queue[j]] = [session.queue[j], session.queue[i]];
    }
    
    logger.player(`Shuffled queue for guild ${guildId}`);
    return { status: 'ok' };
  }

  // Clear queue
  clearQueue(guildId) {
    const session = this.getSession(guildId);
    session.queue = [];
    
    logger.player(`Cleared queue for guild ${guildId}`);
    return { status: 'ok' };
  }

  // Update position (called by interval)
  updatePosition(guildId, position) {
    const session = this.getSession(guildId);
    session.position = position;
  }

  // Handle track end
  async handleTrackEnd(guildId, reason) {
    logger.player(`Track ended for guild ${guildId}, reason: ${reason}`);
    
    if (AUTO_PLAY_ON_END && reason === 'FINISHED') {
      return this.skip(guildId);
    }
    
    return this.stop(guildId);
  }

  // Delete session
  deleteSession(guildId) {
    const session = this.sessions.get(guildId);
    if (session && session.currentNode) {
      this.nodePool.decrementPlayers(session.currentNode);
    }
    this.sessions.delete(guildId);
    logger.player(`Deleted session for guild ${guildId}`);
  }

  // Get all sessions
  getAllSessions() {
    return Array.from(this.sessions.values());
  }
}

module.exports = PlayerService;
