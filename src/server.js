import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import multer from 'multer';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { githubService } from './services/github.js';
import { metadataService } from './services/metadata.js';
import { validateFile } from './utils/validation.js';
import { cleanupService } from './cleanup/cleanup.js';
import { googleDriveUtils } from './utils/googleDrive.js';
import {
    createRateLimiter,
    requestTimeout,
    requestLogger,
    errorHandler,
    isFacebookCrawler
} from './utils/middleware.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Trust proxy for Render (required for correct IP detection)
app.set('trust proxy', 1);

// Production middleware
app.use(compression()); // gzip/deflate compression (required by Facebook crawler)
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow jsDelivr to serve videos
    contentSecurityPolicy: false // Disable CSP for API
}));
app.use(cors());
app.use(express.json());
app.use(requestLogger());
app.use(requestTimeout(config.server?.requestTimeout || 120000));

// Rate limiting for upload endpoints (protect free tier)
const uploadRateLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: config.rateLimit?.max || 10 // 10 requests per minute
});

// Conditional multer middleware - only for multipart requests
const conditionalMulter = (req, res, next) => {
    const contentType = req.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
        upload.single('file')(req, res, next);
    } else {
        next();
    }
};

// ============ Health & Status Endpoints ============

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        uptime: process.uptime()
    });
});

app.get('/status', async (req, res) => {
    try {
        const uploads = await metadataService.getUploads();
        const activeUploads = uploads.filter(u => u.status !== 'deleted');

        res.json({
            status: 'ok',
            activeUploads: activeUploads.length,
            storageBranch: config.github.storageBranch,
            retentionHours: config.cleanup.retentionHours
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch status'
        });
    }
});

// ============ Main Upload Endpoint ============

