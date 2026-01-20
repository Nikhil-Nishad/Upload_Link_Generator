import fetch from 'node-fetch';

/**
 * Google Drive utility functions for handling file downloads and URL parsing
 */
export const googleDriveUtils = {
    /**
     * Extract file ID from various Google Drive URL formats
     * Supports:
     * - https://drive.google.com/file/d/{fileId}/view
     * - https://drive.google.com/open?id={fileId}
     * - https://drive.google.com/uc?id={fileId}
     * - https://drive.google.com/uc?export=download&id={fileId}
     * - Direct file ID string
     */
    extractFileId: (urlOrId) => {
        if (!urlOrId) return null;

        // If it's already a clean file ID (no slashes, no special chars except hyphen/underscore)
        if (/^[a-zA-Z0-9_-]+$/.test(urlOrId) && urlOrId.length > 20) {
            return urlOrId;
        }

        // Try to extract from /d/{fileId}/ pattern
        const dPattern = /\/d\/([a-zA-Z0-9_-]+)/;
        let match = urlOrId.match(dPattern);
        if (match) return match[1];

        // Try to extract from ?id={fileId} pattern
        const idPattern = /[?&]id=([a-zA-Z0-9_-]+)/;
        match = urlOrId.match(idPattern);
        if (match) return match[1];

        return null;
    },

    /**
     * Build direct download URL from file ID
     */
    buildDownloadUrl: (fileId) => {
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
    },

    /**
     * Download file from Google Drive with large file handling
     * Google Drive shows a confirmation page for large files (>~25MB)
     */
    downloadFile: async (fileId, options = {}) => {
        const { maxSize = 80 * 1024 * 1024 } = options; // 80MB default limit

        const downloadUrl = googleDriveUtils.buildDownloadUrl(fileId);
        console.log(`Downloading from Google Drive: ${fileId}`);

        let response = await fetch(downloadUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Google Drive download failed: HTTP ${response.status}`);
        }

        // Check if this is an HTML page (confirmation page for large files)
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('text/html')) {
            // Try to extract confirmation token from the response
            const html = await response.text();

            // Look for the confirm download link
            const confirmMatch = html.match(/confirm=([a-zA-Z0-9_-]+)/);
            if (confirmMatch) {
                const confirmToken = confirmMatch[1];
                const confirmedUrl = `https://drive.google.com/uc?export=download&confirm=${confirmToken}&id=${fileId}`;

                console.log('Large file detected, using confirmation token...');
                response = await fetch(confirmedUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Google Drive confirmed download failed: HTTP ${response.status}`);
                }
            } else {
                // Try alternative method - use the download anyway form action
                const uuidMatch = html.match(/name="uuid" value="([^"]+)"/);
                if (uuidMatch) {
                    const formUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t&uuid=${uuidMatch[1]}`;
                    console.log('Using form-based confirmation...');
                    response = await fetch(formUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                } else {
                    throw new Error('Unable to bypass Google Drive download confirmation page');
                }
            }
        }

        // Download the actual file content
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length > maxSize) {
            throw new Error(`File size ${(buffer.length / 1024 / 1024).toFixed(2)}MB exceeds maximum ${(maxSize / 1024 / 1024).toFixed(2)}MB`);
        }

        console.log(`Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB from Google Drive`);

        return {
            buffer,
            size: buffer.length,
            fileId
        };
    }
};
