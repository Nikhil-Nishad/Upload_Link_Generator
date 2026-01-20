Below is a **production-grade AI coding agent prompt**, tailored **exactly** to your use case:

* GitHub + jsDelivr as video hosting
* Facebook Reels (2-step Graph API upload)
* Auto-delete after 2 days
* Store links, IDs, status
* Optimized, safe, monetization-friendly
* Built for **automation (n8n / scripts)**

You can paste this **directly** into Cursor / Copilot / any AI coding agent.

---

# 🔥 AI CODING AGENT PROMPT

**(GitHub + jsDelivr Video Hosting System for Facebook Reels Automation)**

---

## 🎯 Goal

Build a **fully automated video hosting & lifecycle system** using **GitHub + jsDelivr** that:

1. Uploads `.mp4` videos to GitHub
2. Generates **direct jsDelivr CDN URLs**
3. Stores all metadata (links, IDs, timestamps, status)
4. Auto-deletes videos **after 48 hours**
5. Is **Facebook Graph API compatible** (Reels monetization safe)
6. Is optimized for **n8n / automation workflows**
7. Is simple, free, and scalable

---

## 🧱 Core Architecture

### 1. GitHub Repository

* Public repository
* No Git LFS
* Branch: `main`
* Folder structure:

```
reels-videos/
 ├── uploads/
 │    ├── 2026-01-20/
 │    │    ├── reel_<uuid>.mp4
 ├── metadata/
 │    ├── uploads.json
 │    ├── fb_reels.json
 └── cleanup/
      └── cleanup.js
```

---

## 🎥 Upload Flow (Step-by-Step)

### Input

* Local `.mp4` file OR Google Drive download URL
* Reel metadata (caption, hashtags, language)

### Process

1. Validate video:

   * `.mp4`
   * H.264 + AAC
   * < 80MB
   * < 60 seconds
2. Generate:

   * `uuid`
   * upload timestamp
   * delete_at timestamp (now + 48h)
3. Upload video to:

   ```
   uploads/YYYY-MM-DD/reel_<uuid>.mp4
   ```
4. Commit using GitHub REST API

---

## 🌍 jsDelivr URL Generation

Generate **direct CDN URL**:

```
https://cdn.jsdelivr.net/gh/{USERNAME}/{REPO}@main/uploads/YYYY-MM-DD/reel_<uuid>.mp4
```

Rules:

* No redirects
* Ends with `.mp4`
* Publicly accessible
* Cache-friendly

---

## 🧾 Metadata Storage (MANDATORY)

Maintain **structured JSON storage**.

### uploads.json

```json
{
  "uuid": "abc123",
  "github_path": "uploads/2026-01-20/reel_abc123.mp4",
  "jsdelivr_url": "https://cdn.jsdelivr.net/gh/...",
  "uploaded_at": "2026-01-20T10:30:00Z",
  "delete_at": "2026-01-22T10:30:00Z",
  "status": "uploaded"
}
```

### fb_reels.json

```json
{
  "uuid": "abc123",
  "page_id": "123456",
  "video_id": "fb_video_id",
  "reel_id": "fb_reel_id",
  "upload_status": "published",
  "published_at": "2026-01-20T11:00:00Z"
}
```

---

## 🗑️ Auto-Delete System (CRITICAL)

### Requirements

* Delete videos **after 48 hours**
* Clean both:

  * Video file
  * Metadata entries
  * Keep file id, and url in fb_reels.json for future reference.


### Implementation

* GitHub Action (cron job every 6 hours)
* OR Node.js cleanup script

### Logic

```pseudo
for each upload in uploads.json:
  if now > delete_at AND fb upload_status == "published":
    delete video file
    mark status = "deleted"
```

---

## 🔁 Facebook Reel Upload Compatibility

System must support:

* Facebook **2-step upload**

  1. Create container
  2. Publish reel

Ensure:

* jsDelivr URL is passed as `video_url`
* URL remains valid **until publish completes**
* Auto-delete runs **after publish**

---

## ⚙️ Optimization & Safety Requirements

### Performance

* CDN cached
* Avoid re-uploading same video (hash check)
* Reuse repo intelligently

### Reliability

* Retry failed GitHub commits
* Retry jsDelivr cache propagation (wait 1–2 min if needed)

### Safety

* Never delete video before Facebook publish success
* Keep metadata immutable after publish

---

## ⭐ Good-to-Have Features (Highly Recommended)

### 1. File Hash Deduplication

* Avoid duplicate uploads

