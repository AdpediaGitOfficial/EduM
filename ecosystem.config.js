/**
 * PM2 process file — runs both EduM services on a standard server.
 *
 *   pm2 start ecosystem.config.js          # start api + web
 *   pm2 reload ecosystem.config.js         # zero-downtime reload
 *   pm2 save && pm2 startup                # persist across reboots
 *
 * Secrets/connection strings are NOT set here: the API reads apps/api/.env
 * (dotenv via @nestjs/config); override anything with real environment
 * variables at the PM2 level if preferred.
 */
module.exports = {
  apps: [
    {
      name: 'edum-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: process.env.EDUM_API_INSTANCES || 2,
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      out_file: '../../logs/api-out.log',
      error_file: '../../logs/api-error.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'edum-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        API_INTERNAL_URL: 'http://127.0.0.1:4000',
      },
      out_file: '../../logs/web-out.log',
      error_file: '../../logs/web-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
