# 🎵 PlayLy

YouTube-powered music streaming. Free. No ads. Background play.

## Stack
- **Frontend**: Next.js 14 + Tailwind CSS + TypeScript
- **Backend**: Python FastAPI + yt-dlp
- **DB/Auth/Storage**: Supabase
- **Infra**: GCP + Kubernetes + ArgoCD

## Setup

### Step 1: Supabase
Run `supabase_setup.sql` in your Supabase SQL Editor.

### Step 2: Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your keys
uvicorn main:app --reload --port 8000
```

### Step 3: Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local with your keys
npm run dev
```

Open http://localhost:3000
