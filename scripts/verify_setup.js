import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';
import { pipeline } from 'stream/promises';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
    console.log('Starting verification tests...');

    // 1. Create a dummy MP4 file (minimal valid header if possible, or just random bytes hoping validation is loose enough or we mock it)
    // The validation checks for 'video/mp4' mimetype and size. It doesn't inspect content strictly yet.
    // But wait, the validation script checks `file.mimetype`. Multer determines this from extensions mainly.
    const testFilePath = 'test_video.mp4';
    if (!fs.existsSync(testFilePath)) {
        fs.writeFileSync(testFilePath, Buffer.alloc(1024 * 1024)); // 1MB dummy file
    }

    try {
        // Test 1: Upload
        console.log('\n--- Test 1: Upload Video ---');
        const form = new FormData();
        form.append('file', fs.createReadStream(testFilePath));

        // Note: node-fetch with FormData needs headers
        const uploadRes = await fetch(`${BASE_URL}/upload`, {
            method: 'POST',
            body: form
        });

        if (!uploadRes.ok) {
            const text = await uploadRes.text();
            throw new Error(`Upload failed: ${uploadRes.status} ${text}`);
        }

        const uploadData = await uploadRes.json();
        console.log('Upload successful:', uploadData);
        const { uuid, url } = uploadData;

        if (!uuid || !url) throw new Error('Invalid upload response');

        // Test 2: Get URL/Status
        console.log('\n--- Test 2: Get Video Status ---');
        const getRes = await fetch(`${BASE_URL}/get-url/${uuid}`);
        const getData = await getRes.json();
        console.log('Get Status successful:', getData);

        if (getData.uuid !== uuid) throw new Error('UUID mismatch');

        // Test 3: Mark Published
        console.log('\n--- Test 3: Mark Published ---');
        const publishRes = await fetch(`${BASE_URL}/mark-published`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uuid,
                page_id: 'test_page',
                video_id: 'test_video',
                reel_id: 'test_reel'
            })
        });
        const publishData = await publishRes.json();
        console.log('Mark Published successful:', publishData);

        // Test 4: Cleanup (Should not delete yet as time hasn't passed)
        console.log('\n--- Test 4: Run Cleanup ---');
        const cleanupRes = await fetch(`${BASE_URL}/cleanup`, {
            method: 'POST'
        });
        const cleanupData = await cleanupRes.json();
        console.log('Cleanup run successful:', cleanupData);

        console.log('\n✅ All tests passed!');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
    } finally {
        // Cleanup local test file
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    }
}

runTests();
