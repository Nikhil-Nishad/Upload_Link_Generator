import { metadataService } from '../services/metadata.js';
import { githubService } from '../services/github.js';
import { config } from '../config.js';

export const cleanupService = {
    runCleanup: async () => {
        console.log('Starting cleanup process...');
        const now = new Date();
        const uploads = await metadataService.getUploads();
        const fbReels = await metadataService.getFbReels();

        const remainingUploads = [];
        let deletedCount = 0;

        for (const upload of uploads) {
            const deleteAt = new Date(upload.delete_at);
            const isExpired = now > deleteAt;

            // Check if published on FB
            const fbReel = fbReels.find(r => r.uuid === upload.uuid);
            const isPublished = fbReel && fbReel.upload_status === 'published';

            if (isExpired && isPublished) {
                console.log(`Deleting expired and published video: ${upload.uuid}`);
                try {
                    // Delete the video file
                    await githubService.deleteFile(upload.github_path, `Cleanup expired video ${upload.uuid}`);

                    // Mark in metadata as deleted (but we are filtering them out of uploads.json, 
                    // or we can keep them with status 'deleted'. 
                    // The prompt says "Auto-delete after 2 days" and "Clean ... Metadata entries".
                    // But also says "Keep file id, and url in fb_reels.json for future reference."

                    // So we remove from uploads.json, but kept in fb_reels.json.
                    deletedCount++;
                } catch (e) {
                    console.error(`Failed to delete video ${upload.uuid}:`, e.message);
                    // If failed to delete, keep it in uploads to retry later
                    remainingUploads.push(upload);
                }
            } else {
                remainingUploads.push(upload);
            }
        }

        if (deletedCount > 0) {
            await metadataService.updateUploads(remainingUploads);
            console.log(`Cleanup complete. Deleted ${deletedCount} videos.`);
        } else {
            console.log('No videos to cleanup.');
        }

        return { deleted: deletedCount };
    }
};
