"""Generate the SYNTHETIC training project of CorAnTool (V19). These are NOT geological data.

Seven fictitious cores at random sea positions of the Mediterranean (seeded; positions on land are rejected with
the Natural Earth land polygons) with records driven by a simple common "climate" of the last 40 ka:
Holocene, Younger Dryas, Bølling-Allerød, Heinrich stadials HS1-HS3, Last Glacial Maximum; an organic layer
(sapropel S1 in the east, ORL in the west) 6-10 / 8-14 ka; random turbidites and two tephra layers. One core
also gets a synthetic core image (0-150 cm) with drawn trace fossils and their true ichnotaxon (truth file).

Output (examples/tutorial/): cores.csv (long table), catalogue.csv, intervals_depth.csv, intervals_age.csv,
age_models.csv, tutorial_core.jpg, tutorial_truth.json, README.md
Usage: python tools/make_tutorial.py
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "examples" / "tutorial"
SEED = 2026
# Rough sea areas (lat, lon) around which each core is placed with a random offset of up to ±0.8°.
AREAS = [("ENT-01", "Alborán", 36.0, -3.3), ("ENT-02", "Baleares", 39.3, 4.8), ("ENT-03", "Tirreno", 40.0, 12.4),
         ("ENT-04", "Jónico", 37.2, 18.3), ("ENT-05", "Adriático", 42.6, 16.0), ("ENT-06", "Egeo", 36.9, 25.2),
         ("ENT-07", "Levantino", 33.9, 30.0)]


def on_land(lat, lon, rings):
    inside = False
    for r in rings:
        xs, ys = r[0::2], r[1::2]
        if not (min(xs) <= lon <= max(xs) and min(ys) <= lat <= max(ys)):
            continue
        j = len(xs) - 1
        for i in range(len(xs)):
            if (ys[i] > lat) != (ys[j] > lat) and lon < (xs[j] - xs[i]) * (lat - ys[i]) / (ys[j] - ys[i]) + xs[i]:
                inside = not inside
            j = i
    return inside


def climate(age):
    """Cold index 0 (warm) – 1 (cold) for the last 40 ka."""
    c = np.full_like(age, 0.55)
    c[age < 11.7] = 0.05
    c[(age >= 11.7) & (age < 12.9)] = 0.75                     # Younger Dryas
    c[(age >= 12.9) & (age < 14.7)] = 0.3                      # Bølling-Allerød
    c[(age >= 14.7) & (age < 18.0)] = 0.95                     # HS1
    c[(age >= 19) & (age < 26.5)] = 0.85                       # LGM
    c[(age >= 24) & (age < 26)] = 1.0                          # HS2
    c[(age >= 29) & (age < 31)] = 0.95                         # HS3
    return c


def main():
    rng = np.random.default_rng(SEED)
    rings = json.loads((ROOT / "examples" / "data" / "land-50m.json").read_text())["rings"]
    OUT.mkdir(parents=True, exist_ok=True)
    rows, cat, ivd, iva, ages = [], [], [], [], []
    for name, area, la, lo in AREAS:
        for _ in range(200):
            lat, lon = la + rng.uniform(-0.8, 0.8), lo + rng.uniform(-0.8, 0.8)
            if not on_land(lat, lon, rings):
                break
        wd = int(rng.uniform(900, 3200))
        east = lon > 15
        rate = rng.uniform(12, 30)                                  # cm/ka
        length = int(min(900, 40 * rate))                           # cm
        # age model: 6 tie points with a wobbly rate
        tie_d = np.linspace(0, length, 6)
        tie_a = np.concatenate([[0], np.cumsum(np.diff(tie_d) / (rate * rng.uniform(0.75, 1.25, 5)))])
        for d, a in zip(tie_d, tie_a):
            ages.append((name, round(d, 1), round(a, 3)))
        depth = np.arange(0, length + 0.01, 2.0)
        age = np.interp(depth, tie_d, tie_a)
        cold = climate(age)
        a0, a1 = (6.0, 10.0) if east else (8.0, 14.0)
        org = ((age >= a0) & (age < a1)).astype(float) * (1.0 if east else 0.6)
        # turbidites (cm): 2-4 beds of 4-20 cm
        turb = np.zeros_like(depth)
        for _ in range(rng.integers(2, 5)):
            t0 = rng.uniform(20, length - 30)
            t1 = t0 + rng.uniform(4, 20)
            turb[(depth >= t0) & (depth < t1)] = 1
            ivd.append((name, round(t0, 1), round(t1, 1), "Litología", "Turbidita"))
        teph = np.zeros_like(depth)
        if area in ("Tirreno", "Egeo", "Jónico"):
            for ta in (3.6, 39.0):
                if ta < age[-1]:
                    td = float(np.interp(ta, age, depth))
                    teph[(depth >= td) & (depth < td + 3)] = 1
                    ivd.append((name, round(td, 1), round(td + 3, 1), "Litología", "Tefra"))
        n = len(depth)
        e = lambda s: rng.normal(0, s, n)  # noqa: B023 (used inside this iteration)
        rec = {
            "XRF Ti/Ca": 0.08 + 0.10 * cold + 0.25 * turb + 0.15 * teph + e(0.012),
            "XRF Ba/Ti": 0.6 + 2.2 * org - 0.2 * turb + e(0.08),
            "XRF Mn/Ti": 0.15 + 0.10 * (1 - cold) - 0.10 * org + e(0.02),
            "XRF Fe/Ca": 0.25 + 0.20 * cold + 0.15 * org + 0.3 * teph + e(0.03),
            "XRF Zr/Rb": 0.9 + 0.25 * cold + 0.8 * turb + e(0.05),
            "XRF Br/Cl": 0.05 + 0.10 * org + e(0.01),
            "SST_C": (21 if east else 18) - 7 * cold + e(0.5),
            "d18O_G.bulloides": 0.8 + 2.0 * cold - 0.6 * org + e(0.12),
            "CaCO3_pct": 45 - 15 * cold - 25 * turb - 30 * teph + e(2),
            "TOC_pct": 0.4 + (3.0 if east else 1.5) * org * rng.uniform(0.8, 1.1) + e(0.08),
            "Bentonicos_bajo_O2_pct": 10 + 60 * org + e(4),
            "Bioturbacion_pct": 70 - 50 * org + e(6),
        }
        disc = depth % 10 == 0                                       # discrete samples every 10 cm
        for i in range(n):
            r = {"core": name, "lat": round(lat, 3), "lon": round(lon, 3), "depth_cm": depth[i], "age_ka": round(age[i], 3)}
            for k, v in rec.items():
                if k in ("TOC_pct", "CaCO3_pct", "SST_C", "d18O_G.bulloides", "Bentonicos_bajo_O2_pct") and not disc[i]:
                    r[k] = ""
                else:
                    r[k] = round(float(max(v[i], 0) if k != "d18O_G.bulloides" else v[i]), 4)
            rows.append(r)
        cat.append((name, round(lat, 3), round(lon, 3), wd, f"Sondeo ficticio ({area}); datos sintéticos"))
        # described organic layer only in 4 cores (the classifier must find it in the other 3)
        if name in ("ENT-01", "ENT-03", "ENT-04", "ENT-07"):
            iva.append((name, 0.0, a0, "Capas orgánicas", "Fuera de capa orgánica"))
            iva.append((name, a0, a1, "Capas orgánicas", "Sapropel" if east else "ORL"))
            iva.append((name, a1, round(float(age[-1]), 2), "Capas orgánicas", "Fuera de capa orgánica"))
        for p0, p1, lab in [(0, 11.7, "Holoceno"), (11.7, 12.9, "Younger Dryas"), (12.9, 14.7, "Bølling-Allerød"), (14.7, 18.0, "HS1"), (19, 24, "Último Máximo Glacial")]:
            if p0 < age[-1]:
                iva.append((name, p0, min(p1, round(float(age[-1]), 2)), "Periodo climático", lab))
    keys = list(rows[0].keys())
    with open(OUT / "cores.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, keys)
        w.writeheader()
        w.writerows(rows)
    with open(OUT / "catalogue.csv", "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows([("core", "lat", "lon", "water_depth_m", "description"), *cat])
    with open(OUT / "intervals_depth.csv", "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows([("core", "top_cm", "bottom_cm", "layer", "value"), *ivd])
    with open(OUT / "intervals_age.csv", "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows([("core", "top_ka", "bottom_ka", "layer", "value"), *iva])
    with open(OUT / "age_models.csv", "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows([("core", "depth_cm", "age_ka"), *ages])
    core_image(rng)
    print("cores:", len(AREAS), "rows:", len(rows), "intervals:", len(ivd), "+", len(iva))


def core_image(rng, ppc=25, top=0, bottom=150, width_cm=8):
    """Synthetic core photo with dark trace fossils of four ichnotaxa; truth = centre and taxon of each trace."""
    H, W = int((bottom - top) * ppc), int(width_cm * ppc)
    base = rng.normal(0, 1, (H // 8 + 1, W // 8 + 1))
    base = np.array(Image.fromarray(((base - base.min()) / np.ptp(base) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), float) / 255
    L = 150 + 25 * base + rng.normal(0, 4, (H, W))
    band = (np.arange(H)[:, None] >= 60 * ppc) & (np.arange(H)[:, None] < 78 * ppc)   # darker organic-rich band 60-78 cm
    L = np.where(band, L - 35, L)
    rgb = np.stack([L * 1.0, L * 0.88, L * 0.70], -1)
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    truth = []
    dark = lambda: tuple(int(v) for v in (rng.uniform(55, 75), rng.uniform(48, 62), rng.uniform(38, 50)))

    def free(x, y, r):
        return all((x - t["x"]) ** 2 + (y - t["y"]) ** 2 > (r + t["r"] + 4) ** 2 for t in truth)

    def place(r, y0=0, y1=None):
        for _ in range(300):
            x, y = rng.uniform(r + 4, W - r - 4), rng.uniform(y0 + r + 4, (y1 or H) - r - 4)
            if free(x, y, r):
                return x, y
        return None
    # Thalassinoides: large Y-shaped tubes (outside the organic band)
    for _ in range(9):
        p = place(30)
        if not p or band[int(p[1]), 0]:
            continue
        x, y = p
        c, wd = dark(), int(rng.uniform(9, 13))
        a = rng.uniform(0, np.pi)
        for ang in (a, a + 2.1, a + 4.2):
            d.line([(x, y), (x + 26 * np.cos(ang), y + 26 * np.sin(ang))], fill=c, width=wd)
        d.ellipse([x - wd, y - wd, x + wd, y + wd], fill=c)
        truth.append({"taxon": "Thalassinoides", "x": x, "y": y, "r": 30})
    # Zoophycos: long thin horizontal lenses with spreite
    for _ in range(14):
        p = place(32)
        if not p:
            continue
        x, y = p
        c, ln, th = dark(), rng.uniform(40, 60), rng.uniform(4, 6)
        d.ellipse([x - ln / 2, y - th / 2, x + ln / 2, y + th / 2], fill=c)
        truth.append({"taxon": "Zoophycos", "x": x, "y": y, "r": ln / 2})
    # Planolites: small horizontal ellipses
    for _ in range(40):
        p = place(10)
        if not p:
            continue
        x, y = p
        c, a, b = dark(), rng.uniform(7, 11), rng.uniform(4, 5.5)
        d.ellipse([x - a, y - b, x + a, y + b], fill=c)
        truth.append({"taxon": "Planolites", "x": x, "y": y, "r": a})
    # Chondrites: clusters of tiny dots (mostly in and around the organic band)
    for _ in range(60):
        p = place(4, 50 * ppc, 90 * ppc) if rng.random() < 0.7 else place(4)
        if not p:
            continue
        x, y = p
        c, r = dark(), rng.uniform(2, 3)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
        truth.append({"taxon": "Chondrites", "x": x, "y": y, "r": 4})
    img = img.filter(ImageFilter.GaussianBlur(0.7))
    img.save(OUT / "tutorial_core.jpg", quality=88)
    (OUT / "tutorial_truth.json").write_text(json.dumps({"core": "ENT-03", "top_cm": top, "bottom_cm": bottom, "px_per_cm": ppc, "width": W, "height": H,
                                                          "traces": [{k: (round(v, 1) if isinstance(v, float) else v) for k, v in t.items()} for t in truth]}), encoding="utf-8")


if __name__ == "__main__":
    main()
