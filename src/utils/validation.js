export function validateFile(file) {
    const MAX_SIZE = 80 * 1024 * 1024; // 80MB
    const ALLOWED_MIME_TYPES = ['video/mp4'];

    if (!file) {
        return { valid: false, error: 'No file uploaded' };
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return { valid: false, error: 'Invalid file type. Only .mp4 is allowed' };
    }

    if (file.size > MAX_SIZE) {
        return { valid: false, error: 'File size exceeds 80MB limit' };
    }

    return { valid: true };
}
