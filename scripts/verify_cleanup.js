import { metadataService } from '../src/services/metadata.js';
import { cleanupService } from '../src/cleanup/cleanup.js';
import { githubService } from '../src/services/github.js';
import { v4 as uuidv4 } from 'uuid';

async function verifyCleanup() {
    console.log('--- Verifying Cleanup Logic ---');

    // 1. Mock an expired upload
    const uuid = uuidv4();
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 50); // 50 hours ago (expired)

    const uploadData = {
        uuid,
        github_path: `uploads/TEST_CLEANUP/reel_${uuid}.mp4`,
        jsdelivr_url: 'https://fake-url.com',
        uploaded_at: pastDate.toISOString(),
        delete_at: pastDate.toISOString(), // Expired
        status: 'uploaded'
    };

    // 2. Mock it as "published" (requirement for deletion)
    const fbData = {
        uuid,
        upload_status: 'published',
        published_at: pastDate.toISOString()
    };

    try {
        console.log(`1. Creating dummy test record: ${uuid}`);

        // Create a dummy file on GitHub so we have something to delete
        await githubService.uploadFile(uploadData.github_path, Buffer.from('dummy video content'), 'Test cleanup file');

        // Inject metadata
        console.log('2. Injecting metadata...');
        await metadataService.addUpload(uploadData);
        await metadataService.updateFbReelStatus(uuid, fbData);

        console.log('3. Running Cleanup Service...');
        const result = await cleanupService.runCleanup();

        console.log('Cleanup Result:', result);

        if (result.deleted >= 1) {
            console.log('✅ SUCCESS: Cleanup logic correctly identified and deleted the expired file.');
        } else {
            console.error('❌ FAILURE: Cleanup logic failed to delete the expired file.');
        }

        // Verify file is gone from GitHub
        const fileExists = await githubService.getFile(uploadData.github_path);
        if (!fileExists) {
            console.log('✅ Verified: File is physically gone from GitHub.');
        } else {
            console.error('❌ Failed: File still exists on GitHub.');
        }

    } catch (error) {
        console.error('Test Error:', error);
    }
}

verifyCleanup();
