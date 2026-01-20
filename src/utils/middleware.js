/**
 * Production middleware utilities
 */

// Simple in-memory rate limiter (suitable for single-instance free tier)
const rateLimitStore = new Map();

export const createRateLimiter = (options = {}) => {
    const { windowMs = 60000, max = 10 } = options;

    return (req, res, next) => {
        const key = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();

        // Clean up old entries
        const entry = rateLimitStore.get(key);
        if (entry && now - entry.windowStart > windowMs) {
            rateLimitStore.delete(key);
        }

        const current = rateLimitStore.get(key) || { count: 0, windowStart: now };

        if (current.count >= max) {
            const retryAfter = Math.ceil((current.windowStart + windowMs - now) / 1000);
            res.set('Retry-After', String(retryAfter));
            return res.status(429).json({
                error: 'Too many requests',
                retryAfter,
                message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`
            });
        }

        current.count++;
        rateLimitStore.set(key, current);
        next();
    };
};

// Request timeout middleware
export const requestTimeout = (timeoutMs = 120000) => {
    return (req, res, next) => {
        req.setTimeout(timeoutMs, () => {
            if (!res.headersSent) {
                res.status(408).json({
                    error: 'Request timeout',
                    message: 'The request took too long to process'
                });
            }
        });
        next();
    };
};

// Structured request logging
export const requestLogger = () => {
    return (req, res, next) => {
        const startTime = Date.now();
        const requestId = Math.random().toString(36).substring(7);

        req.requestId = requestId;

        // Log request
        console.log(`[${requestId}] ${req.method} ${req.path} - Started`);

        // Log response when finished
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            const status = res.statusCode;
            const statusEmoji = status >= 500 ? '❌' : status >= 400 ? '⚠️' : '✅';
            console.log(`[${requestId}] ${req.method} ${req.path} - ${statusEmoji} ${status} (${duration}ms)`);
        });

        next();
    };
};

// Global error handler
export const errorHandler = (err, req, res, next) => {
    console.error(`[${req.requestId || 'unknown'}] Error:`, err.message);

    // Don't leak error details in production
    const isProduction = process.env.NODE_ENV === 'production';

    const statusCode = err.status || err.statusCode || 500;

    res.status(statusCode).json({
        error: statusCode >= 500 ? 'Internal server error' : err.message,
        ...(isProduction ? {} : { details: err.message, stack: err.stack })
    });
};

// Concurrency limiter for GitHub API calls
const inFlightOperations = new Set();

export const concurrencyLimiter = {
    acquire: async (key, maxWaitMs = 30000) => {
        const startTime = Date.now();

        while (inFlightOperations.has(key)) {
            if (Date.now() - startTime > maxWaitMs) {
                throw new Error(`Timeout waiting for lock: ${key}`);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        inFlightOperations.add(key);
    },

    release: (key) => {
        inFlightOperations.delete(key);
    }
};
