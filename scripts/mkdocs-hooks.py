"""mkdocs hooks — copy downloads + generate search index."""
import json
import os
import shutil
import subprocess


def on_post_build(config, **kwargs):
    wiki = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    site_dir = config["site_dir"]

    # ── Copy downloads/ PDFs into the built site ────────────────
    src = os.path.join(wiki, "downloads")
    dst = os.path.join(site_dir, "downloads")
    if os.path.isdir(src):
        os.makedirs(dst, exist_ok=True)
        for name in os.listdir(src):
            p = os.path.join(src, name)
            if os.path.isfile(p):
                shutil.copy2(p, os.path.join(dst, name))

    # ── Build search index ──────────────────────────────────────
    try:
        subprocess.run(
            ["node", os.path.join(wiki, "scripts", "build-search-index.mjs")],
            cwd=wiki,
            check=True,
            capture_output=True,
            text=True,
        )
    except Exception as e:
        print(f"Search index build failed: {e}")