### 2. Upload Status Lifecycle

```
pending → uploaded → fb_uploaded → published → deleted
```

### 3. n8n Friendly API

Expose simple endpoints:

* `/upload`
* `/get-url`
* `/mark-published`
* `/cleanup`

### 4. Rollback Support

* If FB upload fails → keep file for retry

### 5. Logging

* Upload logs
* Delete logs
* FB API error logs

### 6. Filename SEO Safety

```
reel_dog_rescue_abc123.mp4
```

---

## 🚫 Explicit Constraints

* ❌ No Google Drive links
* ❌ No Git LFS
* ❌ No private auth URLs
* ❌ No expiring signed URLs
* ❌ No redirects

---

## ✅ Final Output Expectations

The system should:

* Produce **Facebook-compatible hosted MP4 URLs**
* Auto-clean itself
* Keep a **full audit trail**
* Be safe for **monetization**
* Run **100% free**

---

## 🧠 Mindset for the AI Agent

> Build this like a **temporary CDN for Facebook Reels**, not permanent storage.

---


---

Below is a **clean, no-BS overview** of **GitHub + jsDelivr** setup, focused exactly on **Facebook Reel / Graph API compatibility**.

---

## GitHub + jsDelivr — Setup Overview (FREE, Direct `.mp4`)

![Image](https://docs.github.com/assets/cb-29762/images/help/repository/repo-create-global-nav-update.png)

![Image](https://github.blog/wp-content/uploads/2021/05/GitHub-video-upload-GA_fig-2.png?resize=1024%2C899\&w=1024)

![Image](https://www.jsdelivr.com/open-graph/image/npm/mp4)

---

## 1️⃣ Create a GitHub Repository

* Go to **GitHub → New Repository**
* Name: `reels-videos` (anything is fine)
* Visibility: **Public** (recommended for CDN stability)
* Initialize with README ✅

> Private repos work too, but **public is simpler & safer** for automation.

---

## 2️⃣ Upload Your Video File

* Open the repo
* Upload your file:

  ```
  reel_001.mp4
  ```
* Keep filenames:

  * lowercase
  * no spaces
  * no special characters

✔ Best formats:

```
.mp4 (H.264 + AAC)
```

---

## 3️⃣ Commit to `main` Branch

Make sure:

* File is in `main` branch
* Not inside Git LFS (❌ avoid Git LFS)

> Git LFS URLs **will not work** with jsDelivr

---

## 4️⃣ Generate jsDelivr Direct URL

Use this pattern:

```
https://cdn.jsdelivr.net/gh/USERNAME/REPO@main/reel_001.mp4
```

### Example

```
https://cdn.jsdelivr.net/gh/nikhilnishad/reels-videos@main/reel_001.mp4
```

✔ This is a **true direct MP4 URL**
✔ No redirect
✔ No auth
✔ Facebook compatible

---

## 5️⃣ Validate Before Using Facebook API

Open the jsDelivr URL in:

* Incognito window
* Mobile browser

You should see:

* Video **starts downloading or playing**
* URL **ends with `.mp4`**

If yes → Facebook Graph API will accept it ✅

---

## 6️⃣ Use in Facebook Reel API (Hosted Video)

Use this jsDelivr URL as:

```
video_url
```

Example:

```
video_url=https://cdn.jsdelivr.net/gh/USERNAME/REPO@main/reel_001.mp4
```

---

## ⚠️ Important Rules (Do NOT Skip)

### ❌ Avoid These

* GitHub raw URLs (`raw.githubusercontent.com`)
* Google Drive / Dropbox
* Git LFS
* Spaces in filenames
* Files > 100MB (Facebook fetch may fail)

### ✅ Best Practices

* Keep video size: **< 80MB**
* Resolution: **9:16 (1080x1920)**
* Codec: **H.264 + AAC**
* Duration: **< 60 sec**

---

## 📦 Scaling Strategy (When You Have Many Videos)

```
reels-videos/
 ├── reels/
 │    ├── day1/
 │    │    ├── reel_001.mp4
 │    │    └── reel_002.mp4
 │    └── day2/
 └── metadata/
```

jsDelivr supports nested paths.

---

## 🔒 Is This Monetization Safe?

✅ Yes
Facebook only checks:

* Accessibility
* File format
* Streamability

It **does not care** where the file is hosted.

---

## 🔥 My Recommendation for You

* Start with **GitHub + jsDelivr** now
* Move to **Cloudflare R2** only when:

  * Library grows large
  * Videos go viral
  * You need better analytics

---

