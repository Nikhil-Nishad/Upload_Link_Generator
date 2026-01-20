import { githubService } from './github.js';

const UPLOADS_FILE = 'metadata/uploads.json';
const FB_REELS_FILE = 'metadata/fb_reels.json';

export const metadataService = {
    // --- Uploads Metadata ---
    getUploads: async () => {
        const content = await githubService.getFile(UPLOADS_FILE);
        return content ? JSON.parse(content) : [];
    },

    addUpload: async (uploadData) => {
        const uploads = await metadataService.getUploads();
        uploads.push(uploadData);

        // Get SHA of existing file to update it
        const sha = await githubService.getFileSha(UPLOADS_FILE);
        const content = JSON.stringify(uploads, null, 2);

        if (sha) {
            return await githubService.updateFile(UPLOADS_FILE, content, `Add upload ${uploadData.uuid}`, sha);
        } else {
            return await githubService.uploadFile(UPLOADS_FILE, content, `Init uploads.json with ${uploadData.uuid}`);
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
        const content = await githubService.getFile(FB_REELS_FILE);
        return content ? JSON.parse(content) : [];
    },

    updateFbReelStatus: async (uuid, statusData) => {
        let reels = await metadataService.getFbReels();
        const index = reels.findIndex(r => r.uuid === uuid);

        if (index >= 0) {
            reels[index] = { ...reels[index], ...statusData };
        } else {
            reels.push({ uuid, ...statusData });
        }

        const sha = await githubService.getFileSha(FB_REELS_FILE);
        const content = JSON.stringify(reels, null, 2);

        if (sha) {
            return await githubService.updateFile(FB_REELS_FILE, content, `Update FB reel status ${uuid}`, sha);
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
