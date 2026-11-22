#!/usr/bin/env python3
"""
Freie Spiel-Sounds bauen und einhängen.

    python tools/sfx_build.py            # audio/free/ (CC0-Downloads) + Synthese → audio/sfx/*.wav
    python tools/sfx_build.py --remap    # zusätzlich: Sound-Tabellen des Spiels auf audio/sfx/ umstellen

Quellen: freesound.org, alles CC0 (Liste: audio/free/text.md + Pack-Lizenzen). Was dort fehlt,
wird hier synthetisch erzeugt (Klicks, Einschläge, Wusch, Wind, Signaltöne …) – eigene Arbeit, frei.
Braucht: Python 3 mit numpy, ffmpeg im PATH.
"""
import argparse
import glob
import json
import os
import re
import subprocess
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'audio', 'free')
OUT = os.path.join(ROOT, 'audio', 'sfx')
SR = 44100
rng = np.random.default_rng(20261121)
MADE = {}                         # name → Quelle (für QUELLEN.txt)


# ----------------------------------------------------------------------------- Grundbausteine
def find(fid):
    hits = [f for f in glob.glob(os.path.join(SRC, '**', f'{fid}__*'), recursive=True)
            if not re.search(r'\(\d+\)\.\w+$', f) and os.path.isfile(f)]
    if not hits:
        raise FileNotFoundError(f'Quelle {fid} nicht in audio/free/')
    return sorted(hits)[0]


def load(fid):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', find(fid), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                       capture_output=True, check=True)
    x = np.frombuffer(p.stdout, dtype=np.float32).copy()
    return x / (np.abs(x).max() + 1e-9)


def t(sec):
    return np.arange(int(sec * SR)) / SR


def seg(x, a, b):
    return x[int(a * SR):int(b * SR)].copy()


def pad(x, sec):
    return np.concatenate([x, np.zeros(int(sec * SR), np.float32)])


def trim(x, start_db=-38, end_db=-58, pre=0.0015):
    m = np.abs(x).max() + 1e-12
    on = np.where(np.abs(x) > m * 10 ** (start_db / 20))[0]
    end = np.where(np.abs(x) > m * 10 ** (end_db / 20))[0]
    if not len(on):
        return x
    a = max(0, on[0] - int(pre * SR))
    b = min(len(x), end[-1] + int(0.02 * SR))
    return x[a:b]


def fade(x, fin=0.0015, fout=0.04):
    y = x.copy()
    a, b = min(len(y), int(fin * SR)), min(len(y), int(fout * SR))
    if a:
        y[:a] *= np.linspace(0, 1, a)
    if b:
        y[-b:] *= np.linspace(1, 0, b)
    return y


