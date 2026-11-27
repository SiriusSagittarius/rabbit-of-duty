# --- Flug-Moves: LeanLeft, LeanRight, HoldTight, Roll, Boost, Trick ---
# Braucht die Funktionen aus 'Text' und 'Text.001' (vorher ausfuehren).
import bpy, math
from mathutils import Matrix, Vector, Quaternion

def rotq(n, q):
    b = pb(n); VL.update(); M = A.matrix_world @ b.matrix; h = M.translation.copy()
    b.matrix = A.matrix_world.inverted() @ (Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ M); VL.update()

def ik_arm(side, T, P=None, pole_angle=0):
    S = wpos(side + 'Arm'); E = wpos(side + 'ForeArm'); H = wpos(side + 'Hand')
    a = (E - S).length; b = (H - E).length; v = T - S; d = min(v.length, a + b - 0.002); u = v.normalized(); T2 = S + u * d
    x = (a * a - b * b + d * d) / (2 * d); hh = math.sqrt(max(a * a - x * x, 0))
    sx = -1 if side == 'Left' else 1
    w = Vector((sx * 0.5, -0.1, -0.4)); w = (w - u * w.dot(u)).normalized()
    E2 = S + u * x + w * hh
    rotq(side + 'Arm', (E - S).rotation_difference(E2 - S))
    E = wpos(side + 'ForeArm'); H = wpos(side + 'Hand')
    rotq(side + 'ForeArm', (H - E).rotation_difference(T2 - E))

def make_pose(extra_lean=0.0, neck_extra=0.0, extra=(), grip=None, free_right=False, right_arm=()):
    base_pose(extra_lean)
    if neck_extra:
        rot('Neck', 'X', neck_extra); rot('Head', 'X', neck_extra * 0.5)
    for n, ax, dg in extra:
        rot(n, ax, dg)
    g = dict(GRIP); g.update(grip or {})
    ik_arm('Left', Vector((-g['x'], g['left_y'], stick_z(g['left_y']) + g['up'])))
    if free_right:
        for n, ax, dg in right_arm:
            rot(n, ax, dg)
    else:
        ik_arm('Right', Vector((g['x'], g['right_y'], stick_z(g['right_y']) + g['up'])))
    curl(CURL)

CLAMP = [('LeftUpLeg', 'Y', 10), ('RightUpLeg', 'Y', -10), ('LeftLeg', 'X', -12), ('RightLeg', 'X', -12)]

def lean(sign, k=1.0):   # sign -1 = links, +1 = rechts
    return [('Spine', 'Y', 16 * sign * k), ('Spine1', 'Y', 10 * sign * k), ('Neck', 'Y', -12 * sign * k), ('LeftUpLeg', 'Y', 6 * sign * k), ('RightUpLeg', 'Y', 6 * sign * k)]

WAVE_UP = [('RightArm', 'X', 115), ('RightArm', 'Y', 20)]

def build_moves():
    sc = bpy.context.scene
    build_action('LeanLeft',  [(1, dict(extra=lean(-1))), (13, dict(extra=lean(-1, 1.15))), (25, dict(extra=lean(-1)))])
    build_action('LeanRight', [(1, dict(extra=lean(1))),  (13, dict(extra=lean(1, 1.15))),  (25, dict(extra=lean(1)))])
    tight = lambda k: dict(extra_lean=-18 * k, neck_extra=-10 * k, extra=CLAMP, grip=dict(left_y=0.30, right_y=0.42, up=0.05))
    build_action('HoldTight', [(1, tight(1)), (9, tight(1.1)), (17, tight(1))])
    roll = lambda s: dict(extra_lean=-12, extra=CLAMP + [('Spine', 'Z', 14 * s), ('Spine', 'Y', -16 * s), ('Spine1', 'Y', -10 * s), ('Head', 'Z', -16 * s)], grip=dict(left_y=0.32, right_y=0.44, up=0.05))
    build_action('Roll', [(1, roll(1)), (9, roll(0.6)), (17, roll(1))])
    boost = lambda k: dict(extra_lean=-32 * k, neck_extra=28 * k, extra=[('LeftUpLeg', 'X', -105 * k), ('RightUpLeg', 'X', -105 * k), ('LeftLeg', 'X', 75 * k), ('RightLeg', 'X', 75 * k), ('LeftUpLeg', 'Y', 8), ('RightUpLeg', 'Y', -8)], grip=dict(left_y=0.46, right_y=0.60, up=0.04))
    build_action('Boost', [(1, boost(1)), (7, boost(1.05)), (13, boost(1))])
    wave = lambda a: dict(free_right=True, right_arm=WAVE_UP + [('RightForeArm', 'Y', a)], extra=[('Spine', 'Y', -6), ('Neck', 'Z', 15)])
    build_action('Trick', [(1, {}), (7, wave(25)), (13, wave(-25)), (19, wave(25)), (25, wave(-25)), (31, {})])
    A.animation_data.action = bpy.data.actions['Ride']; sc.frame_set(1)
    return [a.name for a in bpy.data.actions]

def show(name, frame=1):
    A.animation_data.action = bpy.data.actions[name]; bpy.context.scene.frame_set(frame); VL.update()

print(build_moves())