app.post('/upload', uploadRateLimiter, conditionalMulter, async (req, res) => {
    try {
        let fileBuffer;
        let fileSize;
        const videoUrl = req.body.url;
        const fileId = req.body.fileId; // Direct Google Drive file ID support

        // ============ DUPLICATE DETECTION ============

        // Determine source file ID for deduplication
        let sourceFileId = null;
        let sourceUrl = null;

        if (fileId) {
            // Direct file ID provided
            sourceFileId = fileId;
        } else if (videoUrl) {
            // Try to extract file ID from URL (for Google Drive)
            sourceFileId = googleDriveUtils.extractFileId(videoUrl);
            sourceUrl = videoUrl;
        }

        // Check for existing upload by file ID
        if (sourceFileId) {
            const existingUpload = await metadataService.findBySourceId(sourceFileId);
            if (existingUpload) {
                console.log(`Duplicate detected for file ID: ${sourceFileId}, returning cached URL`);

                // Check if the file still exists (hasn't expired)
                const deleteAt = new Date(existingUpload.delete_at);
                const now = new Date();

                if (now < deleteAt) {
                    return res.json({
                        success: true,
                        uuid: existingUpload.uuid,
                        url: existingUpload.jsdelivr_url,
                        expires_at: existingUpload.delete_at,
                        size_mb: existingUpload.size_mb || 'unknown',
                        cached: true,
                        message: 'File already uploaded, returning cached URL'
                    });
                } else {
                    console.log(`Cached entry expired, will re-upload: ${sourceFileId}`);
                }
            }
        }

        // Also check by URL if no file ID match
        if (!sourceFileId && sourceUrl) {
            const existingByUrl = await metadataService.findBySourceUrl(sourceUrl);
            if (existingByUrl) {
                const deleteAt = new Date(existingByUrl.delete_at);
                if (new Date() < deleteAt) {
                    return res.json({
                        success: true,
                        uuid: existingByUrl.uuid,
                        url: existingByUrl.jsdelivr_url,
                        expires_at: existingByUrl.delete_at,
                        cached: true,
                        message: 'File already uploaded, returning cached URL'
                    });
                }
            }
        }

        // ============ DOWNLOAD/UPLOAD FILE ============

        // Priority: fileId > url > file upload
        if (fileId || (videoUrl && googleDriveUtils.extractFileId(videoUrl))) {
            // Use Google Drive utility for better handling
            const driveFileId = fileId || googleDriveUtils.extractFileId(videoUrl);

            try {
                const downloadResult = await googleDriveUtils.downloadFile(driveFileId, {
                    maxSize: 80 * 1024 * 1024 // 80MB limit
                });

                fileBuffer = downloadResult.buffer;
                fileSize = downloadResult.size;
                sourceFileId = driveFileId;

            } catch (downloadError) {
                console.error('Google Drive download error:', downloadError);
                return res.status(400).json({
                    error: 'Failed to download from Google Drive',
                    details: downloadError.message
                });
            }
        }
        else if (videoUrl) {
            // Generic URL download
            console.log('Downloading video from URL:', videoUrl);

            try {
                const response = await fetch(videoUrl, {
                    timeout: 60000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (!response.ok) {
                    return res.status(400).json({
                        error: 'Failed to download video from URL',
                        details: `HTTP ${response.status}: ${response.statusText}`
                    });
                }

                const arrayBuffer = await response.arrayBuffer();
                fileBuffer = Buffer.from(arrayBuffer);
                fileSize = fileBuffer.length;

                console.log(`Downloaded ${(fileSize / 1024 / 1024).toFixed(2)} MB from URL`);

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
        else if (req.file) {
            // File upload
            const file = req.file;
            const validation = validateFile(file);

            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }

            fileBuffer = file.buffer;
            fileSize = file.size;
        }
        else {
            return res.status(400).json({
                error: 'No file, fileId, or URL provided',
                usage: {
                    fileId: 'Google Drive file ID (e.g., "1o4k497ewTpvRDpVbWiTKP1zVr0lr6Xdu")',
                    url: 'Direct download URL or Google Drive share link',
                    file: 'Multipart file upload'
                }
            });
        }

        // ============ UPLOAD TO GITHUB ============

        const uuid = uuidv4();
        const timestamp = new Date().toISOString();
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `reel_${uuid}.mp4`;
        const githubPath = `uploads/${dateStr}/${filename}`;

        // Upload to GitHub (Uses storageBranch from githubService)
        await githubService.uploadFile(githubPath, fileBuffer, `Upload video ${uuid}`);

        // Generate jsDelivr URL (FIXED: uses storageBranch, not hardcoded 'main')
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
            source: fileId ? 'google_drive_id' : (videoUrl ? 'url' : 'file_upload'),
            source_file_id: sourceFileId || null,
            source_url: sourceUrl || null,
            size_mb: (fileSize / 1024 / 1024).toFixed(2)
        };

        // Update metadata
        await metadataService.addUpload(metadata);

        res.json({
            success: true,
            uuid,
            url: jsdelivrUrl,
            expires_at: deleteAt.toISOString(),
            size_mb: (fileSize / 1024 / 1024).toFixed(2),
            cached: false
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message,
            hint: error.status === 409 ? 'GitHub conflict, please retry' : undefined
        });
    }
});

// ============ Other Endpoints ============

app.get('/get-url/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        const uploads = await metadataService.getUploads();
        const foundUpload = uploads.find(u => u.uuid === uuid);

        if (!foundUpload) {
            return res.status(404).json({ error: 'Video not found' });
        }

        res.json(foundUpload);
    } catch (error) {
        console.error('Get URL error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get by source file ID (useful for checking duplicates)
app.get('/check/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const existing = await metadataService.findBySourceId(fileId);

        if (!existing) {
            return res.json({
                exists: false,
                message: 'File not found in cache'
            });
        }

        const deleteAt = new Date(existing.delete_at);
        const expired = new Date() >= deleteAt;

        res.json({
            exists: true,
            expired,
            uuid: existing.uuid,
            url: existing.jsdelivr_url,
            expires_at: existing.delete_at,
            uploaded_at: existing.uploaded_at
        });
    } catch (error) {
        console.error('Check file error:', error);
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

// List all uploads (for debugging)
app.get('/uploads', async (req, res) => {
    try {
        const uploads = await metadataService.getUploads();
        const activeOnly = req.query.active === 'true';

        const result = activeOnly
            ? uploads.filter(u => u.status !== 'deleted')
            : uploads;

        res.json({
            count: result.length,
            uploads: result
        });
    } catch (error) {
        console.error('List uploads error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Global error handler
app.use(errorHandler);

// ============ Server Startup ============

const server = app.listen(config.port, async () => {
    console.log('='.repeat(50));
    console.log(`🚀 Upload Link Generator v2.0.0`);
    console.log(`📡 Server running on port ${config.port}`);
    console.log(`🌿 Storage branch: ${config.github.storageBranch}`);
    console.log('='.repeat(50));

    if (config.github.token) {
        await githubService.ensureStorageBranch();

        // Run cleanup immediately on startup (important for Render restarts)
        console.log('🧹 Running initial cleanup check...');
        try {
            await cleanupService.runCleanup();
        } catch (error) {
            console.error('Initial cleanup failed:', error.message);
        }

        // Schedule automatic cleanup every 48 hours
        const CLEANUP_INTERVAL = config.cleanup.retentionHours * 60 * 60 * 1000;
        setInterval(async () => {
            console.log('🧹 Running scheduled cleanup...');
            try {
                await cleanupService.runCleanup();
            } catch (error) {
                console.error('Scheduled cleanup failed:', error.message);
            }
        }, CLEANUP_INTERVAL);

        console.log(`⏰ Automatic cleanup scheduled every ${config.cleanup.retentionHours} hours`);
    } else {
        console.warn('⚠️ GitHub token not configured - storage disabled');
    }
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
