"""Capture EXACT request/response for cnv.cx API to enable direct calls
without needing the browser at all."""
import asyncio, json, time, sys
from pathlib import Path
from playwright.async_api import async_playwright

YT_URL = sys.argv[1] if len(sys.argv) > 1 else "https://www.youtube.com/watch?v=o169wQ_4-1w"
QUALITY = sys.argv[2] if len(sys.argv) > 2 else "128"
OUT = Path("/tmp/cnv_probe")
OUT.mkdir(exist_ok=True)


async def main():
    t0 = time.time()
    captured = {"sanity_key": {}, "converter": {}, "polls": []}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )

        # Block popups/ads to keep the page focused on conversion
        await ctx.route("**/*", lambda route: route.abort()
                        if any(d in route.request.url for d in ["1x1x5.com", "googletagmanager", "google-analytics", "doubleclick", "googlesyndication"])
                        else route.continue_())

        page = await ctx.new_page()

        # Intercept cnv.cx requests + responses
        async def on_request(req):
            if "cnv.cx" not in req.url:
                return
            try:
                body = req.post_data
            except Exception:
                body = None
            print(f"[{time.time()-t0:.2f}s] → {req.method} {req.url}")
            print(f"   body: {body}")
            print(f"   headers: { {k:v for k,v in req.headers.items() if k.lower() in ('content-type','x-key','authorization','origin','referer')} }")
        page.on("request", lambda req: asyncio.create_task(on_request(req)))

        async def on_response(resp):
            if "cnv.cx" not in resp.url:
                return
            try:
                txt = await resp.text()
            except Exception:
                txt = "<binary>"
            print(f"[{time.time()-t0:.2f}s] ← {resp.status} {resp.url}")
            print(f"   body: {txt[:500]}")
            if "/sanity/key" in resp.url:
                captured["sanity_key"] = {"url": resp.url, "status": resp.status, "body": txt}
            elif "/converter" in resp.url:
                captured["converter"] = {"url": resp.url, "status": resp.status, "body": txt}
            else:
                captured["polls"].append({"url": resp.url, "status": resp.status, "body": txt[:1000]})
        page.on("response", on_response)

        await page.goto("https://v16.www-y2mate.com/", wait_until="domcontentloaded", timeout=30000)
        await page.fill("input.keyword", YT_URL)
        await page.click("button.convert-btn")

        # wait for iframe + button
        for _ in range(40):
            frame = next((f for f in page.frames if "y2meta" in f.url and "wwwindex" in f.url), None)
            if frame: break
            await asyncio.sleep(0.4)
        sel = f'button.y2link-download[data-format="mp3"][data-note="{QUALITY}"]'
        await frame.wait_for_selector(sel, timeout=20000)
        await frame.click(sel)
        print(f"[{time.time()-t0:.2f}s] clicked {QUALITY}kbps button")

        # Wait up to 90s for data-attr to be populated
        for _ in range(180):
            ds = await frame.evaluate(f"document.querySelector(`{sel}`)?.getAttribute('data-attr')")
            if ds and ds.startswith("http"):
                print(f"[{time.time()-t0:.2f}s] ✅ data-attr POPULATED: {ds[:200]}")
                captured["final_url"] = ds
                break
            await asyncio.sleep(0.5)

        await browser.close()

    (OUT / "captured.json").write_text(json.dumps(captured, indent=2)[:50000])
    print(f"\nfull capture saved to {OUT / 'captured.json'}")


asyncio.run(main())
