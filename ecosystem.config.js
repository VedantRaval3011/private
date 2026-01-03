/**
 * PM2 Process Manager Configuration
 * For running Formula Master as a production service
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 */

module.exports = {
  apps: [{
    name: 'formula-master',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -H 0.0.0.0 -p 3000',
    cwd: 'C:\\Dev\\private',
    interpreter: 'node',
    
    // Environment
    env: {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/formula-master',
      PORT: 3000
    },
    
    // Process management
    instances: 1,           // Single instance for Next.js
    exec_mode: 'fork',      // Fork mode for Next.js
    autorestart: true,      // Restart on crash
    watch: false,           // Don't watch for file changes in production
    max_memory_restart: '1G', // Restart if memory exceeds 1GB
    
    // Restart behavior
    min_uptime: '10s',      // Minimum uptime to consider as stable
    max_restarts: 10,       // Max restarts within 15 minutes
    restart_delay: 4000,    // Delay between restarts (4 seconds)
    
    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    combine_logs: true,
    merge_logs: true,
    log_file: 'C:\\Dev\\private\\logs\\combined.log',
    error_file: 'C:\\Dev\\private\\logs\\error.log',
    out_file: 'C:\\Dev\\private\\logs\\out.log',
    
    // Windows-specific
    kill_timeout: 5000,     // Give app 5 seconds to gracefully shutdown
  }]
};
