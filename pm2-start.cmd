module.exports = {
  apps: [
    {
      name: 'socket-server',
      script: 'socket-server.js',
      cwd: 'C:/admin',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        SOCKET_PORT: 3001
      }
    }
  ]
};
