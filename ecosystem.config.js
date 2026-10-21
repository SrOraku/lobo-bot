// ============================================================
// 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑ — PM2 Config
// Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺
// ============================================================

module.exports = {
  apps: [{
    name:          'lobo-bot',
    script:        'src/index.js',
    instances:     1,
    autorestart:   true,
    watch:         false,
    max_memory_restart: '512M',
    restart_delay: 5000,
    max_restarts:  10,
    env: {
      NODE_ENV: 'production',
    },
    error_file:  'logs/pm2-error.log',
    out_file:    'logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
