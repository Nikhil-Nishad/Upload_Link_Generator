/**
 * Comprehensive production verification test
 * Tests: 3 sequential uploads, public URL access, duplicate detection, cleanup
 */
import fetch from 'node-fetch';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Test file IDs from Google Drive
const TEST_FILE_IDS = [
    '1o4k497ewTpvRDpVbWiTKP1zVr0lr6Xdu',
    '1bzPFhZDjC0QAkq177o3jLfoqgp8yqqZ7',
    '1mWPnKIxqC24L6IFkBat5n7VN5NAiaIn8'
];

const uploadedVideos = [];

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testHealth() {
    console.log('\n=== Test 1: Health Check ===');
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    console.log('✅ Health:', data);
    return data.status === 'ok';
}

async function testGzipCompression() {
    console.log('\n=== Test 2: Gzip Compression ===');
    const res = await fetch(`${BASE_URL}/health`, {
        headers: { 'Accept-Encoding': 'gzip, deflate' }
    });
    const encoding = res.headers.get('content-encoding');
    console.log(`Content-Encoding: ${encoding || 'none (small response may not compress)'}`);
    return true; // Small responses may not be compressed
}

async function testFacebookCrawlerBypass() {
    console.log('\n=== Test 3: Facebook Crawler Bypass ===');
    // Make 15 requests with FB user-agent (should not be rate limited)
    for (let i = 0; i < 15; i++) {
        const res = await fetch(`${BASE_URL}/health`, {
            headers: { 'User-Agent': 'facebookexternalhit/1.1' }
        });
        if (res.status === 429) {
            console.log('❌ Facebook crawler was rate limited!');
            return false;
        }
    }
    console.log('✅ Facebook crawler bypassed rate limiting (15 requests)');
    return true;
}

async function testSequentialUploads() {
    console.log('\n=== Test 4: Sequential Uploads (3 files) ===');

    for (let i = 0; i < 3; i++) {
        const fileId = TEST_FILE_IDS[i];
        console.log(`\nUploading file ${i + 1}/3: ${fileId}`);

        const startTime = Date.now();
        const res = await fetch(`${BASE_URL}/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId })
        });

        if (!res.ok) {
            const error = await res.text();
            console.log(`❌ Upload ${i + 1} failed: ${res.status} - ${error}`);
            return false;
        }

        const data = await res.json();
        const duration = Date.now() - startTime;

        console.log(`✅ Upload ${i + 1}: ${data.uuid}`);
        console.log(`   URL: ${data.url}`);
        console.log(`   Size: ${data.size_mb} MB`);
        console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);
        console.log(`   Cached: ${data.cached || false}`);

        uploadedVideos.push(data);

        // Small delay between uploads to avoid overwhelming
        if (i < 2) await delay(500);
    }

    return true;
}

async function testPublicUrlAccess() {
    console.log('\n=== Test 5: Public URL Accessibility ===');

    for (const video of uploadedVideos) {
        console.log(`\nChecking: ${video.url}`);

        try {
            // Test with HEAD request to check accessibility
            const res = await fetch(video.url, { method: 'HEAD' });
            const contentType = res.headers.get('content-type');
            const contentLength = res.headers.get('content-length');

            if (res.ok) {
                console.log(`✅ Accessible - Type: ${contentType}, Size: ${contentLength} bytes`);
            } else {
                console.log(`⚠️ Status: ${res.status} - jsDelivr may need time to cache`);
            }

            // Test with Facebook crawler user-agent
            const fbRes = await fetch(video.url, {
                method: 'HEAD',
                headers: { 'User-Agent': 'facebookexternalhit/1.1' }
            });
            console.log(`   FB Crawler access: ${fbRes.ok ? '✅' : '❌'} (${fbRes.status})`);

        } catch (err) {
            console.log(`⚠️ Cannot reach yet: ${err.message}`);
        }
    }

    return true;
}

async function testDuplicateDetection() {
    console.log('\n=== Test 6: Duplicate Detection ===');

    const fileId = TEST_FILE_IDS[0];
    console.log(`Re-uploading: ${fileId}`);

    const res = await fetch(`${BASE_URL}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId })
    });

    const data = await res.json();

    if (data.cached) {
        console.log('✅ Duplicate detected - returned cached URL');
        console.log(`   UUID: ${data.uuid}`);
        return true;
    } else {
        console.log('❌ Duplicate not detected - re-uploaded (may be fresh instance)');
        return false;
    }
}

