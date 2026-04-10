/**
 * Centralized error-handling middleware.
 * Mount after all routes: app.use(errorHandler)
 */
export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  if (status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  res.status(status).json({
    error: err.expose || status < 500
      ? err.message || 'Something went wrong'
      : 'Internal server error',
    ...(isProduction ? {} : { stack: err.stack }),
  });
}

/**
 * 404 handler for unknown routes.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}
