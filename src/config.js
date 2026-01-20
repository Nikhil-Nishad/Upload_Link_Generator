import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: process.env.PORT || 3000,
    github: {
        token: process.env.GITHUB_TOKEN,
        owner: process.env.REPO_OWNER,
        repo: process.env.REPO_NAME,
        branch: 'main',
        storageBranch: process.env.STORAGE_BRANCH || 'media',
    },
    cleanup: {
        retentionHours: parseInt(process.env.RETENTION_HOURS, 10) || 48,
    },
    server: {
        requestTimeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 120000, // 2 minutes for large downloads
        maxConcurrentUploads: parseInt(process.env.MAX_CONCURRENT, 10) || 3,
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 60 * 1000, // 1 minute
        max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 10, // 10 requests per minute
    }
};

// Validate required configuration
const requiredEnvVars = ['GITHUB_TOKEN', 'REPO_OWNER', 'REPO_NAME'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please set these in your .env file or Render environment variables.');
} else {
    console.log(`✅ Configuration loaded for ${config.github.owner}/${config.github.repo}`);
}
