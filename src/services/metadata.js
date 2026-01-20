import { githubService } from './github.js';
import { concurrencyLimiter } from '../utils/middleware.js';

const UPLOADS_FILE = 'metadata/uploads.json';
const FB_REELS_FILE = 'metadata/fb_reels.json';

// Mutex key for metadata operations
const METADATA_LOCK = 'metadata_write_lock';

/**
 * Exponential backoff delay calculation
 */
const getBackoffDelay = (attempt, baseDelay = 100) => {
    return baseDelay * Math.pow(2, attempt);
};

export const metadataService = {
    // --- Uploads Metadata ---
    getUploads: async () => {
        const result = await githubService.getFile(UPLOADS_FILE);
        return result && result.content ? JSON.parse(result.content) : [];
    },

    /**
     * Find an existing upload by source file ID (for duplicate detection)
     * Returns the upload if found and not deleted, null otherwise
     */
    findBySourceId: async (sourceFileId) => {
        if (!sourceFileId) return null;

        try {
            const uploads = await metadataService.getUploads();
            return uploads.find(u =>
                u.source_file_id === sourceFileId &&
                u.status !== 'deleted'
            ) || null;
        } catch (error) {
            console.error('Error finding by source ID:', error.message);
            return null;
        }
    },

    /**
     * Find an existing upload by URL (for duplicate detection via URL)
     */
    findBySourceUrl: async (sourceUrl) => {
        if (!sourceUrl) return null;

        try {
            const uploads = await metadataService.getUploads();
            return uploads.find(u =>
                u.source_url === sourceUrl &&
                u.status !== 'deleted'
            ) || null;
        } catch (error) {
            console.error('Error finding by source URL:', error.message);
            return null;
        }
    },

    /**
     * Add a new upload with robust retry logic
     * Uses concurrency control to prevent race conditions
     */
    addUpload: async (uploadData) => {
        const maxRetries = 5;
        let lastError = null;

        // Acquire lock to prevent concurrent writes
        try {
            await concurrencyLimiter.acquire(METADATA_LOCK, 60000);
        } catch (lockError) {
            console.error('Failed to acquire metadata lock:', lockError.message);
            throw new Error('Server busy, please retry');
        }

        try {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    // ALWAYS fetch fresh data and SHA for each attempt
                    const fileData = await githubService.getFile(UPLOADS_FILE);
                    const uploads = fileData && fileData.content ? JSON.parse(fileData.content) : [];

                    // Check if this upload already exists (race condition protection)
                    const existingIndex = uploads.findIndex(u => u.uuid === uploadData.uuid);
                    if (existingIndex >= 0) {
                        console.log(`Upload ${uploadData.uuid} already exists, skipping duplicate`);
                        return uploads[existingIndex];
                    }

                    uploads.push(uploadData);
                    const content = JSON.stringify(uploads, null, 2);

                    if (fileData && fileData.sha) {
                        await githubService.updateFile(
                            UPLOADS_FILE,
                            content,
                            `Add upload ${uploadData.uuid}`,
                            fileData.sha
                        );
                    } else {
                        await githubService.uploadFile(
                            UPLOADS_FILE,
                            content,
                            `Init uploads.json with ${uploadData.uuid}`
                        );
                    }

                    console.log(`Successfully added upload ${uploadData.uuid} (attempt ${attempt + 1})`);
                    return uploadData;

                } catch (error) {
                    lastError = error;

                    // Only retry on SHA conflict (409) or rate limit (403)
                    const isRetryable = error.status === 409 ||
                        (error.status === 403 && error.message?.includes('rate limit'));

                    if (isRetryable && attempt < maxRetries - 1) {
                        const delay = getBackoffDelay(attempt);
                        console.log(`SHA conflict or rate limit, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    throw error;
                }
            }
        } finally {
            // Always release the lock
            concurrencyLimiter.release(METADATA_LOCK);
        }

        throw lastError || new Error('Failed to add upload after all retries');
    },

    /**
     * Update all uploads (used by cleanup)
     */
    updateUploads: async (newUploads) => {
        const maxRetries = 5;

        try {
            await concurrencyLimiter.acquire(METADATA_LOCK, 60000);
        } catch (lockError) {
            throw new Error('Server busy, please retry');
        }

        try {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    // Fresh fetch for each attempt
                    const fileData = await githubService.getFile(UPLOADS_FILE);
                    const content = JSON.stringify(newUploads, null, 2);

                    if (fileData && fileData.sha) {
                        await githubService.updateFile(UPLOADS_FILE, content, 'Update uploads.json', fileData.sha);
                    } else {
                        await githubService.uploadFile(UPLOADS_FILE, content, 'Init uploads.json');
                    }

                    return true;
                } catch (error) {
                    if (error.status === 409 && attempt < maxRetries - 1) {
                        const delay = getBackoffDelay(attempt);
                        console.log(`SHA conflict in updateUploads, retrying in ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    throw error;
                }
            }
        } finally {
            concurrencyLimiter.release(METADATA_LOCK);
        }
    },

    // --- Facebook Reels Metadata ---
    getFbReels: async () => {
        const result = await githubService.getFile(FB_REELS_FILE);
        return result && result.content ? JSON.parse(result.content) : [];
    },

    updateFbReelStatus: async (uuid, statusData) => {
        const maxRetries = 5;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Fresh fetch for each attempt
                const fileData = await githubService.getFile(FB_REELS_FILE);
                let reels = fileData && fileData.content ? JSON.parse(fileData.content) : [];
                const index = reels.findIndex(r => r.uuid === uuid);

                if (index >= 0) {
                    reels[index] = { ...reels[index], ...statusData };
                } else {
                    reels.push({ uuid, ...statusData });
                }

                const content = JSON.stringify(reels, null, 2);

                if (fileData && fileData.sha) {
                    await githubService.updateFile(FB_REELS_FILE, content, `Update FB reel status ${uuid}`, fileData.sha);
                } else {
                    await githubService.uploadFile(FB_REELS_FILE, content, `Init fb_reels.json with ${uuid}`);
                }

                return true;
            } catch (error) {
                if (error.status === 409 && attempt < maxRetries - 1) {
                    const delay = getBackoffDelay(attempt);
                    console.log(`SHA conflict in updateFbReelStatus, retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error;
            }
        }
    },

    updateFbReels: async (newReels) => {
        const maxRetries = 5;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const fileData = await githubService.getFile(FB_REELS_FILE);
                const content = JSON.stringify(newReels, null, 2);

                if (fileData && fileData.sha) {
                    await githubService.updateFile(FB_REELS_FILE, content, 'Update fb_reels.json', fileData.sha);
                } else {
                    await githubService.uploadFile(FB_REELS_FILE, content, 'Init fb_reels.json');
                }

                return true;
            } catch (error) {
                if (error.status === 409 && attempt < maxRetries - 1) {
                    const delay = getBackoffDelay(attempt);
                    console.log(`SHA conflict in updateFbReels, retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error;
            }
        }
    }
};
