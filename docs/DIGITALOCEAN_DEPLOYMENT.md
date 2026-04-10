# DigitalOcean App Platform Deployment

## Overview

This document details deploying DisasterPulse backend to **DigitalOcean App Platform**.

**Cost:** ~$5-12/month (or free with your $200 credit for ~20-28 months)

---

## Prerequisites

1. DigitalOcean account (https://www.digitalocean.com)
2. GitHub repository with code pushed to `main` branch
3. `.do/app.yaml` file in repo root (already created for you ✓)

---

## Step-by-Step Deployment

### 1. Create App in DigitalOcean

1. Go to https://cloud.digitalocean.com/apps
2. Click **+ Create App**
3. Select **GitHub** as source

### 2. Authorize GitHub

- Click **Authorize DigitalOcean**
- Allow access to your account
- Select your DisasterPulse repository

### 3. Configure Repository

| Setting | Value |
|---------|-------|
| Repository | `SyedFaisaLAbrar/DisasterPulse-...` |
| Branch | `main` |
| Auto-deploy | ✓ Enabled |

Click **Next**.

### 4. DigitalOcean Detects Configuration

DigitalOcean will read `.do/app.yaml` and auto-configure:

```yaml
- Service: backend
- Build: pip install -r requirements.txt
- Run: cd app && uvicorn main:app --host 0.0.0.0 --port 8080
- Port: 8080
```

If not detected, manually config:

**Build Command:**
```bash
pip install -r requirements.txt
```

**Run Command:**
```bash
cd app && uvicorn main:app --host 0.0.0.0 --port 8080
```

Click **Next**.

### 5. Environment Variables

Add (if not auto-populated):

| Key | Value |
|-----|-------|
| `PYTHONUNBUFFERED` | `1` |

Click **Next**.

### 6. Review & Deploy

1. Review settings
2. Click **Create Resources**
3. Wait 3-5 minutes

DigitalOcean will:
- Clone your repo
- Build: Run `pip install -r requirements.txt`
- Run: Start uvicorn server
- Assign public URL (e.g., `https://disasterpulse-backend-xxx.ondigitalocean.app`)

---

## After Deployment

### Get Backend URL

1. Go to https://cloud.digitalocean.com/apps
2. Click your app
3. In **Components** section, find **backend** service
4. Copy the public URL (e.g., `https://disasterpulse-backend-xxx.ondigitalocean.app`)

### Update Frontend (Vercel)

1. Go to https://vercel.com → DisasterPulse project
2. **Settings** → **Environment Variables**
3. Edit or create: `NEXT_PUBLIC_API_URL`
4. Set value to: `https://disasterpulse-backend-xxx.ondigitalocean.app`
5. Save
6. Redeploy (or wait for auto-rebuild on next push)

### Test Backend Health

```bash
curl https://disasterpulse-backend-xxx.ondigitalocean.app/health
```

Should return:
```json
{"status": "ok"}
```

---

## DNS & Custom Domain (Optional)

To use custom domain like `api.disasterpulse.com`:

1. In DigitalOcean App Platform → Your App
2. **Settings** → **Domains**
3. Add your domain
4. Update DNS records at your registrar to point to DigitalOcean

---

## Storage & Data Persistence

### Vector Database (ChromaDB)

**Issue:** App containers are ephemeral—files deleted on restart.

### Solution A: Use Persistent Volume (Recommended)

1. Go to App → **Components** → **backend**
2. Scroll to **Volumes**
3. Click **+ Add Volume**
4. Mount path: `/opt/render/project/src/app/data`
5. Size: 10 GB (adjust as needed)
6. Save

Your ChromaDB will survive app restarts.

### Solution B: AWS S3 Backup

1. Set up AWS S3 bucket
2. Add to [app/main.py](../app/main.py):

```python
import boto3
import shutil

s3 = boto3.client('s3')

async def backup_chroma_db():
    """Backup ChromaDB to S3 periodically"""
    shutil.make_archive('chroma_backup', 'zip', './data/chroma_db')
    s3.upload_file('chroma_backup.zip', 'your-bucket', 'chroma_backup.zip')
```

3. Call `backup_chroma_db()` in startup or after indexing

---

## Monitoring

### View Logs

1. Go to App → **Logs** tab
2. Filter by:
   - **Service:** backend
   - **Type:** Deploy, Runtime
3. Real-time logs update automatically

### Health Checks

Backend endpoint `/health` is checked every 10 seconds:
- If healthy (200 response) → `✓`
- If fails 3 times → App restarts automatically

### Metrics

1. Go to App → **Metrics** tab
2. View:
   - CPU usage
   - Memory usage
   - Request rate
   - Error rate

---

## Auto-Deployment

**Enabled by default.** When you push to `main`:

1. GitHub webhook triggers DigitalOcean
2. DigitalOcean pulls latest code
3. Runs build command
4. Restarts service with new code
5. Old instance terminated gracefully

**No manual redeploy needed!**

---

## Troubleshooting

### Build Fails: "Out of Memory"

Increase instance size:
1. Go to App → **Settings**
2. Find **backend** service
3. Edit **Instance Size** → Select larger tier
4. Save and redeploy

Or optimize `requirements.txt` (remove unused packages).

### Backend URL returns 502

1. Check **Logs** for errors
2. Verify `/health` endpoint
3. Check **Metrics** for crashes
4. Restart service in **Settings** → **Restart Instance**

### ChromaDB not found

1. Verify `app/data/chroma_db/` exists in repository
2. Or add persistent volume (see Storage section)
3. Commit and push to trigger rebuild

### Frontend can't reach backend

1. Verify `NEXT_PUBLIC_API_URL` in Vercel env vars
2. Test backend URL directly: `curl https://your-backend-url/health`
3. Check backend CORS settings in [app/main.py](../app/main.py)
4. Redeploy frontend after updating env

---

## Costs & Credits

| Item | Cost |
|------|------|
| App Platform (basic-xs) | ~$5-12/month |
| Persistent Volume (10GB) | ~$1-2/month |
| Your $200 credit | Covers ~20-28 months |

No charges during free tier usage!

---

## Next Steps

1. ✅ Deploy backend to DigitalOcean (this doc)
2. ✅ Update frontend API URL on Vercel
3. 📋 Set up persistent storage for ChromaDB
4. 📋 Configure custom domain (optional)
5. 📋 Monitor logs and metrics

---

## References

- [DigitalOcean App Platform Docs](https://docs.digitalocean.com/products/app-platform/)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)
- Local development: See [app/README.md](../app/README.md)