def filt(x, lp=None, hp=None, order=2, bands=()):
    """Nullphasen-Filter im Frequenzbereich (sanfte Flanken). bands: (Mittenfrequenz, dB, Breite)"""
    n = len(x)
    N = 1 << int(np.ceil(np.log2(n + SR // 8)))
    X = np.fft.rfft(x, N)
    f = np.fft.rfftfreq(N, 1 / SR)
    H = np.ones_like(f)
    if lp:
        H /= np.sqrt(1 + (f / lp) ** (2 * order))
    if hp:
        H /= np.sqrt(1 + (hp / np.maximum(f, 1e-3)) ** (2 * order))
    for fc, g, q in bands:
        H *= 10 ** (g / 20 * np.exp(-0.5 * (np.log2(np.maximum(f, 1) / fc) * q) ** 2))
    return np.fft.irfft(X * H, N)[:n].astype(np.float32)


def conv(x, ir):
    N = 1 << int(np.ceil(np.log2(len(x) + len(ir))))
    return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[:len(x) + len(ir) - 1].astype(np.float32)


def reverb(x, decay=1.2, mix=0.25, lp=6000, pre=0.012, wet_only=False):
    n = int(decay * SR)
    tt = np.arange(n) / SR
    ir = rng.standard_normal(n).astype(np.float32) * np.exp(-6.91 * tt / decay)
    ir = filt(ir, lp=lp, hp=150)
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    ir = np.concatenate([np.zeros(int(pre * SR), np.float32), ir])
    wet = conv(x, ir) * 0.5
    if wet_only:
        return wet
    y = np.zeros(len(wet), np.float32)
    y[:len(x)] += x
    return y + mix * wet


def pitch(x, factor):
    idx = np.arange(0, len(x) - 1, factor)
    return np.interp(idx, np.arange(len(x)), x).astype(np.float32)


def drive(x, d):
    return (np.tanh(x * d) / np.tanh(d)).astype(np.float32)


def am(x, f, depth, phase=0.0):
    tt = np.arange(len(x)) / SR
    return (x * (1 - depth / 2 + depth / 2 * np.sin(2 * np.pi * f * tt + phase))).astype(np.float32)


def mix(*parts):
    """parts: (signal, Startzeit s, Gain)"""
    n = max(int(o * SR) + len(s) for s, o, g in parts)
    y = np.zeros(n, np.float32)
    for s, o, g in parts:
        i = int(o * SR)
        y[i:i + len(s)] += s * g
    return y


def noise(sec):
    return rng.standard_normal(int(sec * SR)).astype(np.float32)


def env(sec, attack=0.002, decay=None, curve=6.91):
    n = int(sec * SR)
    tt = np.arange(n) / SR
    e = np.minimum(1, tt / max(attack, 1e-4))
    d = decay or sec
    return (e * np.exp(-curve * np.maximum(0, tt - attack) / d)).astype(np.float32)


def tone(f, sec, kind='sine'):
    tt = t(sec)
    ph = 2 * np.pi * (np.cumsum(np.broadcast_to(f, tt.shape)) / SR if np.ndim(f) else f * tt)
    if kind == 'sine':
        return np.sin(ph).astype(np.float32)
    if kind == 'tri':
        return (2 / np.pi * np.arcsin(np.sin(ph))).astype(np.float32)
    return np.sign(np.sin(ph)).astype(np.float32) * 0.6


def sweep(f0, f1, sec):
    return tone(np.geomspace(f0, f1, int(sec * SR)), sec)


def save(name, x, peak_db=-3.0, src='synthetisch (tools/sfx_build.py)', loop=False, punch=None):
    """punch = Ziel-Lautheit der ersten 150 ms (dBFS) statt Spitzenpegel → Schüsse gleich laut, Spitzen weich begrenzt"""
    x = np.asarray(x, np.float32)
    if not loop:
        x = fade(x, 0.0008, min(0.06, len(x) / SR / 4))
    m = np.abs(x).max()
    if punch is not None and m > 0:
        a = x[:int(0.15 * SR)]
        x = x * 10 ** ((punch - 20 * np.log10(np.sqrt(np.mean(a ** 2)) + 1e-9)) / 20)
        ceil = 10 ** (-0.8 / 20)
        if np.abs(x).max() > ceil:
            x = (ceil * np.tanh(x / ceil)).astype(np.float32)
    elif m > 0:
        x = x / m * 10 ** (peak_db / 20)
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    MADE[name] = src


def events(x, thr_db=-28, gap=0.09, min_len=0.02):
    win = int(0.004 * SR)
    n = len(x) // win
    e = np.sqrt(np.mean(x[:n * win].reshape(n, win) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(e / e.max())
    out, start, last = [], None, -1
    for i, v in enumerate(db > thr_db):
        tt = i * 0.004
        if v and start is None:
            start = tt
        if v:
            last = tt
        if start is not None and not v and tt - last > gap:
            if last - start >= min_len:
                out.append((start, last))
            start = None
    if start is not None:
        out.append((start, last))
    return out


def loopify(x, xfade=1.0):
    """Ende weich über den Anfang blenden → nahtlose Schleife."""
    n = int(xfade * SR)
    y = x[:-n].copy()
    w = np.linspace(0, 1, n, dtype=np.float32)
    y[:n] = y[:n] * w + x[-n:] * (1 - w)
    return y


# ----------------------------------------------------------------------------- synthetische Bausteine
def click(sec=0.004, lp=9000, hp=1500):
    return filt(noise(sec) * env(sec, 0.0002, sec / 2), lp=lp, hp=hp)


def scrape(sec=0.08, lo=1800, hi=7000, rise=True):
    e = np.linspace(0.2, 1, int(sec * SR)) if rise else np.linspace(1, 0.1, int(sec * SR))
    return filt(noise(sec) * e.astype(np.float32), lp=hi, hp=lo, order=3)


def metal_ring(f0, sec=0.4, n=5, damp=1.0):
    ratios = [1, 1.58, 2.31, 3.17, 4.02, 5.12][:n]
    y = np.zeros(int(sec * SR), np.float32)
    for i, r in enumerate(ratios):
        f = f0 * r * (1 + rng.uniform(-0.015, 0.015))
        y += tone(f, sec) * env(sec, 0.0005, sec / (1 + i * 0.6) * damp) * (0.9 ** i)
    return y


def thump(f0=90, f1=45, sec=0.12):
    return sweep(f0, f1, sec) * env(sec, 0.001, sec * 0.7)


def whoosh(sec=0.24, f0=900, f1=2600, q_lo=0.5):
    n = int(sec * SR)
    x = noise(sec)
    y = np.zeros(n, np.float32)
    blocks = 24
    for k in range(blocks):                       # Bandpass, der durch das Spektrum wandert
        a, b = k * n // blocks, (k + 1) * n // blocks
        fc = f0 * (f1 / f0) ** (k / (blocks - 1))
        y[a:b] = filt(x, lp=fc * 1.6, hp=fc * q_lo, order=2)[a:b]
    e = np.sin(np.linspace(0, np.pi, n)) ** 1.6
    return (y * e).astype(np.float32)


def rustle(sec=0.4, density=60, lo=700, hi=5200):
    y = np.zeros(int(sec * SR), np.float32)
    for _ in range(int(density * sec)):
        L = rng.uniform(0.012, 0.05)
        s = noise(L) * np.hanning(int(L * SR)).astype(np.float32) * rng.uniform(0.2, 1)
        o = int(rng.uniform(0, sec - L) * SR)
        y[o:o + len(s)] += s
    y = filt(y, lp=hi, hp=lo)
    return y * np.sin(np.linspace(0, np.pi, len(y))).astype(np.float32) ** 0.6


def grains(sec=0.25, count=14, lp=7000, hp=900, decay=0.12):
    y = np.zeros(int(sec * SR), np.float32)
    for _ in range(count):
        o = rng.exponential(decay)
        if o >= sec - 0.01:
            continue
        c = click(rng.uniform(0.002, 0.007), lp=lp, hp=hp) * np.exp(-o / decay) * rng.uniform(0.3, 1)
        i = int(o * SR)
        y[i:i + len(c)] += c[:len(y) - i]
    return y


# ----------------------------------------------------------------------------- Rezepte
def build():
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, '*.wav')):
        os.remove(f)
    fs = 'freesound.org, CC0'

    # ---- Schüsse ----
    g36, mg = load('196400'), load('212601')
    r1 = trim(seg(g36, 0, 1.8)); r2 = trim(seg(mg, 0, 1.0))
    r3 = filt(pitch(r1, 1.06), bands=((3200, 3, 1.2),))
    save('schuss_sturmgewehr_1', r1, -1, f'CS279 „G36-E Fire“ ({fs})', punch=-10)
    save('schuss_sturmgewehr_2', reverb(r2, 0.9, 0.18), -1, f'pgi „Machine Gun 001 - single shot“ ({fs})', punch=-10)
    save('schuss_sturmgewehr_3', r3, -1, 'Variante von schuss_sturmgewehr_1', punch=-10)
    save('schuss_sturmgewehr_schwer_1', filt(pitch(r1, 0.9), bands=((90, 4, 1.0),)), -1, 'Variante von schuss_sturmgewehr_1', punch=-10)
    save('schuss_sturmgewehr_schwer_2', filt(pitch(reverb(r2, 0.9, 0.18), 0.9), bands=((90, 4, 1.0),)), -1, 'Variante von schuss_sturmgewehr_2', punch=-10)
    save('schuss_sturmgewehr_hell_1', pitch(reverb(r2, 0.8, 0.15), 1.08), -1, 'Variante von schuss_sturmgewehr_2', punch=-10)
    save('schuss_sturmgewehr_hell_2', pitch(r3, 1.05), -1, 'Variante von schuss_sturmgewehr_1', punch=-10)
    sn = load('182435')
    s1, s2, s3 = (trim(seg(sn, a, b)) for a, b in ((0.98, 2.6), (3.73, 5.4), (10.57, 12.4)))
    for i, s in enumerate((s1, s2, s3), 1):
        save(f'schuss_scharfschuetze_{i}', s, -1, f'qubodup „Sniper Shots“ ({fs})', punch=-9)
    save('schuss_scharfschuetze_4', filt(pitch(s1, 0.94), bands=((70, 3, 1.0),)), -1, 'Variante von schuss_scharfschuetze_1', punch=-9)
    p1, p2 = trim(seg(load('386745'), 0, 1.6)), trim(seg(load('402789'), 1.2, 2.6))
    save('schuss_pistole_1', p1, -1, f'ken788 „Handgun_Shot“ ({fs})', punch=-11)
    save('schuss_pistole_2', p2, -1, f'acidsnowflake „Small pistol gunshot indoors“ ({fs})', punch=-11)
    save('schuss_pistole_3', pitch(p1, 1.1), -1, 'Variante von schuss_pistole_1', punch=-11)
    save('schuss_pistole_4', filt(pitch(p2, 0.92), bands=((110, 3, 1.0),)), -1, 'Variante von schuss_pistole_2', punch=-11)
    dist = lambda x: reverb(filt(x, lp=1300, hp=110), 1.8, 0.9, lp=2500, pre=0.03)
    save('schuss_fern_gewehr_1', dist(r1), -6, 'Variante von schuss_sturmgewehr_1 (Ferne)')
    save('schuss_fern_gewehr_2', dist(r2), -6, 'Variante von schuss_sturmgewehr_2 (Ferne)')
    save('schuss_fern_pistole_1', dist(p1), -7, 'Variante von schuss_pistole_1 (Ferne)')
    save('schuss_fern_pistole_2', dist(p2), -7, 'Variante von schuss_pistole_2 (Ferne)')
    tail = lambda x, d, lp: reverb(filt(seg(x, 0.0, 0.25), lp=lp), d, 1, lp=lp, pre=0.02, wet_only=True)
    save('hall_gewehr_aussen', tail(r1, 1.8, 4500), -9, 'Nachhall aus schuss_sturmgewehr_1')
    save('hall_gewehr_innen', tail(r1, 0.6, 3000), -9, 'Nachhall aus schuss_sturmgewehr_1')
    save('hall_pistole_aussen', tail(p1, 1.4, 4500), -10, 'Nachhall aus schuss_pistole_1')
    save('hall_pistole_innen', tail(p1, 0.5, 3000), -10, 'Nachhall aus schuss_pistole_1')
    save('hall_scharfschuetze_aussen', tail(s1, 2.6, 4000), -8, 'Nachhall aus schuss_scharfschuetze_1')
    save('tief_gewehr', thump(95, 38, 0.28), -3)
    save('tief_scharfschuetze', thump(75, 30, 0.55), -2)
    save('tief_explosion', mix((thump(60, 24, 1.3), 0, 1), (filt(noise(1.4), lp=110) * env(1.4, 0.01, 0.8), 0, 0.6)), -2)

    # ---- Mechanik ----
    empty = trim(load('154934'))
    reload_click = trim(load('632790'))
    save('leer_klick', empty, -6, f'KlawyKogut „Empty Gun Shot“ ({fs})')
    mag_in = mix((reload_click, 0, 1), (pitch(seg(empty, 0, 0.06), 0.85), 0.012, 0.7))
    save('magazin_rein', mag_in, -5, 'sldosher „Gun Magazine Reload“ + KlawyKogut (CC0), bearbeitet')
    save('magazin_raus', mix((scrape(0.09, 1500, 5000), 0, 0.35), (pitch(reload_click, 0.8), 0.085, 1)), -6, 'sldosher (CC0) + Synthese')
    save('magazin_klopf', filt(pitch(reload_click, 0.7), lp=2500), -8, 'sldosher (CC0), bearbeitet')
    save('pistole_magazin_rein', pitch(mag_in, 1.2), -6, 'Variante von magazin_rein')
    save('pistole_magazin_raus', mix((scrape(0.06, 2000, 6000), 0, 0.3), (pitch(reload_click, 1.0), 0.055, 1)), -7, 'sldosher (CC0) + Synthese')
    save('verschluss_zurueck', mix((scrape(0.075, 2000, 7000), 0, 0.5), (pitch(seg(empty, 0, 0.06), 0.72), 0.07, 1)), -5, 'KlawyKogut (CC0) + Synthese')
    save('verschluss_vor', mix((pitch(reload_click, 1.15), 0, 1), (metal_ring(2300, 0.14), 0.002, 0.12), (scrape(0.03, 3000, 8000, False), 0, 0.3)), -4, 'sldosher (CC0) + Synthese')
    save('repetierer_hoch', mix((click(0.006, 6000, 900), 0, 1), (scrape(0.05, 1200, 4000), 0.004, 0.3)), -7)
    save('repetierer_zurueck', mix((scrape(0.11, 1500, 5500), 0, 0.45), (pitch(seg(empty, 0, 0.06), 0.65), 0.1, 1)), -5, 'KlawyKogut (CC0) + Synthese')
    save('repetierer_vor', mix((scrape(0.09, 1500, 5500), 0, 0.4), (pitch(reload_click, 0.95), 0.085, 1), (metal_ring(1800, 0.12), 0.09, 0.08)), -5, 'sldosher (CC0) + Synthese')
    save('repetierer_runter', mix((pitch(reload_click, 0.8), 0, 0.9), (click(0.005, 5000, 700), 0.004, 0.6)), -7, 'sldosher (CC0) + Synthese')
    save('pistole_schlitten_zurueck', mix((scrape(0.05, 2500, 8000), 0, 0.45), (pitch(seg(empty, 0, 0.06), 0.95), 0.045, 1)), -6, 'KlawyKogut (CC0) + Synthese')
    save('pistole_schlitten_vor', mix((pitch(reload_click, 1.3), 0, 1), (metal_ring(3100, 0.1), 0.002, 0.1)), -5, 'sldosher (CC0) + Synthese')
    save('knopf_klick', click(0.004, 9000, 2500), -12)
    save('waffe_ziehen', mix((rustle(0.32), 0, 0.6), (click(0.005, 7000, 1500), 0.22, 0.8), (metal_ring(2600, 0.12), 0.222, 0.06)), -9)
    save('waffe_weg', mix((rustle(0.28), 0, 0.6), (click(0.004, 5000, 1000), 0.18, 0.5)), -11)
    save('zielen_rein', rustle(0.16, 90), -12)
    save('zielen_raus', rustle(0.14, 90, 600, 4200), -13)
    save('zielfernrohr', mix((click(0.004, 8000, 2000), 0, 1), (click(0.004, 7000, 1800), 0.05, 0.7)), -10)

    # ---- Schritte ----
    def steps(fid, name, count, pre=0.004, length=0.22, peak=-6, extra=None, src=None):
        x = load(fid)
        ev = events(x)
        out = []
        for a, b in ev:
            s = seg(x, max(0, a - pre), min(len(x) / SR, a + max(length, b - a + 0.06)))
            out.append(trim(s))
        out = sorted(out, key=lambda s: -np.abs(s).max())[:count]
        for i, s in enumerate(out, 1):
            save(f'{name}_{i}', extra(s) if extra else s, peak, src or f'{fid} ({fs})')
        return out
    steps('777606', 'schritte_beton', 8, src=f'YannSauvin „Footsteps boots run on asphalt“ ({fs})')
    stone = steps('521590', 'schritte_stein', 6, src=f'Fission9 „hiking boot footsteps on stone“ ({fs})')
    grass = steps('521587', 'schritte_gras', 6, src=f'Fission9 „hiking boot footsteps on grass“ ({fs})')
    gravel = steps('521588', 'schritte_kies', 4, src=f'Fission9 „hiking boot footsteps on gravel“ ({fs})')
    for i, s in enumerate(gravel[:2], 5):
        save(f'schritte_kies_{i}', pitch(s, 0.94 + 0.12 * (i - 5)), -6, 'Variante von schritte_kies')
    steps('521589', 'schritte_holz', 6, src=f'Fission9 „hiking boot footsteps on wooden planks“ ({fs})')
    for i, s in enumerate(stone[:4], 1):
        save(f'schritte_metall_{i}', mix((filt(s, hp=300), 0, 1), (metal_ring(rng.uniform(380, 520), 0.35, 4), 0.003, 0.35)), -6, 'schritte_stein + Synthese (Metall)')
    for i, s in enumerate(grass[:4], 1):
        spl = filt(noise(0.22) * env(0.22, 0.01, 0.12), lp=4200, hp=500) + grains(0.22, 10, 3500, 400, 0.08)
        save(f'schritte_wasser_{i}', mix((filt(s, lp=2500), 0, 0.6), (spl, 0.0, 0.9)), -6, 'schritte_gras + Synthese (Wasser)')
        save(f'schritte_weich_{i}', filt(s, lp=1700), -9, 'Variante von schritte_gras (weich)')
    save('sprung', mix((whoosh(0.2, 500, 1600), 0, 0.7), (rustle(0.18), 0.02, 0.5)), -10)
    for i in (1, 2):
        save(f'landung_{i}', mix((thump(75, 42, 0.14), 0, 1), (filt(pitch(stone[i], 0.8), lp=3000), 0.002, 0.9), (rustle(0.22), 0.03, 0.35)), -5, 'schritte_stein + Synthese')
    grunts = sorted(glob.glob(os.path.join(SRC, '30826__*', '*paingrunts*.wav')))
    screams = sorted(glob.glob(os.path.join(SRC, '30826__*', '*deathscream*.wav')))

    def voice(path):
        p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True)
        x = np.frombuffer(p.stdout, dtype=np.float32).copy()
        return trim(x / (np.abs(x).max() + 1e-9), -40, -50)
    save('fallschaden', mix((thump(70, 35, 0.2), 0, 1), (filt(pitch(stone[0], 0.75), lp=2500), 0, 0.9), (voice(grunts[3]), 0.05, 0.7)), -3, 'schritte_stein + MrFossy (CC0)')
    for i in (1, 2, 3):
        save(f'koerperfall_{i}', mix((thump(58 + i * 4, 33, 0.22), 0, 1), (filt(noise(0.28) * env(0.28, 0.003, 0.12), lp=320), 0, 0.8), (rustle(0.3), 0.04, 0.3)), -4)
    for i in range(1, 7):
        save(f'kleidung_{i}', rustle(rng.uniform(0.22, 0.42), rng.uniform(50, 90)), -12)
    save('kleidung_lang', rustle(0.8, 55), -12)
    for i in (1, 2):
        g = mix((rustle(0.3, 40), 0, 0.5), *[(metal_ring(rng.uniform(2500, 4200), 0.08, 3), rng.uniform(0.02, 0.25), 0.25) for _ in range(4)])
        save(f'ausruestung_{i}', g, -12)

    # ---- Treffer & Einschläge ----
    stab = trim(load('179222'))
    body = filt(seg(stab, 0, 0.35), lp=2200)
    for i, f in enumerate((0.9, 1.0, 1.12), 1):
        save(f'treffer_koerper_{i}', mix((pitch(body, f), 0, 1), (thump(95, 55, 0.08), 0, 0.8)), -4, 'Mixedupmoviestuff „Knife Stab“ (CC0), bearbeitet')
    for i, f in enumerate((1.0, 1.1), 1):
        save(f'treffer_kopf_{i}', mix((pitch(body, f), 0, 0.9), (click(0.003, 9000, 2500), 0, 0.7), (thump(120, 70, 0.06), 0, 0.6)), -3, 'Mixedupmoviestuff (CC0) + Synthese')
    for i in (1, 2, 3):
        save(f'einschlag_beton_{i}', mix((click(0.003, 12000, 2000), 0, 1), (filt(noise(0.05) * env(0.05, 0.0005, 0.02), lp=8000, hp=1500), 0, 0.8),
                                          (grains(0.25, 16, 7000, 900, 0.09), 0.01, 0.6), (thump(130, 90, 0.05), 0, 0.5)), -4)
        save(f'einschlag_metall_{i}', mix((click(0.002, 14000, 3000), 0, 0.8), (metal_ring(rng.uniform(1400, 2700), rng.uniform(0.25, 0.5)), 0, 0.7)), -4)
        save(f'einschlag_holz_{i}', mix((click(0.003, 7000, 800), 0, 0.9), (filt(noise(0.09) * env(0.09, 0.001, 0.035), lp=1300, hp=280), 0, 1),
                                         (tone(rng.uniform(420, 650), 0.08) * env(0.08, 0.0005, 0.03), 0, 0.6), (grains(0.15, 6, 4000, 600, 0.05), 0.01, 0.4)), -4)
        save(f'einschlag_erde_{i}', mix((filt(noise(0.12) * env(0.12, 0.002, 0.05), lp=900, hp=110), 0, 1), (grains(0.25, 12, 2500, 200, 0.1), 0.01, 0.6), (thump(90, 50, 0.07), 0, 0.5)), -5)
        save(f'truemmer_beton_{i}', grains(0.3, 18, 7000, 900, 0.12), -9)
        save(f'truemmer_erde_{i}', grains(0.3, 14, 2600, 200, 0.12), -10)
    for i in (1, 2):
        save(f'truemmer_metall_{i}', mix(*[(metal_ring(rng.uniform(2500, 5000), 0.12, 3), rng.uniform(0, 0.2), 0.5) for _ in range(5)]), -10)
        save(f'truemmer_holz_{i}', grains(0.25, 10, 3500, 500, 0.1), -10)
    ric = load('30932')
    for i, (a, b) in enumerate(events(ric, -30, 0.12)[:4], 1):
        save(f'querschlaeger_{i}', trim(seg(ric, max(0, a - 0.003), b + 0.35)), -4, f'aust_paul „bullet ricochet“ ({fs})')
    for i in (1, 2, 3):
        save(f'vorbeizischen_{i}', whoosh(rng.uniform(0.22, 0.32), rng.uniform(3200, 4200), rng.uniform(900, 1400), 0.7), -6)
    for i in (1, 2):
        n = np.zeros(int(0.03 * SR), np.float32); k = int(0.0006 * SR)
        n[:k] = 1; n[k:2 * k] = -1
        save(f'ueberschall_{i}', filt(reverb(n, 0.15, 0.4), hp=800), -5)
    save('hitmarker', mix((tone(2400, 0.04) * env(0.04, 0.0005, 0.012), 0, 1), (click(0.002, 12000, 4000), 0, 0.6)), -9)

    # ---- Granaten & Nahkampf ----
    ex = load('613672')
    for i, (a, b) in enumerate(((0.8, 3.2), (3.3, 5.7)), 1):
        boom = trim(seg(ex, a, b))
        rumble = filt(noise(2.2) * env(2.2, 0.02, 1.0), lp=220)
        save(f'explosion_{i}', reverb(mix((boom, 0, 1), (thump(62, 26, 1.1), 0.005, 0.9), (rumble, 0.01, 0.5)), 2.0, 0.3, lp=3000), -1,
             f'unfa „Outdoor Clean Explosions“ ({fs}) + Synthese (Tiefe, Grollen)')
    save('explosion_nachhall', reverb(filt(noise(0.4) * env(0.4, 0.01, 0.2), lp=900), 2.6, 1, lp=1800, wet_only=True) + 0, -8)
    save('granate_stift', mix((metal_ring(4200, 0.1, 3), 0, 0.6), (click(0.003, 9000, 2500), 0, 0.8), (metal_ring(5400, 0.06, 2), 0.06, 0.3)), -9)
    save('granate_wurf', mix((whoosh(0.3, 600, 2200), 0, 1), (rustle(0.2), 0, 0.4)), -9)
    for i in (1, 2, 3):
        save(f'granate_aufprall_{i}', mix((metal_ring(rng.uniform(1700, 2600), 0.18, 4, 0.7), 0, 0.6), (thump(160, 90, 0.05), 0, 0.7), (click(0.002, 9000, 1500), 0, 0.6)), -6)
    hiss = lambda sec: filt(noise(sec), lp=8500, hp=1100)
    save('rauch_start', mix((hiss(0.9) * np.linspace(0, 1, int(0.9 * SR)).astype(np.float32) ** 0.5, 0, 1), (click(0.006, 6000, 800), 0, 0.8)), -9)
    save('rauch_loop', loopify(am(hiss(9.0), 0.6, 0.25), 1.0), -11, loop=True)
    save('rauch_ende', hiss(1.2) * np.linspace(1, 0, int(1.2 * SR)).astype(np.float32) ** 1.5, -11)
    for i, (sec, f0, f1) in enumerate(((0.2, 700, 2600), (0.24, 500, 2000), (0.18, 900, 3200)), 1):
        save(f'messer_schwung_{i}', whoosh(sec, f0, f1), -8)
    for i, f in enumerate((1.0, 0.92, 1.08), 1):
        save(f'messer_stich_{i}', pitch(stab, f), -3, 'Mixedupmoviestuff „Knife Stab“ (CC0)' + ('' if f == 1.0 else ', Variante'))
    save('messer_ziehen', mix((scrape(0.32, 3000, 9000), 0, 0.8), (metal_ring(3600, 0.25, 3), 0.28, 0.15)), -9)
    save('messer_weg', mix((scrape(0.22, 2500, 8000, False), 0, 0.7), (click(0.004, 6000, 1200), 0.2, 0.6)), -10)
    for i in (1, 2):
        save(f'kolbenschlag_{i}', mix((thump(115, 70, 0.09), 0, 1), (pitch(body, 0.85 + 0.15 * i), 0, 0.7), (click(0.003, 6000, 900), 0, 0.5)), -4, 'Mixedupmoviestuff (CC0) + Synthese')

    # ---- Stimmen ----
    for i, path in enumerate(screams, 1):
        save(f'soldat_tod_{i}', voice(path), -3, f'MrFossy „{os.path.basename(path)[:-4]}“ ({fs})')
    for i, path in enumerate(grunts[:12], 1):
        save(f'schmerz_{i}', voice(path), -4, f'MrFossy „{os.path.basename(path)[:-4]}“ ({fs})')
    for i, path in enumerate(grunts[12:15], 1):
        save(f'anstrengung_{i}', filt(voice(path), lp=5000), -9, f'MrFossy „{os.path.basename(path)[:-4]}“ ({fs})')

    def zombie(path, f, growl, d, lp, verb):
        z = pitch(voice(path), f)
        z = am(z, growl, 0.55)
        z = filt(drive(z, d), lp=lp, hp=90, bands=((260, 4, 1.2),))
        return reverb(z, verb, 0.18, lp=3000)
    zsrc = screams + grunts
    for i, (k, f, gr) in enumerate(((0, 0.66, 31), (3, 0.62, 27), (6, 0.7, 36), (12, 0.6, 24)), 1):
        save(f'zombie_stoehnen_{i}', zombie(zsrc[k], f, gr, 2.6, 2800, 0.6), -4, 'MrFossy (CC0), tiefer gelegt + Knurren + Verzerrung')
    for i, (k, f) in enumerate(((1, 0.82), (8, 0.78)), 1):
        save(f'zombie_angriff_{i}', zombie(zsrc[k], f, 44, 4.0, 4500, 0.4), -3, 'MrFossy (CC0), bearbeitet')
    for i, (k, f) in enumerate(((2, 0.6), (9, 0.58)), 1):
        z = zombie(zsrc[k], f, 14, 2.0, 2200, 0.9)
        save(f'zombie_tod_{i}', z, -3, 'MrFossy (CC0), bearbeitet (Gurgeln)')

    # ---- Menü & Ereignisse ----
    beep = lambda f, sec, kind='sine': tone(f, sec, kind) * env(sec, 0.002, sec * 0.8, 4)
    save('menue_klick', mix((beep(1600, 0.03), 0, 0.8), (click(0.002, 9000, 3000), 0, 0.5)), -12)
    save('menue_auswahl', mix((beep(880, 0.07, 'tri'), 0, 1), (beep(1320, 0.1, 'tri'), 0.06, 1)), -11)
    save('menue_zurueck', mix((beep(1320, 0.07, 'tri'), 0, 1), (beep(880, 0.1, 'tri'), 0.06, 1)), -12)
    save('menue_ausruesten', mix((click(0.004, 7000, 1500), 0, 1), (metal_ring(2900, 0.15, 3), 0.002, 0.15), (whoosh(0.12, 1200, 3000), 0.0, 0.3)), -11)
    save('piep', beep(1000, 0.09), -12)
    save('countdown', beep(880, 0.13, 'tri'), -10)
    save('alarm', mix(*[(beep(700 if k % 2 == 0 else 950, 0.12, 'tri'), k * 0.13, 1) for k in range(4)]), -10)
    save('radar', reverb(tone(1300, 0.6) * env(0.6, 0.002, 0.25), 0.8, 0.3), -12)
    for i in (1, 2, 3):
        notes = rng.choice([988, 1175, 1319, 1568, 1760, 2093], size=rng.integers(2, 5))
        save(f'computer_{i}', mix(*[(beep(float(f), 0.05, 'square'), k * 0.055, 0.6) for k, f in enumerate(notes)]), -14)
    chord = lambda fr, sec, gap: mix(*[(tone(f, sec, 'tri') * env(sec, 0.01, sec * 0.9, 3), k * gap, 0.5) for k, f in enumerate(fr)])
    save('stinger_sieg', reverb(chord([523.3, 659.3, 784.0, 1046.5], 0.9, 0.12), 1.2, 0.3), -6)
    save('stinger_niederlage', reverb(chord([440.0, 349.2, 293.7, 220.0], 1.0, 0.22), 1.4, 0.3), -6)
    save('stinger_unentschieden', reverb(chord([440.0, 440.0 * 1.5], 0.9, 0.25), 1.2, 0.3), -7)
    save('stinger_spawn', reverb(mix((sweep(220, 880, 0.5) * env(0.5, 0.2, 0.4, 2), 0, 0.5), (chord([440, 554.4, 659.3], 0.8, 0.0), 0.45, 1)), 1.0, 0.25), -7)
    save('stinger_zeit', mix(*[(beep(1200, 0.07, 'square'), k * 0.16, 1) for k in range(3)]), -10)

    # ---- Umgebung ----
    wind = filt(noise(21) * 0.5, lp=700, hp=60)
    wind = am(am(wind, 0.09, 0.6), 0.23, 0.35, 1.3)
    save('wind_loop', loopify(wind, 1.0), -14, loop=True)
    for i in (1, 2):
        save(f'wind_boee_{i}', whoosh(3.0, 180, 900, 0.4) * 0.8, -12)
    water = filt(noise(21), lp=4200, hp=500) * 0.25
    for _ in range(700):                          # Gluckern: kurze ansteigende Töne
        L = rng.uniform(0.01, 0.03); f0 = rng.uniform(450, 1300)
        b = sweep(f0, f0 * rng.uniform(1.3, 1.8), L) * np.hanning(int(L * SR)).astype(np.float32) * rng.uniform(0.1, 0.5)
        o = int(rng.uniform(0, 20.9) * SR); water[o:o + len(b)] += b
    save('bach_loop', loopify(water, 1.0), -15, loop=True)
    hum = sum(tone(50 * k, 10.0) * (0.6 / k) for k in (1, 2, 3, 5)) + filt(noise(10.0), lp=300) * 0.15
    save('maschine_loop', hum, -16, loop=True)
    save('stille', np.zeros(int(0.05 * SR), np.float32), -60)


# ----------------------------------------------------------------------------- Zuordnung alt → neu
def V(name, n):
    return [f'./audio/sfx/{name}_{i}.wav' for i in range(1, n + 1)]


def S(name):
    return f'./audio/sfx/{name}.wav'


RIFLE = {'m27': 'schuss_sturmgewehr_1', 'hk416': 'schuss_sturmgewehr_1', 'an94': 'schuss_sturmgewehr_2', 'sa58': 'schuss_sturmgewehr_schwer_1',
         'scar': 'schuss_sturmgewehr_schwer_2', 'saritch': 'schuss_sturmgewehr_3', 'sig556': 'schuss_sturmgewehr_3', 'tar21': 'schuss_sturmgewehr_hell_1',
         'type95': 'schuss_sturmgewehr_hell_2', 'xm8': 'schuss_sturmgewehr_hell_1'}
SNIPER = {'dsr': 'schuss_scharfschuetze_1', 'ballista': 'schuss_scharfschuetze_2', 'svt': 'schuss_scharfschuetze_3', 'as50': 'schuss_scharfschuetze_4'}
PISTOL = {'fiveseven': 'schuss_pistole_1', 'fnp45': 'schuss_pistole_2', 'kard': 'schuss_pistole_3', 'beretta': 'schuss_pistole_4'}


def world_target(k):
    rules = [
        (r'^wpn_(\w+?)_(shot|fire)_plr$', lambda m: S(RIFLE.get(m.group(1)) or SNIPER.get(m.group(1)) or PISTOL.get(m.group(1)) or 'schuss_sturmgewehr_1')),
        (r'^(concrete)_run', V('schritte_stein', 6)), (r'^(concrete)_sprint', V('schritte_beton', 8)),
        (r'^grass_|^snow_run', V('schritte_gras', 6)), (r'^(dirt|sand|mud)_(run|sprint)', V('schritte_kies', 6)),
        (r'^wood_(run|sprint)', V('schritte_holz', 6)), (r'^metal_(run|sprint)', V('schritte_metall', 4)),
        (r'^carpet_', V('schritte_weich', 4)), (r'^(wade|water_run|water_00)', V('schritte_wasser', 4)),
        (r'^(earth|mud_debris|dirt_debris|sand_debris)', V('einschlag_erde', 3)), (r'^(rock_debris|plaster_debris|generic|hit_rock|nuke_2020_debris)', V('einschlag_beton', 3)),
        (r'^(metal_00|metal_debris)', V('einschlag_metall', 3)), (r'^(wood_00|wood_debris)', V('einschlag_holz', 3)),
        (r'^ricochet', V('querschlaeger', 4)), (r'^prj_whizby', V('vorbeizischen', 3)), (r'^crack', V('ueberschall', 2)),
        (r'^(flesh)', V('treffer_koerper', 3)), (r'^head_', V('treffer_kopf', 2)), (r'^(hit_object|imp_rifle_butt|mannequin)', V('kolbenschlag', 2)),
        (r'^hit_flesh_swing|^swing_', V('messer_schwung', 3)), (r'^knife_stab', V('messer_stich', 3)),
        (r'^wpn_knife_draw', S('messer_ziehen')), (r'^wpn_knife_sheath', S('messer_weg')),
        (r'^(explo_|explode_|nuke_2020_explo)', V('explosion', 2)), (r'^(exp_explosion_decay|nuke_2020_aftermath|nuke_build_tail)', S('explosion_nachhall')),
        (r'^(fast_lfe|lfe_00)$', S('tief_gewehr')), (r'(lfe)', S('tief_explosion')), (r'^gren_throw|^nuke_2020_whoosh', S('granate_wurf')), (r'^pin$', S('granate_stift')),
        (r'^smoke_hiss_start', S('rauch_start')), (r'^smoke_hiss_lp', S('rauch_loop')), (r'^smoke_hiss_end', S('rauch_ende')),
        (r'^(bodyfall|heavy_)', V('koerperfall', 3)), (r'^fall_damage', S('fallschaden')), (r'^exert_plr', V('anstrengung', 3)),
        (r'^cloth_set|^fly_heavy_cloth', V('kleidung', 6)), (r'^fly_gear_weight', V('ausruestung', 2)),
        (r'^vox_us_death', V('soldat_tod', 10)), (r'^dry_fire', S('leer_klick')),
        (r'^wpn_assault_away', S('waffe_weg')), (r'^wpn_generic_ads_down', S('zielen_raus')), (r'^wpn_generic_ads', S('zielen_rein')), (r'^wpn_scope_zoom', S('zielfernrohr')),
        (r'^wpn_assault_decay_ext', S('hall_gewehr_aussen')), (r'^wpn_rifle_decay_int', S('hall_gewehr_innen')), (r'^wpn_pistol_decay_ext', S('hall_pistole_aussen')),
        (r'^wpn_assault_dist', V('schuss_fern_gewehr', 2)), (r'^wpn_pistol_dist', V('schuss_fern_pistole', 2)),
        (r'^cac_main_nav', S('menue_klick')), (r'^cac_enter', S('menue_auswahl')), (r'^cac_(exit|cmn_backout)', S('menue_zurueck')), (r'^ui_equip', S('menue_ausruesten')),
        (r'^(evt_mpl_clock_beep|timer_)', S('piep')), (r'^mpl_count_in_beep', S('countdown')), (r'^alert_', S('alarm')), (r'^radar_ping', S('radar')),
        (r'^(comp_blip|future_comp_beep|comm_unit_ring)', V('computer', 3)),
        (r'^mus_loss', S('stinger_niederlage')), (r'^(mus_draw|06_wm_01)', S('stinger_unentschieden')), (r'^mus_mp_spawn', S('stinger_spawn')), (r'^mus_mp_timer', S('stinger_zeit')),
        (r'^(amb_wind|desert|wind_whispy|water_ocean)', S('wind_loop')), (r'^(gust_|short_wind|whistling)', V('wind_boee', 2)),
        (r'^(amb_creek|flow_)', S('bach_loop')), (r'^(amb_machine_run|big_machine)', S('maschine_loop')),
    ]
    for rx, tgt in rules:
        m = re.search(rx, k)
        if m:
            return tgt(m) if callable(tgt) else tgt
    return S('stille')                                    # Hintergrund-Geräte, Fernseher, Boot … (nie oder kaum zu hören)


FOLEY = {
    'fly_assault_bb': S('verschluss_zurueck'), 'fly_assault_bf': S('verschluss_vor'), 'fly_assault_charge': S('verschluss_zurueck'),
    'fly_assault_mag_in': S('magazin_rein'), 'fly_assault_mag_out': S('magazin_raus'),
    'fly_cloth_medium_00': V('kleidung', 4), 'fly_cloth_short_00': V('kleidung', 6), 'fly_heavy_cloth_long_00': S('kleidung_lang'),
    'fly_m14_tap': S('magazin_klopf'), 'fly_m16_button': S('knopf_klick'),
    'fly_pistol_mag_in': S('pistole_magazin_rein'), 'fly_pistol_mag_out': S('pistole_magazin_raus'),
    'fly_pistol_sb': S('pistole_schlitten_zurueck'), 'fly_pistol_sf': S('pistole_schlitten_vor'),
    'fly_sniper_bb': S('repetierer_zurueck'), 'fly_sniper_bd': S('repetierer_runter'), 'fly_sniper_bf': S('repetierer_vor'), 'fly_sniper_bu': S('repetierer_hoch'),
    'fly_sniper_mag_in': S('magazin_rein'), 'fly_sniper_mag_out': S('magazin_raus'),
}
MANIFEST = {   # src/audio.js
    'shot_rifle': S('schuss_sturmgewehr_1'), 'shot_pistol': S('schuss_pistole_1'), 'shot_m27': S(RIFLE['m27']), 'shot_an94': S(RIFLE['an94']),
    'shot_scar': S(RIFLE['scar']), 'shot_fiveseven': S(PISTOL['fiveseven']), 'shot_sa58': S(RIFLE['sa58']), 'shot_saritch': S(RIFLE['saritch']),
    'shot_sig556': S(RIFLE['sig556']), 'shot_type95': S(RIFLE['type95']), 'shot_xm8': S(RIFLE['xm8']), 'shot_tar21': S(RIFLE['tar21']),
    'shot_kard': S(PISTOL['kard']), 'mag_out': S('magazin_raus'), 'mag_in': S('magazin_rein'), 'bolt': S('verschluss_vor'), 'dry_fire': S('leer_klick'),
    'knife': S('messer_ziehen'), 'knife_slash': S('messer_schwung_1'), 'knife_stab': S('messer_stich_1'), 'knife_stab2': S('messer_stich_2'),
    'antigrav_hum': S('maschine_loop'), 'jump': S('sprung'), 'hit_flesh_swing': S('messer_schwung_2'),
    'flesh_02': S('treffer_koerper_1'), 'flesh_03': S('treffer_koerper_2'), 'scope_zoom': S('zielfernrohr'),
}
MANIFEST.update({f'step_c_run_{i}': S(f'schritte_stein_{i + 1}') for i in range(6)})
MANIFEST.update({f'step_c_sprint_{i}': S(f'schritte_beton_{i + 1}') for i in range(5)})
MANIFEST.update({f'step_s_run_{i}': S(f'schritte_kies_{i + 1}') for i in range(3)})
MANIFEST.update({f'step_s_sprint_{i}': S(f'schritte_kies_{i + 1}') for i in range(6)})
MANIFEST.update({f'vox_{i}': S(f'soldat_tod_{i + 1}') for i in range(6)})
EFFECTS = {   # src/cod/weapon-effects.js
    'wpn_m27_shot_plr.wav': S(RIFLE['m27']), 'wpn_an94_shot_plr.wav': S(RIFLE['an94']), 'wpn_sa58_shot_plr.wav': S(RIFLE['sa58']),
    'wpn_saritch_shot_plr.wav': S(RIFLE['saritch']), 'wpn_scar_shot_plr.wav': S(RIFLE['scar']), 'wpn_sig556_shot_plr.wav': S(RIFLE['sig556']),
    'wpn_tar21_shot_plr.wav': S(RIFLE['tar21']), 'wpn_type95_shot_plr.wav': S(RIFLE['type95']), 'wpn_xm8_shot_plr.wav': S(RIFLE['xm8']),
    'wpn_fiveseven_shot_plr.wav': S(PISTOL['fiveseven']), 'wpn_fnp45_fire_plr.wav': S(PISTOL['fnp45']), 'wpn_kard_shot_plr.wav': S(PISTOL['kard']),
    'wpn_beretta_fire_plr.wav': S(PISTOL['beretta']), 'wpn_dsr_fire_plr.wav': S(SNIPER['dsr']), 'wpn_ballista_fire_plr.wav': S(SNIPER['ballista']),
    'wpn_svt_fire_plr.wav': S(SNIPER['svt']), 'wpn_as50_fire_plr.wav': S(SNIPER['as50']),
    'wpn_pistol_decay_ext.wav': S('hall_pistole_aussen'), 'wpn_pistol_decay_int.wav': S('hall_pistole_innen'),
    'wpn_sniper_decay_ext.wav': S('hall_scharfschuetze_aussen'), 'wpn_rifle_decay_int.wav': S('hall_gewehr_innen'),
    'wpn_dsr_fire_lfe.wav': S('tief_scharfschuetze'), 'wpn_assault_decay_ext.wav': S('hall_gewehr_aussen'),
    'wpn_assault_decay_int.wav': S('hall_gewehr_innen'), 'wpn_mp7_fire_lfe.wav': S('tief_gewehr'),
}


def remap():
    def rw(path, fn):
        p = os.path.join(ROOT, path)
        if not os.path.exists(p):
            return
        s = open(p, encoding='utf-8').read()
        s2 = fn(s)
        if s2 != s:
            open(p, 'w', encoding='utf-8', newline='\n').write(s2)
            print('  umgestellt:', path)

    def pack(v):
        return v[0] if isinstance(v, list) and len(v) == 1 else v
    for path in ('audio/world-map.json', 'src/cod/audio/world-map.json'):
        def fw(s):
            j = json.loads(s)
            j['samples'] = {k: pack(world_target(k)) for k in j['samples']}
            return json.dumps(j, ensure_ascii=False, indent=2) + '\n'
        rw(path, fw)
    for path in ('audio/foley-map.json', 'src/cod/audio/foley-map.json', 'src/cod/audio/foley-map.js'):
        def ff(s, js=path.endswith('.js')):
            body = s[s.index('{'):s.rindex('}') + 1]
            j = json.loads(body)
            j['samples'] = {k: pack(FOLEY.get(k, S('stille'))) for k in j['samples']}
            out = json.dumps(j, ensure_ascii=False, indent=2)
            return ('export default ' + out + ';\n') if js else out + '\n'
        rw(path, ff)

    def fm(s):
        for k, v in MANIFEST.items():
            s = re.sub(r"(\['%s',\s*')[^']*(')" % re.escape(k), lambda m: m.group(1) + v + m.group(2), s)
        return s
    rw('src/audio.js', fm)

    def fe(s):
        for old, new in EFFECTS.items():
            s = s.replace(f"'./audio/{old}'", f"'{new}'")
        return s
    rw('src/cod/weapon-effects.js', fe)


def credits():
    lines = ['Spiel-Sounds in audio/sfx/ – erzeugt mit tools/sfx_build.py', '',
             'Aufnahmen: freesound.org, alle Creative Commons 0 (gemeinfrei). Originale liegen in audio/free/ (Liste: audio/free/text.md).',
             'Synthetisch: in tools/sfx_build.py aus Code erzeugt (eigene Arbeit, frei nutzbar).', '']
    for k in sorted(MADE):
        lines.append(f'{k}.wav | {MADE[k]}')
    open(os.path.join(OUT, 'QUELLEN.txt'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--remap', action='store_true', help='Sound-Tabellen des Spiels auf audio/sfx/ umstellen')
    a = ap.parse_args()
    build()
    credits()
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'{len(MADE)} Sounds nach audio/sfx/ ({total / 1e6:.1f} MB)')
    if a.remap:
        remap()
