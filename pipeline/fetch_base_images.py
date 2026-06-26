#!/usr/bin/env python3
"""
Base-icon downloader  (run this where craftofexile.com is reachable)
====================================================================
build_item_bases.py records each specific base's CoE image path (e.g.
"Weapons/TwoHandWeapons/Staves/FourQuarterstaff1.webp"). This script downloads
those icons into app/assets/bases/<path> so the planner can show them offline.
It is intentionally a SEPARATE step: the data build needs no network, and in
some sandboxes craftofexile.com is blocked by egress policy -- run this from a
machine that can reach it.

The exact CoE image URL prefix isn't published, so by default this PROBES a list
of likely prefixes against the first image and uses whichever returns a real
image. Override with --base-url if you know it.

Usage:
  python fetch_base_images.py                 # probe prefix, download all missing
  python fetch_base_images.py --base-url https://www.craftofexile.com/img/poe2/
  python fetch_base_images.py --force         # re-download even if present
  python fetch_base_images.py --limit 5       # smoke-test a handful first

Honors HTTPS_PROXY/HTTP_PROXY from the environment (urllib reads them).
Stdlib only -- no pip installs.
"""
import argparse, json, os, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
ASSETS = os.path.join(HERE, "..", "app", "assets", "bases")

# Best-guess CoE prefixes, tried in order during auto-probe.
CANDIDATE_PREFIXES = [
    "https://www.craftofexile.com/img/poe2/",
    "https://www.craftofexile.com/image/poe2/",
    "https://www.craftofexile.com/images/poe2/",
    "https://www.craftofexile.com/img/items/poe2/",
    "https://www.craftofexile.com/img/poe2/items/",
]
UA = {"User-Agent": "poe2-craft-planner base-image fetch (personal use)"}
MIN_IMAGE_BYTES = 200  # anything smaller is almost certainly an error page, not a webp


def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def looks_like_image(data):
    return data and len(data) >= MIN_IMAGE_BYTES and (
        data[:4] == b"RIFF" or data[:8] == b"\x89PNG\r\n\x1a\n" or data[:3] == b"\xff\xd8\xff")


def probe_prefix(sample_img):
    for pfx in CANDIDATE_PREFIXES:
        url = pfx + sample_img
        try:
            status, data = get(url, timeout=20)
            if status == 200 and looks_like_image(data):
                return pfx
            print(f"  · {pfx} -> HTTP {status}, {len(data)}b (not an image)")
        except urllib.error.HTTPError as e:
            print(f"  · {pfx} -> HTTP {e.code}")
        except Exception as e:
            print(f"  · {pfx} -> {type(e).__name__}: {e}")
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(DATA, "poe2_item_bases.json"))
    ap.add_argument("--out", default=ASSETS)
    ap.add_argument("--base-url", help="image URL prefix; skips auto-probe")
    ap.add_argument("--force", action="store_true", help="re-download even if the file exists")
    ap.add_argument("--limit", type=int, default=0, help="only fetch the first N (smoke test)")
    ap.add_argument("--sleep", type=float, default=0.1, help="seconds between downloads (be polite)")
    a = ap.parse_args()

    doc = json.load(open(a.data))
    imgs = sorted({rec["img"] for recs in doc["byClass"].values() for rec in recs if rec.get("img")})
    if a.limit:
        imgs = imgs[:a.limit]
    print(f"{len(imgs)} unique images referenced.")

    prefix = a.base_url
    if not prefix:
        print("Probing for the CoE image prefix...")
        prefix = probe_prefix(imgs[0])
        if not prefix:
            print("\nCould not auto-detect the image prefix. Find a working base URL in your\n"
                  "browser (right-click a base icon on craftofexile.com → copy image address),\n"
                  "then re-run with --base-url <prefix>. The path after the prefix must match\n"
                  "the 'img' values in poe2_item_bases.json.", file=sys.stderr)
            sys.exit(2)
    print(f"Using prefix: {prefix}\n")

    ok = skip = fail = 0
    failures = []
    for i, img in enumerate(imgs, 1):
        dest = os.path.join(a.out, img.replace("/", os.sep))
        if os.path.exists(dest) and not a.force:
            skip += 1
            continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        try:
            status, data = get(prefix + img)
            if status == 200 and looks_like_image(data):
                open(dest, "wb").write(data)
                ok += 1
            else:
                fail += 1; failures.append(f"{img} (HTTP {status}, {len(data)}b)")
        except Exception as e:
            fail += 1; failures.append(f"{img} ({type(e).__name__}: {e})")
        if i % 100 == 0:
            print(f"  {i}/{len(imgs)}  (ok={ok} skip={skip} fail={fail})")
        if a.sleep:
            time.sleep(a.sleep)

    print(f"\nDone. downloaded={ok} skipped(existing)={skip} failed={fail}")
    print(f"Saved under {os.path.abspath(a.out)}")
    if failures:
        print("\nFailures (first 20):")
        for f in failures[:20]:
            print("  -", f)


if __name__ == "__main__":
    main()
