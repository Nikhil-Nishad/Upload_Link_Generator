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
        retentionHours: 48,
    }
};

if (!config.github.token || !config.github.owner || !config.github.repo) {
    console.warn('WARNING: GitHub credentials not fully configured in .env');
}
