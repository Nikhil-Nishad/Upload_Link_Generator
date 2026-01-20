import { githubService } from './github.js';

const UPLOADS_FILE = 'metadata/uploads.json';
const FB_REELS_FILE = 'metadata/fb_reels.json';

export const metadataService = {
    // --- Uploads Metadata ---
    getUploads: async () => {
        const result = await githubService.getFile(UPLOADS_FILE);
        return result && result.content ? JSON.parse(result.content) : [];
    },

    addUpload: async (uploadData) => {
        // Retry logic to handle SHA conflicts
        let retries = 3;

        while (retries > 0) {
            try {
                // Get file content AND sha atomically in single API call
                const fileData = await githubService.getFile(UPLOADS_FILE);
                const uploads = fileData && fileData.content ? JSON.parse(fileData.content) : [];
                uploads.push(uploadData);

                const content = JSON.stringify(uploads, null, 2);

                if (fileData && fileData.sha) {
                    // Update existing file with the SHA we just got atomically
                    return await githubService.updateFile(UPLOADS_FILE, content, `Add upload ${uploadData.uuid}`, fileData.sha);
                } else {
                    // Create new file
                    return await githubService.uploadFile(UPLOADS_FILE, content, `Init uploads.json with ${uploadData.uuid}`);
                }
            } catch (error) {
                // Retry on SHA mismatch errors (409 conflict)
                if (error.status === 409 && retries > 1) {
                    console.log(`SHA conflict detected, retrying... (${retries - 1} attempts left)`);
                    retries--;
                    // Wait a bit before retrying
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }
                throw error;
            }
        }
    },

    updateUploads: async (newUploads) => {
        const sha = await githubService.getFileSha(UPLOADS_FILE);
        const content = JSON.stringify(newUploads, null, 2);
        if (sha) {
            return await githubService.updateFile(UPLOADS_FILE, content, 'Update uploads.json', sha);
        } else {
            return await githubService.uploadFile(UPLOADS_FILE, content, 'Init uploads.json');
        }
    },

    // --- Facebook Reels Metadata ---
    getFbReels: async () => {
        const result = await githubService.getFile(FB_REELS_FILE);
        return result && result.content ? JSON.parse(result.content) : [];
    },

    updateFbReelStatus: async (uuid, statusData) => {
        // Get file content AND sha atomically
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
            return await githubService.updateFile(FB_REELS_FILE, content, `Update FB reel status ${uuid}`, fileData.sha);
        } else {
            return await githubService.uploadFile(FB_REELS_FILE, content, `Init fb_reels.json with ${uuid}`);
        }
    },

    updateFbReels: async (newReels) => {
        const sha = await githubService.getFileSha(FB_REELS_FILE);
        const content = JSON.stringify(newReels, null, 2);
        if (sha) {
            return await githubService.updateFile(FB_REELS_FILE, content, 'Update fb_reels.json', sha);
        } else {
            return await githubService.uploadFile(FB_REELS_FILE, content, 'Init fb_reels.json');
        }
    }
};
