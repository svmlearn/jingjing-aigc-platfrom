module.exports = {
  apps: [
    {
      name: "jingjing-app",
      cwd: "/srv/jingjing/app",
      script: "bash",
      args:
        "-lc 'set -a; source /etc/jingjing/app.env; set +a; corepack enable >/dev/null 2>&1 || true; pnpm exec next start --hostname ${HOSTNAME:-127.0.0.1} --port ${PORT:-3000}'",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      out_file: "/srv/jingjing/shared/logs/app/pm2-out.log",
      error_file: "/srv/jingjing/shared/logs/app/pm2-error.log",
      merge_logs: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
