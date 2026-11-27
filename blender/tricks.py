# Tricks: Winken, Handstand, Hinlegen, Tanz  (+ eigener Besen-Knochen, groesserer Schild)
# Vorher Text, Text.001, Text.002, Text.003 laden (Bootstrap).
import bpy, math
from mathutils import Matrix, Vector, Quaternion
NB = 'Besen_Knochen'
OBJS = ['Besen', 'Minigun', 'Minigun_Laeufe', 'Halterung', 'Muendung', 'Schild', 'Kamera_FP']

def has_bones(act):
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                if any(fc.data_path.startswith('pose.bones') for fc in cb.fcurves):
                    return True
    return False

def setup_bone():
    sc = bpy.context.scene
    if NB not in A.data.bones:
        VL.objects.active = A
        bpy.ops.object.mode_set(mode='EDIT')
        eb = A.data.edit_bones; h = eb['mixamorig:Hips']
        b = eb.new(NB); b.head = h.head.copy(); b.tail = h.tail.copy(); b.roll = h.roll
        b.parent = h.parent; b.use_deform = False
        bpy.ops.object.mode_set(mode='OBJECT')
    nb = A.pose.bones[NB]; nb.rotation_mode = 'QUATERNION'; hb = pb('Hips')
    n = 0
    for act in list(bpy.data.actions):
        if not has_bones(act):
            continue
        A.animation_data.action = act
        s, e = (int(round(x)) for x in act.frame_range)
        for f in range(s, e + 1):
            sc.frame_set(f)
            nb.location = hb.location.copy()
            nb.rotation_quaternion = hb.rotation_quaternion.copy() if hb.rotation_mode == 'QUATERNION' else hb.rotation_euler.to_quaternion()
            nb.scale = hb.scale.copy()
            for p in ('location', 'rotation_quaternion', 'scale'):
                nb.keyframe_insert(p, frame=f)
        n += 1
    A.animation_data.action = bpy.data.actions['Ride']; sc.frame_set(1); VL.update()
    diffs = []
    for name in OBJS:
        o = bpy.data.objects.get(name)
        if o and o.parent == A and o.parent_bone == 'mixamorig:Hips':
            mw = o.matrix_world.copy(); o.parent_bone = NB; VL.update()
            diffs.append((name, round(max(abs(a - b) for ra, rb in zip(mw, o.matrix_world) for a, b in zip(ra, rb)), 5)))
    return n, diffs

def grow_shield():
    sh = bpy.data.objects['Schild']; mw = sh.matrix_world.copy(); mi = mw.inverted()
    W = [mw @ v.co for v in sh.data.vertices]
    lo = Vector([min(w[i] for w in W) for i in range(3)]); hi = Vector([max(w[i] for w in W) for i in range(3)])
    c = (lo + hi) / 2; half = (hi - lo) / 2
    newc = Vector((0, 0.35, 1.12)); newh = Vector((1.05, 1.95, 1.05))
    for v, w in zip(sh.data.vertices, W):
        d = w - c
        v.co = mi @ (newc + Vector((d.x / half.x * newh.x, d.y / half.y * newh.y, d.z / half.z * newh.z)))
    sh.data.update()
    return [round(x, 3) for x in lo], [round(x, 3) for x in hi]

# ---------- Helfer ----------
def wmove(n, d):
    b = pb(n); VL.update(); M = A.matrix_world @ b.matrix; M.translation += d
    b.matrix = A.matrix_world.inverted() @ M; VL.update()

def ikc(r, m, e, T, pole):
    S = wpos(r); E = wpos(m); H = wpos(e)
    a = (E - S).length; b = (H - E).length; v = T - S
    d = max(min(v.length, a + b - 0.002), abs(a - b) + 0.01); u = v.normalized(); T2 = S + u * d
    x = (a * a - b * b + d * d) / (2 * d); hh = math.sqrt(max(a * a - x * x, 0))
    w = Vector(pole); w = (w - u * w.dot(u)).normalized()
    E2 = S + u * x + w * hh
    rotq(r, (E - S).rotation_difference(E2 - S))
    E = wpos(m); H = wpos(e)
    rotq(m, (H - E).rotation_difference(T2 - E))

