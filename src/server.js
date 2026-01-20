import express from 'express';
import cors from 'cors';
import multer from 'multer';
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

// Routes
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        const validation = validateFile(file);

        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const uuid = uuidv4();
        const timestamp = new Date().toISOString();
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `reel_${uuid}.mp4`;
        const githubPath = `uploads/${dateStr}/${filename}`;

        // Upload to GitHub (Uses storageBranch from githubService)
        await githubService.uploadFile(githubPath, file.buffer, `Upload video ${uuid}`);

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
            status: 'uploaded'
        };

        // Update metadata
        await metadataService.addUpload(metadata);

        res.json({
            success: true,
            uuid,
            url: jsdelivrUrl,
            expires_at: deleteAt.toISOString()
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
    }
});
