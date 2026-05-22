// Search Service - YouTube Search
const ytSearch = require('yt-search');
const logger = require('../utils/logger');

class SearchService {
  async search(query, limit = 10) {
    logger.info(`Searching for: "${query}"`);
    
    if (!query) {
      throw new Error('Missing query parameter');
    }

    try {
      const { videos } = await ytSearch(query);
      const results = videos.slice(0, limit).map(v => ({
        id: v.videoId,
        title: v.title,
        artist: v.author.name,
        thumbnail: v.thumbnail,
        duration: v.timestamp,
        durationSeconds: v.seconds,
        source: 'youtube'
      }));

      logger.success(`Found ${results.length} results`);
      return results;
    } catch (err) {
      logger.error('Search failed', err);
      throw new Error('Search failed: ' + err.message);
    }
  }
}

module.exports = new SearchService();