def arm(side, T, pole): ikc(side + 'Arm', side + 'ForeArm', side + 'Hand', T, pole)
def leg(side, T, pole): ikc(side + 'UpLeg', side + 'Leg', side + 'Foot', T, pole)

def open_hand(side):
    for b in A.pose.bones:
        if b.name.startswith('mixamorig:%sHand' % side) and b.name != 'mixamorig:%sHand' % side:
            b.rotation_quaternion = (1, 0, 0, 0)
    VL.update()

def freeze_stick():
    global S0
    reset_pose(); S0 = seat_point()

def sz(y):       # Oberkante Stiel (fest, unabhaengig von der Huefte)
    return S0.z + (y - S0.y) * math.tan(math.radians(TILT)) + 0.024

def ride():
    make_pose()

def key_cont(f, prev):
    for b in A.pose.bones:
        q = b.rotation_quaternion
        p = prev.get(b.name)
        if p is not None and q.dot(p) < 0:
            b.rotation_quaternion = -q
        prev[b.name] = b.rotation_quaternion.copy()
        b.keyframe_insert('location', frame=f); b.keyframe_insert('rotation_quaternion', frame=f); b.keyframe_insert('scale', frame=f)

def build_custom(name, keys):
    old = bpy.data.actions.get(name)
    if old: bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name); act.use_fake_user = True
    A.animation_data.action = act
    prev = {}
    for f, fn in keys:
        fn(); key_cont(f, prev)
    return act

# ---------- Winken ----------
def wave(ph):
    make_pose(free_right=True, right_arm=[], extra=[('Spine', 'Y', -8), ('Spine1', 'Y', -6)])
    sh = wpos('RightArm')
    arm('Right', sh + Vector((0.26 + 0.13 * ph, 0.14, 0.40)), (0.7, -0.2, -0.4))
    rot('RightHand', 'Y', -18 * ph)
    open_hand('Right')
    rot('Neck', 'Z', -22); rot('Head', 'Z', -10); rot('Head', 'X', 6)

# ---------- Handstand ----------
def handstand(k, tuck=0.0, split=0.0, wob=0.0):
    reset_pose()
    rot('LeftUpLeg', 'X', 95 * tuck); rot('RightUpLeg', 'X', 95 * tuck)
    rot('LeftLeg', 'X', -120 * tuck); rot('RightLeg', 'X', -120 * tuck)
    rot('LeftUpLeg', 'X', split); rot('RightUpLeg', 'X', -split)
    rot('LeftLeg', 'X', -abs(split) * 0.3); rot('RightLeg', 'X', -abs(split) * 0.3)
    rot('Spine', 'X', 8 * k); rot('Neck', 'X', 25 * k); rot('Head', 'X', 10 * k)
    rot('Hips', 'X', -178 * k + wob)
    hy = S0.y + 0.30
    TL = Vector((-0.14, hy, sz(hy) + 0.05)); TR = Vector((0.14, hy, sz(hy) + 0.05))
    a = (wpos('LeftForeArm') - wpos('LeftArm')).length + (wpos('LeftHand') - wpos('LeftForeArm')).length
    shm = (wpos('LeftArm') + wpos('RightArm')) / 2
    want = (TL + TR) / 2 + Vector((0, 0, 0.94 * a))
    wmove('Hips', want - shm)
    arm('Left', TL, (-1, 0, 0)); arm('Right', TR, (1, 0, 0))
    curl(CURL)

