/**
 * Expense Routes
 * CRUD operations, summary aggregation, and CSV export
 */
const express = require('express');
const { pool } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All expense routes require authentication
router.use(requireAuth);

/**
 * GET /api/expenses
 * List all expenses for the current user, with optional date filtering
 */
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = 'SELECT * FROM expenses WHERE user_id = ?';
    const params = [req.session.userId];

    if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const [expenses] = await pool.query(query, params);
    res.json({ expenses });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

/**
 * POST /api/expenses
 * Create a new expense
 */
router.post('/', async (req, res) => {
  try {
    const { amount, category, description, date, source } = req.body;

    if (!amount || !category) {
      return res.status(400).json({ error: 'Amount and category are required' });
    }

    const expenseDate = date || new Date().toISOString().split('T')[0];
    const expenseSource = source || 'manual';

    const [result] = await pool.query(
      'INSERT INTO expenses (user_id, amount, category, description, date, source) VALUES (?, ?, ?, ?, ?, ?)',
      [req.session.userId, amount, category, description || '', expenseDate, expenseSource]
    );

    const [newExpense] = await pool.query('SELECT * FROM expenses WHERE id = ?', [result.insertId]);

    res.status(201).json({ expense: newExpense[0] });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

/**
 * DELETE /api/expenses/:id
 * Delete an expense (only if it belongs to the current user)
 */
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM expenses WHERE id = ? AND user_id = ?',
      [req.params.id, req.session.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

/**
 * GET /api/expenses/summary
 * Aggregated data for charts: category totals and monthly totals
 */
router.get('/summary', async (req, res) => {
  try {
    const userId = req.session.userId;

    // Category-wise totals (for pie chart)
    const [categoryData] = await pool.query(
      `SELECT category, SUM(amount) as total 
       FROM expenses 
       WHERE user_id = ? 
       GROUP BY category 
       ORDER BY total DESC`,
      [userId]
    );

    // Monthly totals (for bar chart) — last 12 months
    const [monthlyData] = await pool.query(
      `SELECT 
         DATE_FORMAT(date, '%Y-%m') as month,
         SUM(amount) as total
       FROM expenses 
       WHERE user_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY DATE_FORMAT(date, '%Y-%m')
       ORDER BY month ASC`,
      [userId]
    );

    // Total spending
    const [totalData] = await pool.query(
      'SELECT SUM(amount) as total, COUNT(*) as count FROM expenses WHERE user_id = ?',
      [userId]
    );

    res.json({
      categoryData,
      monthlyData,
      total: totalData[0].total || 0,
      count: totalData[0].count || 0,
    });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

/**
 * GET /api/expenses/export
 * Export all expenses as CSV
 */
router.get('/export', async (req, res) => {
  try {
    const [expenses] = await pool.query(
      'SELECT amount, category, description, date, source, created_at FROM expenses WHERE user_id = ? ORDER BY date DESC',
      [req.session.userId]
    );

    // Build CSV
    const headers = 'Amount,Category,Description,Date,Source,Created At\n';
    const rows = expenses
      .map(
        (e) =>
          `${e.amount},"${e.category}","${e.description || ''}",${e.date},${e.source},${e.created_at}`
      )
      .join('\n');

    const csv = headers + rows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=expenses.csv');
    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export expenses' });
  }
});

module.exports = router;
