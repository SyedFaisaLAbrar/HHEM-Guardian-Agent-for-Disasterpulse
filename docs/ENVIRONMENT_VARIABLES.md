# Environment Variables Configuration

## Overview

This document lists all environment variables needed for DisasterPulse across development and production environments.

---

## Development

### Backend (app/.env)

```bash
# Optional - for local development only
# Most defaults work fine
PYTHONUNBUFFERED=1
```

No other env vars required for local dev. The app uses relative paths and defaults.

### Frontend (frontend/.env.local)

```bash
# Local backend during development
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Important:** This file should NOT be committed to git. It's for local dev only.

---

## Production

### Backend on DigitalOcean

Set in **App Platform UI** → Your App → **Settings** → **Envs**:

| Variable | Value | Purpose |
|----------|-------|---------|
| `PYTHONUNBUFFERED` | `1` | Show Python logs in real-time |
| `PORT` | `8080` | Server port (matching run command) |

**Optional:**
```bash
# If you use Azure/AWS services
AZURE_API_KEY=xxx
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

### Frontend on Vercel

Set in **Settings** → **Environment Variables**:

| Variable | Value | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_API_URL` | `https://disasterpulse-backend-xxx.ondigitalocean.app` | Backend API URL (must be public!) |

**Important:** Prefix `NEXT_PUBLIC_` means it's exposed to browser. Only use for URLs, not secrets.

---

## Backend CORS Configuration

Update [app/main.py](../app/main.py) to trust your Vercel frontend:

```python
CORS_ORIGINS = [
    "http://localhost:3000",        # Local dev
    "http://localhost:8000",        # Local dev
    "https://disasterpulse.vercel.app",  # Production Vercel
    "https://*.vercel.app",         # Allow Vercel preview URLs
]
```

Commit and redeploy to DigitalOcean.

---

## Environment Variable Checklist

### Before Deploying Backend to DigitalOcean
- [ ] `.do/app.yaml` exists in repo root
- [ ] `app/requirements.txt` has no uncommitted changes
- [ ] Code is pushed to `main` branch

### Before Deploying Frontend to Vercel
- [ ] `frontend/package.json` exists
- [ ] `NEXT_PUBLIC_API_URL` set to backend URL
- [ ] Code is pushed to `main` branch

### Before Going Live
- [ ] Test backend: `curl https://your-backend-url/health`
- [ ] Test frontend: Visit https://disasterpulse.vercel.app
- [ ] Test search endpoint: Frontend search bar works

---

## Common Issues

### Frontend shows "API error: 503"

**Cause:** Backend not reachable or wrong URL

**Fix:**
1. Verify `NEXT_PUBLIC_API_URL` in Vercel
2. Check backend URL is correct
3. Test: `curl https://backend-url/health`
4. Redeploy frontend

### Frontend shows "CORS error"

**Cause:** Backend doesn't trust Vercel domain

**Fix:**
1. Update CORS origins in [app/main.py](../app/main.py)
2. Add your Vercel domain
3. Commit and push
4. DigitalOcean auto-redeploys
5. Wait 1-2 mins and retry

### Build fails: "Module not found"

**Cause:** Missing env vars for build step

**Fix:**
- For backend: Check `requirements.txt` has all packages
- For frontend: Check `package.json` has all dependencies

---

## Reference: Full Env Var List

### Backend Available (optional)

These can be set but have defaults:

```bash
# Paths (have defaults)
GDELT_CSV
CRISIS_MMD_DIR  
CHROMA_DIR

# Model names (have defaults)
EMBED_MODEL=all-MiniLM-L6-v2
VLM_MODEL=claude-3-5-sonnet

# API keys (if using external APIs)
GROQ_API_KEY
ANTHROPIC_API_KEY
```

### Frontend Available (optional)

Only variables starting with `NEXT_PUBLIC_` are exposed:

```bash
# API endpoint (required for production)
NEXT_PUBLIC_API_URL

# Optional analytics
NEXT_PUBLIC_ANALYTICS_ID
```

---

## Secrets Management Best Practice

**Never commit actual secrets to git!**

For sensitive data (API keys, credentials):

1. **Development:** Use `.env.local` (git-ignored)
2. **DigitalOcean:** Set in App Platform UI (encrypted)
3. **Vercel:** Set in Project Settings (encrypted)
4. **Never:** Commit to git or push to GitHub

---

## Deploy after Env Changes

1. **Update env var** in DigitalOcean UI or Vercel UI
2. **Trigger redeploy** (or auto-redeploy on git push)
3. **Wait 1-2 minutes** for changes to take effect
4. **Test** to verify

---

## Questions?

- Backend CORS issues? See `CORS_ORIGINS` in [app/main.py](../app/main.py)
- Vercel settings? Go to https://vercel.com → Project → Settings
- DigitalOcean settings? Go to https://cloud.digitalocean.com/apps → Your App → Settings
