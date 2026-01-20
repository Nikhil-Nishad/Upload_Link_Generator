import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { githubService } from './services/github.js';
import { metadataService } from './services/metadata.js';
import { validateFile } from './utils/validation.js';
import { cleanupService } from './cleanup/cleanup.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Conditional multer middleware - only for multipart requests
const conditionalMulter = (req, res, next) => {
    const contentType = req.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
        upload.single('file')(req, res, next);
    } else {
        next();
    }
};

// Routes
app.post('/upload', conditionalMulter, async (req, res) => {
    try {
        let fileBuffer;
        let fileSize;
        const videoUrl = req.body.url;

        // Check if URL is provided (Google Drive or other direct download URL)
        if (videoUrl) {
            console.log('Downloading video from URL:', videoUrl);

            try {
                const response = await fetch(videoUrl);

                if (!response.ok) {
                    return res.status(400).json({
                        error: 'Failed to download video from URL',
                        details: `HTTP ${response.status}: ${response.statusText}`
                    });
                }

                // Get content type to verify it's a video
                const contentType = response.headers.get('content-type');
                if (contentType && !contentType.includes('video')) {
                    console.warn(`Warning: Content-Type is ${contentType}, expected video/*`);
                }

                // Download the file
                const arrayBuffer = await response.arrayBuffer();
                fileBuffer = Buffer.from(arrayBuffer);
                fileSize = fileBuffer.length;

                console.log(`Downloaded ${(fileSize / 1024 / 1024).toFixed(2)} MB from URL`);

                // Validate size (80MB limit)
                const MAX_SIZE = 80 * 1024 * 1024;
                if (fileSize > MAX_SIZE) {
                    return res.status(400).json({
                        error: `File size exceeds 80MB limit (${(fileSize / 1024 / 1024).toFixed(2)} MB)`
                    });
                }

            } catch (fetchError) {
                console.error('Error downloading from URL:', fetchError);
                return res.status(400).json({
                    error: 'Failed to download video from URL',
                    details: fetchError.message
                });
            }
        }
        // Otherwise, use uploaded file
        else if (req.file) {
            const file = req.file;
            const validation = validateFile(file);

            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }

            fileBuffer = file.buffer;
            fileSize = file.size;
        }
        // Neither URL nor file provided
        else {
            return res.status(400).json({
                error: 'No file or URL provided. Please provide either a file upload or a "url" parameter.'
            });
        }

        const uuid = uuidv4();
        const timestamp = new Date().toISOString();
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `reel_${uuid}.mp4`;
        const githubPath = `uploads/${dateStr}/${filename}`;

        // Upload to GitHub (Uses storageBranch from githubService)
        await githubService.uploadFile(githubPath, fileBuffer, `Upload video ${uuid}`);

        // Generate jsDelivr URL (Uses storageBranch)
        const jsdelivrUrl = `https://cdn.jsdelivr.net/gh/${config.github.owner}/${config.github.repo}@${config.github.storageBranch}/${githubPath}`;

        // Calculate delete_at (48 hours from now)
        const deleteAt = new Date();
        deleteAt.setHours(deleteAt.getHours() + config.cleanup.retentionHours);

        const metadata = {
            uuid,
            github_path: githubPath,
            jsdelivr_url: jsdelivrUrl,
            uploaded_at: timestamp,
            delete_at: deleteAt.toISOString(),
            status: 'uploaded',
            source: videoUrl ? 'url' : 'file_upload'
        };

        // Update metadata
        await metadataService.addUpload(metadata);

        res.json({
            success: true,
            uuid,
            url: jsdelivrUrl,
            expires_at: deleteAt.toISOString(),
            size_mb: (fileSize / 1024 / 1024).toFixed(2)
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

app.get('/get-url/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        const uploads = await metadataService.getUploads();
        const upload = uploads.find(u => u.uuid === uuid);

        if (!upload) {
            return res.status(404).json({ error: 'Video not found' });
        }

        res.json(upload);
    } catch (error) {
        console.error('Get URL error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/mark-published', async (req, res) => {
    try {
        const { uuid, page_id, video_id, reel_id } = req.body;

        if (!uuid) {
            return res.status(400).json({ error: 'UUID is required' });
        }

        await metadataService.updateFbReelStatus(uuid, {
            upload_status: 'published',
            published_at: new Date().toISOString(),
            page_id,
            video_id,
            reel_id
        });

        res.json({ success: true, message: 'Marked as published' });
    } catch (error) {
        console.error('Mark published error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/cleanup', async (req, res) => {
    try {
        const result = await cleanupService.runCleanup();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server
app.listen(config.port, async () => {
    console.log(`Server running on port ${config.port}`);
    if (config.github.token) {
        await githubService.ensureStorageBranch();

        // Run cleanup immediately on startup (important for Render restarts)
        console.log('Running initial cleanup check...');
        try {
            await cleanupService.runCleanup();
        } catch (error) {
            console.error('Initial cleanup failed:', error.message);
        }

        // Schedule automatic cleanup every 48 hours
        const CLEANUP_INTERVAL = config.cleanup.retentionHours * 60 * 60 * 1000; // 48 hours in ms
        setInterval(async () => {
            console.log('Running scheduled cleanup...');
            try {
                await cleanupService.runCleanup();
            } catch (error) {
                console.error('Scheduled cleanup failed:', error.message);
            }
        }, CLEANUP_INTERVAL);

        console.log(`Automatic cleanup scheduled every ${config.cleanup.retentionHours} hours`);
    }
});
