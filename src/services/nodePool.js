// Lavalink Node Pool Manager with Failover
const { LAVALINK_NODES } = require('../config/lavalink');
const { MAX_NODE_FAILURES, NODE_RECONNECT_DELAY } = require('../config/constants');
const logger = require('../utils/logger');

class LavalinkNodePool {
  constructor() {
    this.nodes = LAVALINK_NODES.map(node => ({
      ...node,
      connected: false,
      activePlayers: 0,
      failures: 0,
      lastFailure: null,
      shoukakuNode: null
    }));
    this.currentNodeIndex = 0;
  }

  // Get best available node (load-balanced)
  getBestNode() {
    const availableNodes = this.nodes.filter(n => 
      n.connected && n.failures < MAX_NODE_FAILURES
    );
    
    if (availableNodes.length === 0) {
      logger.error('No available nodes');
      return null;
    }
    
    // Sort by active players (load balancing)
    const bestNode = availableNodes.sort((a, b) => a.activePlayers - b.activePlayers)[0];
    logger.node(bestNode.name, `Selected as best node (active players: ${bestNode.activePlayers})`);
    return bestNode;
  }

  // Get node by name
  getNodeByName(name) {
    return this.nodes.find(n => n.name === name);
  }

  // Mark node as failed
  markNodeFailure(nodeName, reason = 'Unknown') {
    const node = this.getNodeByName(nodeName);
    if (node) {
      node.failures++;
      node.lastFailure = Date.now();
      node.connected = false;
      node.activePlayers = 0;
      logger.error(`Node ${nodeName} marked as failed (failures: ${node.failures}, reason: ${reason})`);
    }
  }

  // Mark node as connected
  markNodeConnected(nodeName) {
    const node = this.getNodeByName(nodeName);
    if (node) {
      node.connected = true;
      node.failures = 0;
      logger.success(`Node ${nodeName} connected successfully`);
    }
  }

  // Increment active players on node
  incrementPlayers(nodeName) {
    const node = this.getNodeByName(nodeName);
    if (node) {
      node.activePlayers++;
      logger.node(nodeName, `Active players: ${node.activePlayers}`);
    }
  }

  // Decrement active players on node
  decrementPlayers(nodeName) {
    const node = this.getNodeByName(nodeName);
    if (node && node.activePlayers > 0) {
      node.activePlayers--;
      logger.node(nodeName, `Active players: ${node.activePlayers}`);
    }
  }

  // Attempt to reconnect to failed nodes
  async reconnectNodes(shoukakuManager) {
    const now = Date.now();
    
    for (const node of this.nodes) {
      if (!node.connected && node.failures < MAX_NODE_FAILURES) {
        const timeSinceFailure = now - (node.lastFailure || 0);
        
        if (timeSinceFailure >= NODE_RECONNECT_DELAY) {
          try {
            logger.info(`Attempting to reconnect to node ${node.name}`);
            await shoukakuManager.addNode({
              name: node.name,
              url: `${node.secure ? 'wss' : 'ws'}://${node.host}:${node.port}`,
              auth: node.password,
              resume: true,
              resumeKey: `nitrozen-${node.name}`,
              resumeTimeout: 60
            });
            this.markNodeConnected(node.name);
          } catch (err) {
            logger.error(`Reconnect failed for ${node.name}`, err);
          }
        }
      }
    }
  }

  // Get node status for API
  getStatus() {
    return this.nodes.map(node => ({
      name: node.name,
      host: node.host,
      port: node.port,
      connected: node.connected,
      activePlayers: node.activePlayers,
      failures: node.failures,
      lastFailure: node.lastFailure
    }));
  }

  // Switch to next available node
  async switchNode(guildId) {
    const nextNode = this.getBestNode();
    if (!nextNode) {
      throw new Error('No available nodes');
    }
    
    logger.player(`Switching guild ${guildId} to node ${nextNode.name}`);
    return nextNode;
  }
}

module.exports = LavalinkNodePool;
