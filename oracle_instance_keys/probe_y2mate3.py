"""Probe v3: click an MP3 quality button inside the iframe, wait for data-attr
to populate with the download URL, then time how long the whole flow takes."""
import asyncio, json, time, sys
from pathlib import Path
from playwright.async_api import async_playwright

YT_URL = sys.argv[1] if len(sys.argv) > 1 else "https://www.youtube.com/watch?v=o169wQ_4-1w"
QUALITY = sys.argv[2] if len(sys.argv) > 2 else "128"
OUT = Path("/tmp/y2mate_probe3")
OUT.mkdir(exist_ok=True)


async def main():
    t0 = time.time()
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        )
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )
        page = await ctx.new_page()

        api_calls = []
        page.on("request", lambda req: api_calls.append({
            "method": req.method, "url": req.url[:300], "type": req.resource_type,
            "t": round(time.time() - t0, 2),
        }) if any(k in req.url.lower() for k in ("convert", "ajax", "api", "analyze",
                                                   "download", "y2meta", ".mp3", "/dl/", "frame")) else None)

        await page.goto("https://v16.www-y2mate.com/", wait_until="domcontentloaded", timeout=30000)
        await page.fill("input.keyword", YT_URL)
        await page.click("button.convert-btn")
        print(f"[{time.time()-t0:.2f}s] clicked convert")

        # Find the y2meta iframe
        for _ in range(30):
            frame = next((f for f in page.frames if "y2meta" in f.url and "wwwindex" in f.url), None)
            if frame:
                break
            await asyncio.sleep(0.5)
        if not frame:
            print("no iframe"); await browser.close(); return
        print(f"[{time.time()-t0:.2f}s] iframe ready: {frame.url[:100]}")

        # Wait for the quality button to be present
        sel = f'button.y2link-download[data-format="mp3"][data-note="{QUALITY}"]'
        await frame.wait_for_selector(sel, timeout=20000)
        print(f"[{time.time()-t0:.2f}s] {QUALITY}kbps button visible — clicking…")
        await frame.click(sel)

        # Now wait until data-attr (the download URL) is populated, OR a new
        # download link element appears.
        deadline = time.time() + 60
        download_url = None
        while time.time() < deadline:
            # Check the clicked button's data-attr
            data_attr = await frame.evaluate(
                f"document.querySelector(`{sel}`)?.getAttribute('data-attr')"
            )
            if data_attr and len(data_attr) > 8 and data_attr.startswith("http"):
                download_url = data_attr
                break
            # Also poke any visible download link
            link = await frame.evaluate("""() => {
                const a = document.querySelector('a.btn-download-link, a.link-download, a[href*=".mp3"], a[download][href^="http"]');
                return a ? a.href : null;
            }""")
            if link and link.startswith("http") and ("mp3" in link or "/dl" in link or "download" in link.lower()):
                download_url = link
                break
            await asyncio.sleep(0.5)

        elapsed = time.time() - t0
        if download_url:
            print(f"[{elapsed:.2f}s] ✅ download URL: {download_url[:200]}")
        else:
            print(f"[{elapsed:.2f}s] ❌ timed out waiting for download URL")
            # dump frame state for debugging
            (OUT / "frame_state.html").write_text(await frame.content(), encoding="utf-8")

        await page.screenshot(path=str(OUT / "result.png"), full_page=True)
        (OUT / "api_calls.json").write_text(json.dumps(api_calls, indent=2))

        # If we got a URL, fetch it and time the actual file download
        if download_url:
            import httpx
            t_d = time.time()
            async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
                resp = await client.get(download_url)
            d_elapsed = time.time() - t_d
            print(f"[{time.time()-t0:.2f}s] downloaded {len(resp.content):,} bytes in {d_elapsed:.2f}s, status={resp.status_code}")
            print(f"   content-type: {resp.headers.get('content-type')}")
            print(f"   final url: {resp.url}")
            out_mp3 = OUT / "out.mp3"
            out_mp3.write_bytes(resp.content)
            # ffprobe
            import subprocess
            probe = subprocess.run(["ffprobe", "-v", "error",
                "-show_entries", "format=duration,bit_rate",
                "-of", "default=noprint_wrappers=1", str(out_mp3)],
                capture_output=True, text=True)
            print("ffprobe:", probe.stdout.strip())
            print(f"\n>>> TOTAL END-TO-END: {time.time()-t0:.2f}s <<<")

        await browser.close()


asyncio.run(main())