# ---------- Hinlegen ----------
def lie(t=0.0):
    reset_pose()
    rot('LeftUpLeg', 'X', 10); rot('LeftLeg', 'X', -14)
    rot('RightUpLeg', 'X', 22); rot('RightUpLeg', 'Y', 12); rot('RightLeg', 'X', -8)
    rot('Spine1', 'X', 3 * math.sin(2 * math.pi * t))
    rot('Hips', 'X', 98)
    hp = wpos('Hips'); want = Vector((0, S0.y + 0.05, sz(S0.y + 0.05) + 0.13))
    wmove('Hips', want - hp)
    rot('Neck', 'X', -32); rot('Head', 'X', -12)
    rot('RightFoot', 'X', 18 * math.sin(2 * math.pi * t * 2))
    hd = wpos('Head')
    arm('Left', hd + Vector((-0.11, -0.07, -0.09)), (-1, 0.2, 0.6))
    arm('Right', hd + Vector((0.11, -0.07, -0.09)), (1, 0.2, 0.6))
    open_hand('Left'); open_hand('Right')

# ---------- Tanz (auf dem Stiel stehend) ----------
def dance(side, b, both=False):
    reset_pose()
    rot('Hips', 'Y', 7 * side)
    rot('Spine', 'Y', -13 * side); rot('Spine1', 'Y', -6 * side); rot('Neck', 'Y', 8 * side); rot('Head', 'X', 10 * b - 4)
    L = (wpos('LeftLeg') - wpos('LeftUpLeg')).length + (wpos('LeftFoot') - wpos('LeftLeg')).length
    yb, yf = S0.y - 0.16, S0.y + 0.26
    want = Vector((0.05 * side, S0.y + 0.05, sz(S0.y + 0.05) + 0.09 + 0.86 * L - 0.06 * b))
    wmove('Hips', want - wpos('Hips'))
    leg('Left', Vector((0, yb, sz(yb) + 0.09)), (-0.3, 1, 0))
    leg('Right', Vector((0, yf, sz(yf) + 0.09)), (0.3, 1, 0))
    up = 'Right' if side > 0 else 'Left'; dn = 'Left' if side > 0 else 'Right'; s = 1 if side > 0 else -1
    if both:
        arm('Left', wpos('LeftArm') + Vector((-0.22, 0.10, 0.48)), (-1, 0, -0.5))
        arm('Right', wpos('RightArm') + Vector((0.22, 0.10, 0.48)), (1, 0, -0.5))
    else:
        arm(up, wpos(up + 'Arm') + Vector((0.30 * s, 0.10, 0.45)), (s, 0, -0.5))
        arm(dn, wpos(dn + 'UpLeg') + Vector((-0.15 * s, 0.03, 0.14)), (-s, -0.4, 0))
    open_hand('Left'); open_hand('Right')

def build_tricks():
    freeze_stick()
    build_custom('Wave', [(1, ride), (8, lambda: wave(-1)), (14, lambda: wave(1)), (20, lambda: wave(-1)),
                          (26, lambda: wave(1)), (32, lambda: wave(-1)), (42, ride)])
    build_custom('Handstand', [(1, ride), (10, lambda: handstand(0.4, tuck=1)), (18, lambda: handstand(0.75, tuck=0.8)),
                               (26, lambda: handstand(1.0, tuck=0.1)), (34, lambda: handstand(1.0, split=20, wob=3)),
                               (44, lambda: handstand(1.0, split=-20, wob=-3)), (54, lambda: handstand(1.0, split=20, wob=2)),
                               (62, lambda: handstand(0.75, tuck=0.8)), (70, lambda: handstand(0.4, tuck=1)), (80, ride)])
    build_custom('LieDown', [(1, ride), (14, lambda: lie(0))] + [(22 + 8 * i, (lambda i=i: lie((i + 1) / 6))) for i in range(6)] + [(78, ride)])
    seq = [(1, ride)]
    for i in range(8):
        sd = 1 if (i // 2) % 2 == 0 else -1
        seq.append((12 + 6 * i, (lambda sd=sd, b=i % 2: dance(sd, b))))
    seq += [(62, lambda: dance(1, 1, both=True)), (68, lambda: dance(-1, 0, both=True)), (80, ride)]
    build_custom('Dance', seq)
    A.animation_data.action = bpy.data.actions['Ride']; bpy.context.scene.frame_set(1)
    return [a.name for a in bpy.data.actions]
