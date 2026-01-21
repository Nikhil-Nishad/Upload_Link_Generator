# 🚀 Video Upload & CDN Link Generator

A production-ready Express.js server that uploads videos to GitHub and generates jsDelivr CDN URLs for Facebook Reels automation. Designed specifically for **n8n workflows** with automatic cleanup after 48 hours.

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [API Endpoints](#-api-endpoints)
- [n8n Integration Guide](#-n8n-integration-guide)
- [Automatic Cleanup Process](#-automatic-cleanup-process)
- [Deployment on Render](#-deployment-on-render)
- [Troubleshooting](#-troubleshooting)
- [Best Practices](#-best-practices)

---

## ✨ Features

- **✅ Video Upload to GitHub** - Uploads `.mp4` videos to a separate storage branch
- **🌐 jsDelivr CDN URLs** - Generates direct, publicly accessible CDN URLs
- **📁 Google Drive Support** - Upload videos directly via Google Drive file ID
- **🔁 Duplicate Detection** - Returns cached URLs for already-uploaded files
- **📊 Metadata Tracking** - Stores upload metadata and Facebook Reel status in JSON files
- **🗑️ Auto-Cleanup** - Automatically deletes videos after 48 hours (only if published)
- **🔄 n8n Ready** - RESTful API designed for seamless n8n workflow integration
- **🎯 Facebook Graph API Compatible** - Direct URLs that work with Facebook's 2-step Reel upload
- **🕷️ Facebook Crawler Support** - Gzip compression + crawler bypass for `facebookexternalhit/1.1`
- **💰 100% Free** - Uses GitHub (free tier) + jsDelivr (free CDN)
- **🔒 Safe for Monetization** - Keeps video links valid until Facebook publish completes

---

## 🏗️ Architecture

### Repository Structure

```
Upload_Link_Generator/
├── src/
│   ├── server.js              # Express server with API endpoints
│   ├── config.js              # Environment config & validation
│   ├── services/
│   │   ├── github.js          # GitHub API operations (upload, delete, get)
│   │   └── metadata.js        # Metadata CRUD with retry logic
│   ├── utils/
│   │   ├── middleware.js      # Rate limiter, logging, FB crawler bypass
│   │   ├── validation.js      # File validation (size, type)
│   │   └── googleDrive.js     # Google Drive download utilities
│   └── cleanup/
│       └── cleanup.js         # Auto-delete expired videos
├── scripts/
│   └── test_production.js     # Comprehensive test suite
├── index.js                   # Render fallback entry point
├── package.json               # Dependencies & scripts
├── render.yaml                # Render deployment config
├── .env.example               # Environment variable template
└── README.md                  # This file
```

### GitHub Storage (media branch)

```
GitHub Repository (Public)
├── main branch (application code)
└── media branch (video storage + metadata)
    ├── uploads/
    │   └── YYYY-MM-DD/
    │       └── reel_<uuid>.mp4
    └── metadata/
        ├── uploads.json       # Video metadata & expiry times
        └── fb_reels.json      # Facebook publish status
```

### How It Works

1. **Upload** - Video is uploaded to GitHub's `media` branch  
2. **Generate URL** - jsDelivr CDN URL is created  
3. **Cache** - Duplicate uploads return cached URLs instantly  
4. **Publish** - Use URL to upload to Facebook Reels  
5. **Mark Published** - Update status after successful Facebook publish  
6. **Auto-Delete** - Videos older than 48 hours (and marked as published) are automatically deleted

---

## 🔧 Prerequisites

- **Node.js** 18+ (or any recent version)
- **GitHub Account** with a public repository
- **GitHub Personal Access Token** with `repo` permissions
- **pnpm** (or npm/yarn)

---

## 📦 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/Upload_Link_Generator.git
cd Upload_Link_Generator
```

### 2. Install Dependencies

```bash
pnpm install
# or
npm install
```

### 3. Configure Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
GITHUB_TOKEN=ghp_your_github_personal_access_token
REPO_OWNER=your_github_username
REPO_NAME=reels-videos
STORAGE_BRANCH=media
```

### 4. Start the Server

```bash
pnpm start
# or
npm start
```

Server will start on `http://localhost:3000`

---

## ⚙️ Configuration

### GitHub Personal Access Token

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Give it a name: `Video Upload API`
4. Select scopes: `repo` (Full control of private repositories)
5. Click **Generate token**
6. Copy the token and add to `.env` file

### Repository Setup

1. Create a new **public** GitHub repository (e.g., `reels-videos`)
2. The server will automatically create the `media` branch on first run
3. Ensure the repository name matches `REPO_NAME` in `.env`

---

## 🔌 API Endpoints

### 1. Upload Video

**Endpoint:** `POST /upload`

Uploads a video to GitHub and generates a jsDelivr CDN URL. Supports three input methods.

#### Option A: File Upload

```bash
curl -X POST http://localhost:3000/upload \
  -F "file=@/path/to/your/video.mp4"
```

#### Option B: Google Drive File ID (Recommended for n8n)

```bash
curl -X POST http://localhost:3000/upload \
  -H "Content-Type: application/json" \
  -d '{"fileId": "1o4k497ewTpvRDpVbWiTKP1zVr0lr6Xdu"}'
```

#### Option C: Direct URL

```bash
curl -X POST http://localhost:3000/upload \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/video.mp4"}'
```

#### Response

```json
{
  "success": true,
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "url": "https://cdn.jsdelivr.net/gh/username/repo@media/uploads/2026-01-20/reel_a1b2c3d4-e5f6-7890-abcd-ef1234567890.mp4",
  "expires_at": "2026-01-22T14:49:51.000Z",
  "size_mb": "5.67",
  "cached": false
}
```

> **Note:** If the same file ID/URL was already uploaded and hasn't expired, the cached URL is returned instantly with `"cached": true`.

---

### 2. Get Video URL

**Endpoint:** `GET /get-url/:uuid`

Retrieves video metadata by UUID.

#### cURL Example

```bash
curl http://localhost:3000/get-url/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

#### Response

```json
{
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "github_path": "uploads/2026-01-20/reel_a1b2c3d4-e5f6-7890-abcd-ef1234567890.mp4",
  "jsdelivr_url": "https://cdn.jsdelivr.net/gh/username/reels-videos@media/uploads/2026-01-20/reel_a1b2c3d4-e5f6-7890-abcd-ef1234567890.mp4",
  "uploaded_at": "2026-01-20T14:49:51.000Z",
  "delete_at": "2026-01-22T14:49:51.000Z",
  "status": "uploaded"
}
```

---

### 3. Check Duplicate (Before Upload)

**Endpoint:** `GET /check/:fileId`

Check if a Google Drive file was already uploaded (useful for n8n to skip duplicates).

#### cURL Example

```bash
curl http://localhost:3000/check/1o4k497ewTpvRDpVbWiTKP1zVr0lr6Xdu
```

#### Response (Exists)

```json
{
  "exists": true,
  "expired": false,
  "uuid": "86211534-3502-4af0-824e-a8e96a6e548b",
  "url": "https://cdn.jsdelivr.net/gh/username/repo@media/uploads/2026-01-21/reel_86211534-3502-4af0-824e-a8e96a6e548b.mp4",
  "expires_at": "2026-01-23T09:51:53.612Z"
}
```

#### Response (Not Found)

```json
{
  "exists": false,
  "message": "File not found in cache"
}
```

---

### 4. Mark as Published

**Endpoint:** `POST /mark-published`

Updates metadata after successfully publishing to Facebook Reels.

#### cURL Example

```bash
curl -X POST http://localhost:3000/mark-published \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "page_id": "123456789",
    "video_id": "fb_video_id_12345",
    "reel_id": "fb_reel_id_67890"
  }'
```

#### Response

```json
{
  "success": true,
  "message": "Marked as published"
}
```

> **Important:** Only videos marked as "published" will be deleted by the auto-cleanup process.

---

### 5. Trigger Cleanup

**Endpoint:** `POST /cleanup`

Manually triggers the cleanup process to delete expired videos.

#### cURL Example

```bash
curl -X POST http://localhost:3000/cleanup
```

#### Response

```json
{
  "success": true,
  "deleted": 3
}
```

> **Note:** Cleanup also runs automatically at server startup and every 48 hours.

---

## 🤖 n8n Integration Guide

Complete workflow for automating Facebook Reels posting from Google Drive.

### Workflow Overview

```
Google Drive (Trigger/Get File) 
  → Upload to CDN 
  → Create Facebook Reel Container 
  → Publish Reel 
  → Mark as Published 
  → Schedule Cleanup
```

### Step-by-Step n8n Workflow

#### 1. Google Drive - Get File

**Node:** Google Drive

- **Operation:** Download File
- **File ID:** `{{ your_google_drive_file_id }}`
- **Options:** Set "Binary Property" to `data`

#### 2. HTTP Request - Upload Video

**Node:** HTTP Request

- **Method:** POST
- **URL:** `http://your-server.com/upload` (or `http://localhost:3000/upload`)
- **Authentication:** None
- **Send Binary Data:** Yes
- **Binary Property:** `data`
- **Options → Response:**
  - Binary Response: Off

**Expression for File:**
```js
{{ $binary.data }}
```

#### 3. Set Variables

**Node:** Set

Extract data from upload response:

- **uuid:** `{{ $json.uuid }}`
- **video_url:** `{{ $json.url }}`
- **expires_at:** `{{ $json.expires_at }}`

#### 4. Wait for CDN Propagation

**Node:** Wait

- **Time:** 2 minutes
- **Reason:** jsDelivr CDN needs time to cache the file

#### 5. HTTP Request - Create Facebook Reel Container

**Node:** HTTP Request

- **Method:** POST
- **URL:** `https://graph.facebook.com/v21.0/{{ $env.FB_PAGE_ID }}/video_reels`
- **Authentication:** Generic Credential Type
  - Add Header: `Authorization: Bearer {{ $env.FB_ACCESS_TOKEN }}`
- **Body Content Type:** Form-Data
- **Body Parameters:**
  - `upload_phase`: `start`
  - `video_url`: `{{ $('Set Variables').item.json.video_url }}`

**Response:**
```json
{
  "video_id": "1234567890",
  "id": "1234567890"
}
```

#### 6. Set Facebook IDs

**Node:** Set

- **video_id:** `{{ $json.video_id }}`

#### 7. HTTP Request - Publish Reel

**Node:** HTTP Request

- **Method:** POST
- **URL:** `https://graph.facebook.com/v21.0/{{ $env.FB_PAGE_ID }}/video_reels`
- **Authentication:** Generic Credential Type
  - Add Header: `Authorization: Bearer {{ $env.FB_ACCESS_TOKEN }}`
- **Body Content Type:** Form-Data
- **Body Parameters:**
  - `upload_phase`: `finish`
  - `video_id`: `{{ $('Set Facebook IDs').item.json.video_id }}`
  - `description`: `Your reel caption here #hashtags`
  - `video_state`: `PUBLISHED`

**Response:**
```json
{
  "id": "reel_id_67890"
}
```

#### 8. HTTP Request - Mark as Published

**Node:** HTTP Request

- **Method:** POST
- **URL:** `http://your-server.com/mark-published`
- **Body Content Type:** JSON
- **Body:**
```json
{
  "uuid": "{{ $('Set Variables').item.json.uuid }}",
  "page_id": "{{ $env.FB_PAGE_ID }}",
  "video_id": "{{ $('Set Facebook IDs').item.json.video_id }}",
  "reel_id": "{{ $json.id }}"
}
```

#### 9. Schedule - Trigger Cleanup (Optional)

**Node:** Schedule Trigger

- **Trigger Interval:** Every Day
- **Execute Workflow:**
  - HTTP Request to `POST /cleanup`

---

## 🗑️ Automatic Cleanup Process

### How Cleanup Works

The server automatically deletes videos that meet **ALL** these criteria:

1. ✅ Video is **older than 48 hours** (based on `delete_at` timestamp)
2. ✅ Video is **marked as published** on Facebook (`upload_status === "published"`)
3. ✅ Video file exists on GitHub

### When Cleanup Runs

The cleanup process runs in these scenarios:

#### 1. **On Server Startup**
Every time the server starts (important for Render's free tier which may restart frequently):

```javascript
// Runs automatically when server starts
cleanupService.runCleanup();
```

#### 2. **Every 48 Hours (Automatic)**
The server checks for expired videos every 48 hours while running:

```javascript
setInterval(() => {
  cleanupService.runCleanup();
}, 48 * 60 * 60 * 1000); // 48 hours
```

#### 3. **Manual Trigger**
You can manually trigger cleanup via API:

```bash
curl -X POST http://your-server.com/cleanup
```

### Cleanup Logic

```javascript
for each video in uploads.json:
  current_time = now()
  delete_time = video.delete_at
  fb_status = fb_reels.json[video.uuid].upload_status
  
  if (current_time > delete_time AND fb_status === "published"):
    - Delete video file from GitHub
    - Remove entry from uploads.json
    - Keep entry in fb_reels.json for reference
    - Log deletion
```

### What Gets Deleted

- ✅ Video file from GitHub (`uploads/YYYY-MM-DD/reel_uuid.mp4`)
- ✅ Entry from `metadata/uploads.json`

### What Gets Kept

- ✅ Entry in `metadata/fb_reels.json` (for audit trail)
- ✅ Facebook video_id, reel_id, page_id (for future reference)

### Render Free Tier Optimization

Since Render's free tier may stop/restart your app frequently, the cleanup system is designed to:

1. **Run on every startup** - Checks for expired videos immediately when app restarts
2. **Store timestamps in GitHub** - All timestamps are in `uploads.json`, not in memory
3. **Survive restarts** - No data loss when server stops/starts
4. **Handle failures gracefully** - Failed deletions are retried on next run

Example scenario:
```
Day 0, 10:00 - Video uploaded, expires at Day 2, 10:00
Day 1, 15:00 - Server restarts (Render free tier), cleanup runs but video not expired yet
Day 2, 14:00 - Server restarts again, cleanup runs, video is expired + published → DELETED
```

---

## 🚀 Deployment on Render

### Prerequisites

1. Push your code to GitHub
2. Sign up for [Render](https://render.com) (free tier)

### Deploy Steps

#### 1. Create New Web Service

- Go to Render Dashboard
- Click **New +** → **Web Service**
- Connect your GitHub repository
- Select `Upload_Link_Generator` repo

#### 2. Configure Build Settings

- **Name:** `video-cdn-uploader`
- **Environment:** `Node`
- **Region:** Choose closest to you
- **Branch:** `main`
- **Build Command:** `pnpm install` (or `npm install`)
- **Start Command:** `pnpm start` (or `npm start`)

#### 3. Add Environment Variables

Click **Advanced** → **Add Environment Variable**:

| Key | Value |
|-----|-------|
| `GITHUB_TOKEN` | `ghp_your_token_here` |
| `REPO_OWNER` | `your_github_username` |
| `REPO_NAME` | `reels-videos` |
| `STORAGE_BRANCH` | `media` |
| `PORT` | `3000` (or leave blank, Render auto-assigns) |

#### 4. Deploy

- Click **Create Web Service**
- Render will build and deploy automatically
- Your service URL: `https://your-app-name.onrender.com`

### Important Notes for Render Free Tier

#### **⚠️ Server Inactivity**

Render's free tier spins down after 15 minutes of inactivity. This means:

- Server may take 30-60 seconds to "wake up" on first request
- No requests = server stops
- Next request = server restarts

#### **✅ Automatic Cleanup Handles This**

Since cleanup runs **on every server startup**, it will:
- Check for expired videos immediately when it wakes up
- Delete any videos that expired while the server was sleeping
- Continue normal operation

#### **💡 Keep Server Alive (Optional)**

Use a service like [UptimeRobot](https://uptimerobot.com) to ping your server every 5 minutes:

```
Ping URL: https://your-app-name.onrender.com/get-url/test
Interval: 5 minutes
```

This keeps your server running 24/7 (though not required for cleanup to work).

---

## 🛠️ Troubleshooting

### Issue: "Video not found" when accessing jsDelivr URL

**Solution:**
- Wait 1-2 minutes after upload for CDN propagation
- Check if file exists on GitHub: `https://github.com/USERNAME/REPO/blob/media/uploads/...`
- Verify URL format: must end with `.mp4`

### Issue: Facebook says "Invalid video URL"

**Checklist:**
- ✅ URL is publicly accessible (test in incognito browser)
- ✅ URL ends with `.mp4`
- ✅ No redirects (jsDelivr URLs are direct)
- ✅ Video codec is H.264 + AAC
- ✅ Video size < 80MB
- ✅ Video duration < 60 seconds

### Issue: Cleanup not deleting old videos

**Debug steps:**
1. Check if video is marked as published:
   ```bash
   curl http://localhost:3000/get-url/YOUR_UUID
   ```
   
2. Manually trigger cleanup:
   ```bash
   curl -X POST http://localhost:3000/cleanup
   ```

3. Check server logs for errors

4. Verify timestamps:
   - Current time must be > `delete_at` timestamp
   - Status must be `"published"` in `fb_reels.json`

### Issue: "GitHub API rate limit exceeded"

**Solution:**
- You're making too many requests (60/hour for public API)
- Use a GitHub Personal Access Token (5000/hour limit)
- Wait for rate limit to reset (check response headers)

### Issue: Render server keeps restarting

**Possible causes:**
- Invalid GitHub token
- Repository doesn't exist
- Missing environment variables

**Solution:**
- Check Render logs: Dashboard → Your Service → Logs
- Verify all environment variables are set correctly
- Test locally first with same `.env` configuration

---

## 📚 Best Practices

### Video Specifications

For best Facebook Reels compatibility:

- **Format:** `.mp4` (H.264 + AAC)
- **Resolution:** 1080×1920 (9:16 aspect ratio)
- **Duration:** 15-60 seconds
- **Size:** < 80MB
- **Frame rate:** 30 fps
- **Bitrate:** 5-10 Mbps

### Workflow Optimization

1. **Always wait 1-2 minutes** after upload before using URL in Facebook API
2. **Mark as published immediately** after Facebook confirms upload
3. **Schedule cleanup** to run daily (not required, but keeps things tidy)
4. **Monitor GitHub repo size** - Each video counts toward GitHub's limits

### Security

- ✅ Never commit `.env` file to Git
- ✅ Use GitHub Personal Access Token (classic) with `repo` scope only
- ✅ Keep your Facebook Access Token in n8n credentials, not hardcoded
- ✅ Use Render's environment variables, not `.env` in production

### Scaling

When you outgrow GitHub + jsDelivr:

- **Option 1:** Cloudflare R2 (10GB free, then $0.015/GB)
- **Option 2:** Backblaze B2 + Cloudflare CDN (10GB free, then $0.005/GB)
- **Option 3:** AWS S3 + CloudFront (12 months free, then paid)

---

## 📝 License

ISC

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request.

---

## 💬 Support

- **Issues:** [GitHub Issues](https://github.com/YOUR_USERNAME/Upload_Link_Generator/issues)
- **Discussions:** [GitHub Discussions](https://github.com/YOUR_USERNAME/Upload_Link_Generator/discussions)

---

## 📖 Additional Resources

- [jsDelivr Documentation](https://www.jsdelivr.com/documentation)
- [GitHub REST API](https://docs.github.com/en/rest)
- [Facebook Graph API - Video Reels](https://developers.facebook.com/docs/video-api/guides/reels-publishing)
- [n8n Documentation](https://docs.n8n.io/)
- [Render Documentation](https://render.com/docs)

---

**Built with ❤️ for automated video workflows**
