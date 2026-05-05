/**
 * Authentication Middleware
 * Checks if user has an active session before allowing access to protected routes
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

module.exports = { requireAuth };
