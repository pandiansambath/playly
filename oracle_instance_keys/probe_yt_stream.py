"""Use Playwright to actually PLAY the YouTube video — the browser does all the
cipher/n-param decoding for us, and we just capture the googlevideo.com audio
stream URL it requests, then download the bytes ourselves."""
import asyncio, json, time, sys, subprocess
from pathlib import Path
from playwright.async_api import async_playwright

YT_ID = sys.argv[1] if len(sys.argv) > 1 else "o169wQ_4-1w"
OUT = Path("/tmp/yt_stream")
OUT.mkdir(exist_ok=True)


async def main():
    t0 = time.time()
    audio_urls = []          # googlevideo audio stream URLs (sorted by capture order)
    video_urls = []
    player_response = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required",
                  "--mute-audio"],
        )
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
        )
        page = await ctx.new_page()

        def on_request(req):
            url = req.url
            if "googlevideo.com/videoplayback" in url:
                # mime= is typically ?mime=audio%2Fmp4 or ?mime=video%2Fmp4
                if "mime=audio" in url or "&itag=140" in url or "&itag=251" in url:
                    audio_urls.append(url)
                elif "mime=video" in url:
                    video_urls.append(url)
        page.on("request", on_request)

        print(f"[{time.time()-t0:.2f}s] navigating to watch page…")
        await page.goto(f"https://www.youtube.com/watch?v={YT_ID}",
                        wait_until="domcontentloaded", timeout=30000)

        # Try to dismiss any consent modal
        try:
            await page.click('button[aria-label*="Accept" i]', timeout=2500)
        except Exception:
            pass

        print(f"[{time.time()-t0:.2f}s] dom ready — waiting for player…")

        # Wait for the player to be ready
        try:
            await page.wait_for_selector("video", timeout=15000)
        except Exception:
            print("no <video> element"); await browser.close(); return

        # Force the video to start (autoplay sometimes blocked)
        await page.evaluate("""() => {
            const v = document.querySelector('video');
            if (v) { v.muted = true; v.play().catch(() => {}); }
            const p = document.getElementById('movie_player');
            if (p && p.playVideo) p.playVideo();
        }""")

        # Wait until at least one audio googlevideo URL has been captured
        deadline = time.time() + 25
        while time.time() < deadline and not audio_urls:
            await asyncio.sleep(0.4)

        # Also dump the player_response JSON for diagnostics / fallback
        player_response = await page.evaluate("""() => {
            try {
                return ytInitialPlayerResponse || (window.ytplayer && ytplayer.config && ytplayer.config.args && JSON.parse(ytplayer.config.args.player_response));
            } catch(e) { return null; }
        }""") or {}

        elapsed_to_url = time.time() - t0
        print(f"[{elapsed_to_url:.2f}s] {len(audio_urls)} audio stream URLs captured, {len(video_urls)} video")
        if not audio_urls:
            # Save evidence for debugging
            (OUT / "player_response.json").write_text(
                json.dumps(player_response, indent=2)[:80000])
            print("no audio URL captured — bailing")
            await browser.close(); return

        # Pick the first captured audio URL
        url = audio_urls[0]
        print(f"   audio url: {url[:200]}…")
        print(f"   captured {len(audio_urls)} audio URLs total")

        # Get cookies + UA so we can replay the request
        ck = await ctx.cookies()
        cookies_hdr = "; ".join(f"{c['name']}={c['value']}" for c in ck if c["domain"].endswith(".google.com") or c["domain"].endswith(".youtube.com"))
        ua = await page.evaluate("() => navigator.userAgent")

        await browser.close()

    # 2. Download the audio stream from outside Playwright (faster, bigger buffer)
    import httpx
    print(f"\n[{time.time()-t0:.2f}s] starting download via httpx…")
    t_dl = time.time()
    headers = {
        "User-Agent": ua,
        "Cookie": cookies_hdr,
        "Range": "bytes=0-",
        "Referer": f"https://www.youtube.com/watch?v={YT_ID}",
    }
    raw = OUT / f"{YT_ID}.audio"
    async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
        async with client.stream("GET", url, headers=headers) as resp:
            print(f"   stream status={resp.status_code}")
            if resp.status_code not in (200, 206):
                print(f"   non-200, headers: {dict(resp.headers)}")
            with open(raw, "wb") as f:
                async for chunk in resp.aiter_bytes(64*1024):
                    f.write(chunk)
    dl_time = time.time() - t_dl
    print(f"[{time.time()-t0:.2f}s] downloaded {raw.stat().st_size:,} bytes in {dl_time:.2f}s")

    # 3. Convert to MP3
    mp3 = OUT / f"{YT_ID}.mp3"
    t_ff = time.time()
    cp = subprocess.run(["ffmpeg", "-y", "-i", str(raw), "-vn", "-b:a", "192k", str(mp3)],
                        capture_output=True, text=True, timeout=120)
    ff_time = time.time() - t_ff
    if cp.returncode != 0:
        print(f"ffmpeg failed: {cp.stderr[-600:]}")
        return
    print(f"[{time.time()-t0:.2f}s] ffmpeg → {mp3.name} {mp3.stat().st_size:,} bytes ({ff_time:.2f}s)")

    probe = subprocess.run(["ffprobe", "-v", "error",
        "-show_entries", "format=duration,bit_rate",
        "-of", "default=noprint_wrappers=1", str(mp3)],
        capture_output=True, text=True)
    print("ffprobe:", probe.stdout.strip())
    print(f"\n>>> TOTAL END-TO-END: {time.time()-t0:.2f}s <<<")
    print(f"   browser+capture: {elapsed_to_url:.2f}s")
    print(f"   media download : {dl_time:.2f}s")
    print(f"   ffmpeg convert : {ff_time:.2f}s")


asyncio.run(main())
