// Logger Utility
const logger = {
  info: (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n📡 [${timestamp}] ℹ️  ${message}`);
    if (data) console.log('   Data:', JSON.stringify(data, null, 2));
  },
  
  success: (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n✅ [${timestamp}] ${message}`);
    if (data) console.log('   Data:', JSON.stringify(data, null, 2));
  },
  
  error: (message, error = null) => {
    const timestamp = new Date().toLocaleTimeString();
    console.error(`\n❌ [${timestamp}] ${message}`);
    if (error) {
      console.error('   Error:', error.message || error);
      if (error.stack) console.error('   Stack:', error.stack);
    }
  },
  
  warn: (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    console.warn(`\n⚠️  [${timestamp}] ${message}`);
    if (data) console.warn('   Data:', JSON.stringify(data, null, 2));
  },
  
  player: (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n🎵 [${timestamp}] ${message}`);
    if (data) console.log('   Data:', JSON.stringify(data, null, 2));
  },
  
  node: (nodeName, message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n🔗 [${timestamp}] [${nodeName}] ${message}`);
    if (data) console.log('   Data:', JSON.stringify(data, null, 2));
  }
};

module.exports = logger;
