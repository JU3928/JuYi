const express = require('express');
const path = require('path');
const cors = require('cors');
const config = require('./config');
const errorNotesRouter = require('./routes/errorNotes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files from project root
app.use(express.static(path.join(__dirname, '..')));

// Routes
app.use('/api/errors', errorNotesRouter);

// Health check
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(config.server.port, () => {
  console.log(`JuYi server running at http://localhost:${config.server.port}`);
});