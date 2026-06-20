module.exports = {
  db: {
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '123456',
    database: 'juyi',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
  },
  server: {
    port: 3000,
  },
};