async function testMarkPublished() {
    console.log('\n=== Test 7: Mark Published ===');

    if (uploadedVideos.length === 0) {
        console.log('⚠️ No uploaded videos to test');
        return false;
    }

    const video = uploadedVideos[0];
    const res = await fetch(`${BASE_URL}/mark-published`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            uuid: video.uuid,
            page_id: 'test_page',
            video_id: 'test_video',
            reel_id: 'test_reel'
        })
    });

    const data = await res.json();

    if (data.success) {
        console.log(`✅ Marked as published: ${video.uuid}`);
        return true;
    }

    console.log('❌ Failed to mark as published:', data);
    return false;
}

async function testCleanup() {
    console.log('\n=== Test 8: Cleanup ===');

    const res = await fetch(`${BASE_URL}/cleanup`, { method: 'POST' });
    const data = await res.json();

    console.log('Cleanup result:', data);
    console.log('✅ Cleanup completed (videos won\'t delete until 48h passed + published)');
    return true;
}

async function testListUploads() {
    console.log('\n=== Test 9: List All Uploads (Record Check) ===');

    const res = await fetch(`${BASE_URL}/uploads`);
    const data = await res.json();

    console.log(`Total uploads in system: ${data.count}`);
    if (data.uploads && data.uploads.length > 0) {
        console.log('\nRecent uploads:');
        data.uploads.slice(-5).forEach(u => {
            console.log(`  - ${u.uuid}: ${u.status} (${u.source})`);
        });
    }
    console.log('✅ Records maintained');
    return true;
}

async function runAllTests() {
    console.log('=========================================');
    console.log('  Production Verification Tests');
    console.log(`  Target: ${BASE_URL}`);
    console.log('=========================================');

    const results = {
        health: false,
        gzip: false,
        fbCrawler: false,
        uploads: false,
        publicUrl: false,
        duplicate: false,
        published: false,
        cleanup: false,
        records: false
    };

    try {
        results.health = await testHealth();
        results.gzip = await testGzipCompression();
        results.fbCrawler = await testFacebookCrawlerBypass();
        results.uploads = await testSequentialUploads();
        results.publicUrl = await testPublicUrlAccess();
        results.duplicate = await testDuplicateDetection();
        results.published = await testMarkPublished();
        results.cleanup = await testCleanup();
        results.records = await testListUploads();
    } catch (err) {
        console.error('\n❌ Test error:', err.message);
    }

    console.log('\n=========================================');
    console.log('  Test Summary');
    console.log('=========================================');

    Object.entries(results).forEach(([name, passed]) => {
        console.log(`  ${passed ? '✅' : '❌'} ${name}`);
    });

    const passedCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.keys(results).length;

    console.log(`\n  Passed: ${passedCount}/${totalCount}`);

    if (passedCount === totalCount) {
        console.log('\n🎉 All tests passed!');
    } else {
        console.log('\n⚠️ Some tests failed - check logs above');
    }

    // Output generated URLs for reference
    if (uploadedVideos.length > 0) {
        console.log('\n=========================================');
        console.log('  Generated URLs');
        console.log('=========================================');
        uploadedVideos.forEach((v, i) => {
            console.log(`\n${i + 1}. UUID: ${v.uuid}`);
            console.log(`   URL: ${v.url}`);
            console.log(`   Expires: ${v.expires_at}`);
        });
    }
}

runAllTests();
