-- =============================================
-- PlayLy Database Setup
-- Run this in Supabase SQL Editor (one shot)
-- =============================================

-- Users (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT,
  name           TEXT,
  quality_mp3    TEXT DEFAULT '192',
  quality_video  TEXT DEFAULT '720p',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Global songs table (shared across all users - dedup saves storage)
CREATE TABLE IF NOT EXISTS public.songs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_id       TEXT UNIQUE NOT NULL,
  title            TEXT NOT NULL,
  movie_name       TEXT DEFAULT '',
  thumbnail_url    TEXT DEFAULT '',
  duration_seconds INTEGER DEFAULT 0,
  file_size_bytes  BIGINT DEFAULT 0,
  supabase_url     TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Personal library (per user)
CREATE TABLE IF NOT EXISTS public.user_songs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  song_id     UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  is_favorite BOOLEAN DEFAULT FALSE,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, song_id)
);

-- Playlists
CREATE TABLE IF NOT EXISTS public.playlists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Playlist songs
CREATE TABLE IF NOT EXISTS public.playlist_songs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  song_id     UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  position    INTEGER DEFAULT 0,
  added_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Play history
CREATE TABLE IF NOT EXISTS public.play_history (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  song_id   UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  played_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Row Level Security
-- =============================================
ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_songs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_history  ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "own_profile_select" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own_profile_insert" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own_profile_update" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Songs: all authenticated users can read; service role writes (backend uses service key)
CREATE POLICY "songs_read" ON public.songs FOR SELECT USING (auth.role() = 'authenticated');

-- Library, playlists, history: per user
CREATE POLICY "own_library"  ON public.user_songs     FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_playlist" ON public.playlists      FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_history"  ON public.play_history   FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_pl_songs" ON public.playlist_songs FOR ALL
  USING (playlist_id IN (SELECT id FROM public.playlists WHERE user_id = auth.uid()));

-- =============================================
-- Auto-create user profile on first login
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
