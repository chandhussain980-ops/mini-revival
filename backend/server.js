/**
 * Expense Tracker — Express Server
 * Main entry point for the backend API
 */
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
require('dotenv').config();

const { pool, testConnection } = require('./db/connection');
const authRoutes = require('./routes/auth');
const expenseRoutes = require('./routes/expenses');
const aiRoutes = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── CORS Configuration ──────────────────────────────────────
// Allow the React dev server to make requests with credentials (cookies)
app.use(
  cors({
    origin: 'http://localhost:3000',
    credentials: true,
  })
);

// ─── Body Parsing ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Session Configuration ────────────────────────────────────
// Store sessions in MySQL for persistence across server restarts
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'expense_tracker',
  clearExpired: true,
  checkExpirationInterval: 900000, // 15 minutes
  expiration: 86400000, // 24 hours
});

app.use(
  session({
    key: 'expense_tracker_sid',
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 86400000, // 24 hours
      httpOnly: true,
      sameSite: 'lax',
    },
  })
);

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/ai', aiRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Start Server ─────────────────────────────────────────────
async function startServer() {
  const dbConnected = await testConnection();

  if (!dbConnected) {
    console.error('⚠️  Server starting without database connection.');
    console.error('   Make sure MySQL is running and run the schema.sql file:');
    console.error('   mysql -u root -p < db/schema.sql');
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Expense Tracker API running on http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health`);
    console.log(`   Ollama model: ${process.env.OLLAMA_MODEL || 'llama3.2'}\n`);
  });
}

startServer();
