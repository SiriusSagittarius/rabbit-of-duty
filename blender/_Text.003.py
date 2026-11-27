# Stillstand-Skript
import bpy, math
from mathutils import Matrix, Vector

def move_hips(lift, pitch):
    b = pb('Hips'); VL.update()
    M = A.matrix_world @ b.matrix
    M.translation.z += lift
    b.matrix = A.matrix_world.inverted() @ M; VL.update()
    if pitch:
        rot('Hips', 'X', pitch)

def mouth_pos():
    VL.update()
    return bpy.data.objects['Mund'].matrix_world.translation + Vector((0, 0.05, -0.03))

def make_pose(extra_lean=0.0, neck_extra=0.0, extra=(), grip=None, free_right=False, right_arm=(),
              free_left=False, left_arm=(), lift=0.0, pitch=0.0, right_target=None, curl_deg=None):
    global TILT
    base_pose(extra_lean)
    if lift or pitch:
        move_hips(lift, pitch)
    if neck_extra:
        rot('Neck', 'X', neck_extra); rot('Head', 'X', neck_extra * 0.5)
    for n, ax, dg in extra:
        rot(n, ax, dg)
    g = dict(GRIP); g.update(grip or {})
    t0 = TILT; TILT = t0 + pitch
    try:
        if free_left:
            for n, ax, dg in left_arm: rot(n, ax, dg)
        else:
            ik_arm('Left', Vector((-g['x'], g['left_y'], stick_z(g['left_y']) + g['up'])))
        if right_target is not None:
            ik_arm('Right', right_target())
        elif free_right:
            for n, ax, dg in right_arm: rot(n, ax, dg)
        else:
            ik_arm('Right', Vector((g['x'], g['right_y'], stick_z(g['right_y']) + g.get('right_up', g['up']))))
    finally:
        TILT = t0
    curl(CURL if curl_deg is None else curl_deg)

def hover(t, k=1.0):
    s = lambda ph=0.0, f=1.0: math.sin(2 * math.pi * f * t + ph)
    return dict(lift=0.04 * s() * k, pitch=2.5 * s(0.8) * k,
                extra=[('Spine1', 'X', 2.0 * s(0, 2) * k),
                       ('LeftLeg', 'X', 8 * s(0.0) * k), ('RightLeg', 'X', 8 * s(1.6) * k),
                       ('LeftFoot', 'X', 6 * s(0.5) * k), ('RightFoot', 'X', 6 * s(2.1) * k),
                       ('Neck', 'Z', 25 * s(0.3) * k), ('Head', 'Z', 10 * s(0.6) * k)])

def merge(a, **b):
    d = dict(a); ex = list(d.get('extra', ())) + list(b.pop('extra', ())); d.update(b); d['extra'] = ex
    return d

H0 = lambda: hover(0)

def build_idle():
    sc = bpy.context.scene
    build_action('Hover', [(1 + i * 6, hover(i / 12)) for i in range(13)])
    up = lambda a, lean: merge(H0(), extra_lean=lean, neck_extra=14, free_left=True, free_right=True, curl_deg=10,
                                left_arm=[('LeftArm', 'X', a), ('LeftArm', 'Y', -15)], right_arm=[('RightArm', 'X', a), ('RightArm', 'Y', 15)])
    build_action('FidgetStretch', [(1, H0()), (14, up(120, 14)), (30, up(140, 22)), (42, up(135, 20)), (60, H0())])
    yawn = lambda nb: merge(H0(), neck_extra=nb, right_target=lambda: mouth_pos(), curl_deg=25)
    build_action('FidgetYawn', [(1, H0()), (12, yawn(12)), (24, yawn(26)), (38, yawn(24)), (48, merge(H0(), neck_extra=6)), (58, H0())])
    tap = lambda u: merge(H0(), neck_extra=-14, extra=[('Neck', 'Z', 10)], grip=dict(right_y=0.62, right_up=u))
    build_action('FidgetTap', [(1, H0()), (8, tap(0.03)), (13, tap(0.14)), (17, tap(0.03)), (22, tap(0.14)), (26, tap(0.03)),
                               (31, tap(0.14)), (35, tap(0.03)), (48, H0())])
    A.animation_data.action = bpy.data.actions['Hover']; sc.frame_set(1)
    return [a.name for a in bpy.data.actions]

print(build_idle())
