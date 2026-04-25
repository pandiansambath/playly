"""Probe v16.www-y2mate.com → drill into the result iframe (frame.y2meta-uk.com)
to find the actual download links."""
import asyncio, json, time, sys
from pathlib import Path
from playwright.async_api import async_playwright

YT_URL = sys.argv[1] if len(sys.argv) > 1 else "https://www.youtube.com/watch?v=o169wQ_4-1w"
OUT = Path("/tmp/y2mate_probe2")
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
                                                   "download", "y2mate", "y2meta",
                                                   ".mp3", "/dl/", "frame")) else None)

        print(f"[{time.time()-t0:.2f}s] navigating…")
        await page.goto("https://v16.www-y2mate.com/", wait_until="domcontentloaded", timeout=30000)

        await page.fill("input.keyword", YT_URL)
        await page.click("button.convert-btn")
        print(f"[{time.time()-t0:.2f}s] clicked convert; waiting for iframe to settle…")

        # Wait for the iframe (frame.y2meta-uk.com or similar) to appear and finish loading
        await page.wait_for_selector("iframe", timeout=30000)
        # Give the iframe time to render its conversion result
        await page.wait_for_timeout(3000)
        print(f"[{time.time()-t0:.2f}s] {len(page.frames)} frames on page")
        for f in page.frames:
            print(f"   frame: {f.url[:120]}")

        # Look at every frame for mp3 anchors
        result_frame = None
        for f in page.frames:
            if "y2me" in f.url or "frame" in f.url:
                result_frame = f
                break
        if not result_frame and len(page.frames) > 1:
            result_frame = page.frames[1]
        if result_frame:
            print(f"[{time.time()-t0:.2f}s] using frame: {result_frame.url[:100]}")
            try:
                # Wait for any mp3-ish download anchor to appear inside the frame
                await result_frame.wait_for_selector(
                    'a[href*=".mp3"], a[href*="/dl"], a[href*="download"], a[download], button[data-ftype="mp3"], a.btn-download',
                    timeout=60000,
                )
                print(f"[{time.time()-t0:.2f}s] download element appeared in frame!")
            except Exception as e:
                print(f"[{time.time()-t0:.2f}s] frame timeout: {e}")
            # extract everything
            anchors = await result_frame.evaluate("""() => Array.from(document.querySelectorAll('a, button')).map(el => ({
                tag: el.tagName, href: el.href || '', text: (el.textContent||'').trim().slice(0,80),
                download: el.download || '', dataset: Object.fromEntries(Object.entries(el.dataset||{}))
            })).filter(x => (x.href && (x.href.includes('mp3')||x.href.includes('/dl')||x.href.includes('download')))
                            || x.download || (x.text && /mp3|download|320|192|128/i.test(x.text)))""")
            (OUT / "frame_anchors.json").write_text(json.dumps(anchors, indent=2))
            print(f"[{time.time()-t0:.2f}s] {len(anchors)} candidate anchors in frame:")
            for a in anchors[:10]:
                print(f"   {a['tag']} text={a['text']!r:<30} dl={a['download']!r:<10} href={a['href'][:120]}")
            (OUT / "frame.html").write_text(await result_frame.content(), encoding="utf-8")

        await page.screenshot(path=str(OUT / "result.png"), full_page=True)
        (OUT / "api_calls.json").write_text(json.dumps(api_calls, indent=2))
        print(f"[{time.time()-t0:.2f}s] {len(api_calls)} relevant network calls")

        await browser.close()
        print(f"[{time.time()-t0:.2f}s] done")


asyncio.run(main())
