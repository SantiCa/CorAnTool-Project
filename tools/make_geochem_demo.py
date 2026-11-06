"""Generate the SYNTHETIC multi-proxy demo dataset for the IchAnTool geochemistry module.

These are NOT geological data. They are simulated with known "events" so that the labelling,
training and mapping workflow can be tested against a known truth (column `event_true`).

Output (examples/geochem_demo/):
  demo_long.csv       one long table: core, lat, lon, depth_m, age_ka, proxies, event_true
  catalogue.csv       core, lat, lon, water_depth_m
  cores/DEMO-xx.csv   one file per core (depth_m, age_ka, proxies, event_true)
  intervals.csv       described intervals (depth, m): Litologia (silty clay in glacial windows ± 1 ka,
                      nannofossil marl otherwise) and Turbidita, thin beds nested inside silty clay

Usage: python tools/make_geochem_demo.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parents[1] / "examples" / "geochem_demo"
SEED = 397
# Fictitious cores at sea positions across the Mediterranean (lat, lon, water depth m).
CORES = {
    "DEMO-01": (36.1, -3.2, 1100), "DEMO-02": (37.6, 0.8, 2300), "DEMO-03": (42.3, 4.4, 1500),
    "DEMO-04": (39.0, 4.6, 2400), "DEMO-05": (43.4, 8.6, 1800), "DEMO-06": (40.1, 11.9, 3200),
    "DEMO-07": (37.2, 12.4, 1300), "DEMO-08": (42.4, 16.2, 1200), "DEMO-09": (38.4, 18.8, 3000),
    "DEMO-10": (35.9, 17.6, 3600), "DEMO-11": (34.3, 22.1, 2700), "DEMO-12": (38.3, 25.1, 900),
    "DEMO-13": (34.5, 25.3, 2200), "DEMO-14": (34.4, 29.8, 2500), "DEMO-15": (33.6, 32.2, 1700),
}
SAPROPELS = [(6, 10), (79, 86), (100, 105), (122, 128)]          # low-oxygenation windows (ka)
GLACIALS = [(14, 29), (57, 71), (130, 150)]                      # detrital windows (ka)
EVENTS = ["background", "low_oxygenation", "detrital_input", "strong_bottom_current"]


def ar1(rng, n, phi=0.7, sd=0.1):
    e = rng.normal(0, sd, n)
    x = np.zeros(n)
    for i in range(1, n):
        x[i] = phi * x[i - 1] + e[i]
    return x


def make_core(rng, name, lat, lon):
    age = np.arange(0, 150.01, 0.5)
    n = len(age)
    rate = rng.uniform(5, 20)                                    # cm/ka
    depth = age * rate / 100 + rng.normal(0, 0.002, n).cumsum().clip(-0.05, 0.05)
    depth = np.maximum.accumulate(np.maximum(depth, 0))
    ev = np.zeros(n, int)
    east = np.clip((lon - 8) / 20, 0, 1)                         # sapropels stronger to the east
    for a, b in GLACIALS:
        ev[(age >= a) & (age < b)] = 2
    if lon < 10:                                                 # bottom-current pulses in the west
        for _ in range(6):
            c = rng.uniform(20, 70)
            ev[(age >= c) & (age < c + 2)] = 3
    if east > 0.15:
        for a, b in SAPROPELS:
            ev[(age >= a) & (age < b)] = 1
    lo, de, cu = ev == 1, ev == 2, ev == 3
    ti_al = 0.050 * np.exp(ar1(rng, n, sd=0.04)) * np.where(de, 1.45, 1.0)
    zr_rb = 0.80 * np.exp(ar1(rng, n, sd=0.05)) * np.where(cu, 1.7, 1.0) * np.where(de, 1.1, 1.0)
    ba_al = 0.010 * np.exp(ar1(rng, n, sd=0.05)) * np.where(lo, 1 + 2.5 * east, 1.0)
    mn_al = 0.012 * np.exp(ar1(rng, n, sd=0.06)) * np.where(lo, 0.3, 1.0)
    ca = (28 + 6 * ar1(rng, n, sd=0.15)) * np.where(de, 0.7, 1.0)
    toc = 0.45 * np.exp(ar1(rng, n, sd=0.08)) * np.where(lo, 1 + 5 * east, 1.0) * np.where(cu, 0.8, 1.0)
    rows = []
    for i in range(n):
        rows.append([name, lat, lon, round(depth[i], 4), round(age[i], 2), round(ti_al[i], 5), round(zr_rb[i], 4),
                     round(ba_al[i], 5), round(mn_al[i], 5), round(ca[i], 3), round(toc[i], 4), EVENTS[ev[i]]])
    return rows


def make_intervals(rng, name, rows):
    age = np.array([r[4] for r in rows]); depth = np.array([r[3] for r in rows])
    d = lambda a: round(float(np.interp(a, age, depth)), 4)
    edges = []
    for a, b in GLACIALS:
        edges.append((max(0.0, a + rng.uniform(-1, 1)), min(150.0, b + rng.uniform(-1, 1))))
    out, cur = [], 0.0
    for a, b in edges:
        if a > cur:
            out.append([name, d(cur), d(a), "Marga nanofosilifera", ""])
        out.append([name, d(a), d(b), "Arcilla limosa", ""])
        cur = b
    if cur < 150:
        out.append([name, d(cur), d(150), "Marga nanofosilifera", ""])
    for _ in range(int(rng.integers(0, 4))):              # turbidites only inside silty clay
        a, b = edges[int(rng.integers(0, len(edges)))]
        t0 = rng.uniform(a, max(a, b - 1.3)); t1 = t0 + rng.uniform(0.3, 1.2)
        out.append([name, d(t0), d(min(t1, b)), "", "Turbidita"])
    return out


def main():
    rng = np.random.default_rng(SEED)
    head = ["core", "lat", "lon", "depth_m", "age_ka", "Ti/Al", "Zr/Rb", "Ba/Al", "Mn/Al", "Ca_pct", "TOC_pct", "event_true"]
    (OUT / "cores").mkdir(parents=True, exist_ok=True)
    allrows, ivrows, rng_iv = [], [], np.random.default_rng(SEED + 1)
    for name, (lat, lon, _wd) in CORES.items():
        rows = make_core(rng, name, lat, lon)
        allrows += rows
        ivrows += make_intervals(rng_iv, name, rows)
        with open(OUT / "cores" / f"{name}.csv", "w", encoding="utf-8") as f:
            f.write(",".join(head[3:]) + "\n")
            for r in rows:
                f.write(",".join(map(str, r[3:])) + "\n")
    with open(OUT / "demo_long.csv", "w", encoding="utf-8") as f:
        f.write("# SYNTHETIC demo data generated by tools/make_geochem_demo.py (seed 397). Not real measurements.\n")
        f.write(",".join(head) + "\n")
        for r in allrows:
            f.write(",".join(map(str, r)) + "\n")
    with open(OUT / "catalogue.csv", "w", encoding="utf-8") as f:
        f.write("core,lat,lon,water_depth_m\n")
        for name, (lat, lon, wd) in CORES.items():
            f.write(f"{name},{lat},{lon},{wd}\n")
    with open(OUT / "intervals.csv", "w", encoding="utf-8") as f:
        f.write("core,top_m,bottom_m,Litologia,Turbidita\n")
        for r in ivrows:
            f.write(",".join(map(str, r)) + "\n")
    print(len(allrows), "samples,", len(CORES), "cores ->", OUT)


if __name__ == "__main__":
    main()
