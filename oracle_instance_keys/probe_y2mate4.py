"""Probe v4 — listen for new pages (popups) when the quality button is clicked.
Many free MP3 sites open a download URL in a new tab/window."""
import asyncio, json, time, sys
from pathlib import Path
from playwright.async_api import async_playwright

YT_URL = sys.argv[1] if len(sys.argv) > 1 else "https://www.youtube.com/watch?v=o169wQ_4-1w"
QUALITY = sys.argv[2] if len(sys.argv) > 2 else "128"
OUT = Path("/tmp/y2mate_probe4")
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
            accept_downloads=True,
        )

        # Track every new page/popup at context level
        popups = []
        ctx.on("page", lambda pg: popups.append({"url_at_open": pg.url, "t": round(time.time()-t0, 2), "page": pg}))

        page = await ctx.new_page()

        all_requests = []
        page.on("request", lambda req: all_requests.append({
            "method": req.method, "url": req.url[:300], "type": req.resource_type,
            "t": round(time.time()-t0, 2),
        }))

        await page.goto("https://v16.www-y2mate.com/", wait_until="domcontentloaded", timeout=30000)
        await page.fill("input.keyword", YT_URL)
        await page.click("button.convert-btn")
        print(f"[{time.time()-t0:.2f}s] convert clicked")

        # Wait for iframe
        for _ in range(40):
            frame = next((f for f in page.frames if "y2meta" in f.url and "wwwindex" in f.url), None)
            if frame: break
            await asyncio.sleep(0.4)
        if not frame:
            print("no iframe"); await browser.close(); return
        print(f"[{time.time()-t0:.2f}s] iframe URL: {frame.url[:100]}")

        sel = f'button.y2link-download[data-format="mp3"][data-note="{QUALITY}"]'
        await frame.wait_for_selector(sel, timeout=20000)

        # Dump initial state of the button
        before = await frame.evaluate(f"""() => {{
            const b = document.querySelector(`{sel}`);
            return b ? {{ text: b.innerText.trim(), dataAttr: b.getAttribute('data-attr'), classes: b.className }} : null;
        }}""")
        print(f"[{time.time()-t0:.2f}s] button BEFORE: {before}")

        # Click and immediately track new pages + button state
        async with ctx.expect_page(timeout=30000) as popup_ctx:
            await frame.click(sel)
            print(f"[{time.time()-t0:.2f}s] clicked, waiting for popup…")
        try:
            popup = await popup_ctx.value
            print(f"[{time.time()-t0:.2f}s] popup opened: {popup.url[:200]}")
            await popup.wait_for_load_state("domcontentloaded", timeout=20000)
            print(f"[{time.time()-t0:.2f}s] popup DOM ready: {popup.url[:200]}")
            # Look for any download anchor in popup
            await asyncio.sleep(2)
            anchors = await popup.evaluate("""() => Array.from(document.querySelectorAll('a, iframe')).map(el => ({
                tag: el.tagName, href: el.href || el.src || '', text: (el.textContent||'').trim().slice(0,80)
            })).filter(x => x.href.includes('mp3') || x.href.includes('/dl') || x.href.includes('download') || x.href.includes('googlevideo') || x.href.includes('y2meta'))""")
            print(f"   {len(anchors)} download-ish anchors in popup:")
            for a in anchors[:8]: print(f"     {a}")
            await popup.screenshot(path=str(OUT / "popup.png"), full_page=True)
        except Exception as e:
            print(f"[{time.time()-t0:.2f}s] no popup: {e}")

        # Also wait again for data-attr on the original button
        for _ in range(60):
            ds = await frame.evaluate(f"document.querySelector(`{sel}`)?.getAttribute('data-attr')")
            if ds and ds.startswith("http"):
                print(f"[{time.time()-t0:.2f}s] data-attr POPULATED: {ds[:200]}")
                break
            await asyncio.sleep(1)

        await page.screenshot(path=str(OUT / "main.png"), full_page=True)
        (OUT / "all_requests.json").write_text(json.dumps(all_requests[-50:], indent=2))
        (OUT / "frame_after.html").write_text(await frame.content(), encoding="utf-8")

        await browser.close()
        print(f"[{time.time()-t0:.2f}s] done. {len(popups)} popups opened total")


asyncio.run(main())
