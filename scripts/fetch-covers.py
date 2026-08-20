#!/usr/bin/env python3
"""Vendor music assets from public endpoints into the repo.

  covers    Spotify oEmbed thumbnail  →  assets/images/covers/<id>.jpg
  previews  iTunes 30s preview        →  assets/audio/previews/<id>.m4a

Hugo *can* pull remotes at build time, but Spotify resets Hugo's client, and
a CI build should not depend on Apple or Spotify being up. Fetch once, commit,
`resources.Get` treats them like any other local file.

    python3 scripts/fetch-covers.py [--force]

Cover art and 30-second previews belong to the rights holders; they are used
the way the oEmbed / iTunes preview endpoints intend — alongside a link to
the full track.
"""

import argparse
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MUSIC_YAML = ROOT / "data" / "music.yaml"
COVER_DIR = ROOT / "assets" / "images" / "covers"
PREVIEW_DIR = ROOT / "assets" / "audio" / "previews"

OEMBED = "https://open.spotify.com/oembed?url=https://open.spotify.com/track/{}"
ITUNES = "https://itunes.apple.com/search?"
STORES = ("HK", "TW", "US", "CN", "SG")

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

TRACK_RE = re.compile(r"track/([A-Za-z0-9]+)")
LIVE_RE = re.compile(r"\b(live|现场|現場)\b", re.I)

# Enough 繁→简 for music metadata. Without this, 半岛铁盒 never equals 半島鐵盒.
T2S = str.maketrans({
    "島": "岛", "鐵": "铁", "倫": "伦", "間": "间", "傑": "杰", "樂": "乐",
    "國": "国", "為": "为", "爲": "为", "愛": "爱", "語": "语", "時": "时",
    "長": "长", "來": "来", "對": "对", "開": "开", "關": "关", "經": "经",
    "與": "与", "於": "于", "後": "后", "從": "从", "無": "无", "這": "这",
    "還": "还", "個": "个", "們": "们", "說": "说", "讓": "让", "過": "过",
    "業": "业", "實": "实", "現": "现", "發": "发", "電": "电", "點": "点",
    "萬": "万", "學": "学", "總": "总", "體": "体", "歷": "历", "強": "强",
    "迴": "回", "會": "会", "純": "纯", "聲": "声", "處": "处", "裡": "里",
    "麼": "么", "樣": "样", "張": "张", "劉": "刘", "陳": "陈", "楊": "杨",
    "孫": "孙", "蕭": "萧", "葉": "叶", "黃": "黄", "趙": "赵", "吳": "吴",
    "呂": "吕", "鄭": "郑", "謝": "谢", "韓": "韩", "馮": "冯", "臺": "台",
    "灣": "湾", "風": "风", "雲": "云", "龍": "龙", "門": "门", "東": "东",
    "車": "车", "馬": "马", "飛": "飞", "機": "机", "場": "场", "難": "难",
    "隱": "隐",
})


def yaml_scalar(line):
    return line.split(":", 1)[1].strip().strip('"').strip("'")


def read_tracks(path):
    """Pull title / artist / album / spotify id out of music.yaml.

    A real YAML parse would need PyYAML, which is not installed and is not
    worth adding for a handful of flat scalar fields on a hand-written list.
    """
    tracks, cur = [], {}

    def flush():
        if cur.get("title") and cur.get("id"):
            tracks.append(dict(cur))

    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("- title:"):
            flush()
            cur = {"title": yaml_scalar(line), "artist": "", "album": ""}
        elif not cur:
            continue
        elif line.strip().startswith("artist:"):
            cur["artist"] = yaml_scalar(line)
        elif line.strip().startswith("album:"):
            cur["album"] = yaml_scalar(line)
        elif line.strip().startswith("spotify:"):
            m = TRACK_RE.search(line)
            if m:
                cur["id"] = m.group(1)
    flush()
    return tracks


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read() if binary else r.read().decode("utf-8")


def norm(s):
    s = unicodedata.normalize("NFKC", s or "").lower().translate(T2S)
    s = s.replace("《", "").replace("》", "")
    return re.sub(r"[\s\-_'’.,:;!?()（）【】\[\]·・:/]", "", s)


def names(s):
    return [n for n in (norm(p) for p in re.split(r"[/()（）]", s or "")) if n]


