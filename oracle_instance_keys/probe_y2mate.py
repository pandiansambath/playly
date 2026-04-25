"""Probe v16.www-y2mate.com to understand the conversion flow.
Fills the search box with a YT URL, clicks convert, and watches the DOM to
discover what selectors/waits the real /fetch/y2mate endpoint will need.
Saves screenshots + a flow report for debugging."""
import asyncio
import json
import time
import sys
from pathlib import Path
from playwright.async_api import async_playwright

YT_URL = sys.argv[1] if len(sys.argv) > 1 else "https://www.youtube.com/watch?v=o169wQ_4-1w"
OUT = Path("/tmp/y2mate_probe")
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
            viewport={"width": 1280, "height": 800},
        )
        page = await ctx.new_page()

        # Track network requests so we can spot the real conversion API
        api_calls = []
        page.on("request", lambda req: api_calls.append({
            "method": req.method, "url": req.url[:300],
            "type": req.resource_type, "t": round(time.time() - t0, 2),
        }) if any(k in req.url.lower() for k in ("convert", "ajax", "api", "analyze", "download", "y2mate", "yt")) else None)

        print(f"[{time.time()-t0:.2f}s] navigating…")
        await page.goto("https://v16.www-y2mate.com/", wait_until="domcontentloaded", timeout=30000)
        print(f"[{time.time()-t0:.2f}s] loaded")
        await page.screenshot(path=str(OUT / "01_loaded.png"))

        # Find the input box
        input_selectors = [
            "input.keyword", "input[name='keyword']", "input.input-control",
            "input.y2mate_query", "input[placeholder*='youtube' i]", "input[type='search']",
            "input[type='text']",
        ]
        input_el = None
        for sel in input_selectors:
            try:
                input_el = await page.wait_for_selector(sel, state="visible", timeout=2000)
                if input_el:
                    print(f"[{time.time()-t0:.2f}s] found input via {sel!r}")
                    break
            except Exception:
                pass
        if not input_el:
            print("NO INPUT FOUND — dumping HTML")
            html = await page.content()
            (OUT / "page.html").write_text(html, encoding="utf-8")
            await browser.close()
            return

        await input_el.fill(YT_URL)
        await page.screenshot(path=str(OUT / "02_filled.png"))

        # Find convert button
        button_selectors = [
            "button.start-btn", "button.convert-btn", ".start-btn", ".convert-btn",
            "button[type='submit']", "form button",
        ]
        btn = None
        for sel in button_selectors:
            try:
                btn = await page.wait_for_selector(sel, state="visible", timeout=2000)
                if btn:
                    print(f"[{time.time()-t0:.2f}s] found button via {sel!r}")
                    break
            except Exception:
                pass
        if not btn:
            print("NO BUTTON FOUND")
            await page.keyboard.press("Enter")  # try Enter as a fallback
        else:
            await btn.click()

        print(f"[{time.time()-t0:.2f}s] clicked, waiting for result…")

        # The conversion takes server-side time. Watch for new content / download links.
        # Wait up to 60s for any anchor with .mp3 OR a download button.
        try:
            await page.wait_for_selector(
                'a[href*=".mp3"], a[download], a.download-btn, .download-btn a, a:has-text("Download")',
                state="visible",
                timeout=60000,
            )
            print(f"[{time.time()-t0:.2f}s] result element appeared!")
        except Exception as e:
            print(f"[{time.time()-t0:.2f}s] timed out waiting for result: {e}")

        await page.screenshot(path=str(OUT / "03_result.png"), full_page=True)

        # Pull all anchors for inspection
        anchors = await page.evaluate("""() => Array.from(document.querySelectorAll('a')).map(a => ({
            href: a.href, text: (a.textContent||'').trim().slice(0,60), download: a.download
        })).filter(a => a.href && (a.href.includes('mp3') || a.download || a.text.toLowerCase().includes('download')))""")
        (OUT / "anchors.json").write_text(json.dumps(anchors, indent=2))
        print(f"[{time.time()-t0:.2f}s] {len(anchors)} candidate anchors")
        for a in anchors[:8]:
            print(f"   {a['text']!r:<30} {a['href'][:120]}")

        (OUT / "api_calls.json").write_text(json.dumps(api_calls, indent=2))
        print(f"[{time.time()-t0:.2f}s] {len(api_calls)} relevant network calls captured")

        # Save final HTML
        (OUT / "final.html").write_text(await page.content(), encoding="utf-8")

        await browser.close()
        print(f"[{time.time()-t0:.2f}s] done")


asyncio.run(main())
