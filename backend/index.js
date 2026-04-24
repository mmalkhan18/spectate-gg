require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const sessionRoutes = require('./routes/sessions');
const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '50mb' }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 200 });
app.use('/api/', limiter);

app.use('/api/sessions', sessionRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(process.env.PORT || 3001, () => {
  console.log(`Backend running on port ${process.env.PORT || 3001}`);
});