def ratio(a, b):
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def score_hit(track, hit):
    title_n = norm(track["title"])
    hit_title = norm(hit.get("trackName") or "")
    title_s = ratio(title_n, hit_title)
    if title_n and (title_n in hit_title or hit_title in title_n):
        title_s = max(title_s, 0.9)
    # Love Song must not beat Sing Alone Song just because the artist matches.
    if title_s < 0.74:
        return -1.0

    artist_s = 0.0
    hit_artists = names(hit.get("artistName") or "")
    for a in names(track["artist"]):
        for b in hit_artists:
            artist_s = max(artist_s, ratio(a, b))
            if a in b or b in a:
                artist_s = max(artist_s, 0.92)

    album_s = ratio(norm(track["album"]), norm(hit.get("collectionName") or ""))

    live_q = bool(LIVE_RE.search(track["title"]))
    live_h = bool(LIVE_RE.search(hit.get("trackName") or "") or
                  LIVE_RE.search(hit.get("collectionName") or ""))
    live_pen = 0.25 if live_h and not live_q else 0.0

    return title_s * 3 + artist_s * 2 + album_s * 0.6 - live_pen


def itunes_search(term, country):
    q = urllib.parse.urlencode({
        "term": term, "entity": "song", "limit": 8, "country": country,
    })
    data = json.loads(get(ITUNES + q))
    return data.get("results") or []


def find_preview(track):
    """Best iTunes song hit with a previewUrl, or None."""
    terms = []
    parts = [p.strip() for p in re.split(r"[/()（）]", track["artist"]) if p.strip()]
    for p in parts:
        for t in (f"{p} {track['title']}", f"{track['title']} {p}"):
            if t not in terms:
                terms.append(t)
    if track["title"] not in terms:
        terms.append(track["title"])

    best, best_s = None, 0.0
    for country in STORES:
        for term in terms:
            try:
                hits = itunes_search(term, country)
            except (urllib.error.URLError, ValueError, json.JSONDecodeError, OSError):
                continue
            for hit in hits:
                if not hit.get("previewUrl"):
                    continue
                s = score_hit(track, hit)
                if s > best_s:
                    best, best_s = hit, s
        if best_s >= 4.4:
            break
    if best and best_s >= 3.2:
        return best
    return None


def fetch_covers(tracks, force):
    COVER_DIR.mkdir(parents=True, exist_ok=True)
    fetched = skipped = failed = 0
    for t in tracks:
        dest = COVER_DIR / f"{t['id']}.jpg"
        if dest.exists() and not force:
            skipped += 1
            continue
        try:
            meta = json.loads(get(OEMBED.format(t["id"])))
            thumb = meta.get("thumbnail_url")
            if not thumb:
                raise ValueError("no thumbnail_url in oembed response")
            dest.write_bytes(get(thumb, binary=True))
            print(f"  ✓ {t['title']}  →  {dest.relative_to(ROOT)}")
            fetched += 1
        except (urllib.error.URLError, ValueError, json.JSONDecodeError, OSError) as e:
            print(f"  ✗ {t['title']}  ({t['id']}): {e}", file=sys.stderr)
            failed += 1
    print(f"covers: {fetched} fetched, {skipped} present, {failed} failed")
    return failed


def fetch_previews(tracks, force):
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    fetched = skipped = failed = 0
    for t in tracks:
        dest = PREVIEW_DIR / f"{t['id']}.m4a"
        if dest.exists() and not force:
            skipped += 1
            continue
        try:
            hit = find_preview(t)
            if not hit:
                raise ValueError("no iTunes preview match")
            dest.write_bytes(get(hit["previewUrl"], binary=True))
            print(f"  ✓ {t['title']}  ←  {hit.get('trackName')} / {hit.get('artistName')}")
            print(f"      {dest.relative_to(ROOT)}")
            fetched += 1
        except (urllib.error.URLError, ValueError, json.JSONDecodeError, OSError) as e:
            print(f"  ✗ {t['title']}  ({t['id']}): {e}", file=sys.stderr)
            failed += 1
    print(f"previews: {fetched} fetched, {skipped} present, {failed} failed")
    return failed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true",
                    help="re-download files that are already present")
    ap.add_argument("--covers-only", action="store_true")
    ap.add_argument("--previews-only", action="store_true")
    args = ap.parse_args()

    if not MUSIC_YAML.exists():
        sys.exit(f"error: missing {MUSIC_YAML}")

    tracks = read_tracks(MUSIC_YAML)
    if not tracks:
        sys.exit("error: no spotify tracks found in data/music.yaml")

    failed = 0
    if not args.previews_only:
        failed += fetch_covers(tracks, args.force)
    if not args.covers_only:
        failed += fetch_previews(tracks, args.force)
    # Missing assets degrade in the template; do not fail the build.
    return 0


if __name__ == "__main__":
    sys.exit(main())
