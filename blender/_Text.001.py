# --- Hexenbesen-Version: weiter hinten sitzen, Haende am Stiel, Hexenbesen, Mund-Punkt, Spuck-Animation ---
import bpy, math, random
from mathutils import Matrix, Vector, Quaternion

exec(bpy.data.texts['Text'].as_string().split('def run')[0])   # Grundfunktionen neu laden

TILT = 8          # Neigung des Besens (Grad, vorne hoch)
SEAT_BACK = 0.55  # wie viel Stiel hinter dem Sitz ist (bis zum Reisig)
SEAT_FRONT = 1.35 # wie viel Stiel vor dem Sitz ist
CURL = 70         # Finger um den Stiel krummen (Grad)
GRIP = dict(left_y=0.42, right_y=0.56, x=0.03, up=0.03, pole_angle=-90)
POSE.update(thigh=62, knee=-95, spine=-24, spine1=-14, neck=24, head=12)

def broom_dir():
    return Vector((0, math.cos(math.radians(TILT)), math.sin(math.radians(TILT))))

def seat_point():
    h = wpos('Hips')
    return Vector((0, h.y, h.z - 0.13))

def stick_z(y):
    s = seat_point()
    return s.z + (y - s.y) * math.tan(math.radians(TILT))

def ik_arm(side, target, pole, pole_angle=-90):
    fa = pb(side + 'ForeArm'); ar = pb(side + 'Arm')
    te = bpy.data.objects.new('IKT_' + side, None); bpy.context.scene.collection.objects.link(te); te.location = target
    pe = bpy.data.objects.new('IKP_' + side, None); bpy.context.scene.collection.objects.link(pe); pe.location = pole
    c = fa.constraints.new('IK'); c.target = te; c.pole_target = pe; c.pole_angle = math.radians(pole_angle); c.chain_count = 2
    VL.update()
    dg = bpy.context.evaluated_depsgraph_get(); Ae = A.evaluated_get(dg)
    ma = Ae.pose.bones[ar.name].matrix.copy(); mf = Ae.pose.bones[fa.name].matrix.copy()
    fa.constraints.remove(c); bpy.data.objects.remove(te); bpy.data.objects.remove(pe)
    VL.update()
    ar.matrix = ma; VL.update(); fa.matrix = mf; VL.update()

def curl(deg):
    for s in ('Left', 'Right'):
        for f in ('Index', 'Middle', 'Ring', 'Pinky'):
            for i in (1, 2, 3):
                n = 'mixamorig:%sHand%s%d' % (s, f, i)
                if n in A.pose.bones:
                    b = A.pose.bones[n]
                    b.rotation_quaternion = b.rotation_quaternion @ Quaternion((1, 0, 0), math.radians(deg))
    VL.update()

base_pose = make_pose

def make_pose(extra_lean=0.0, neck_extra=0.0):
    base_pose(extra_lean)
    if neck_extra:
        rot('Neck', 'X', neck_extra); rot('Head', 'X', neck_extra * 0.5)
    g = GRIP
    ik_arm('Left',  Vector((-g['x'], g['left_y'],  stick_z(g['left_y'])  + g['up'])), Vector((-0.6, 0.1, 0.8)), g['pole_angle'])
    ik_arm('Right', Vector(( g['x'], g['right_y'], stick_z(g['right_y']) + g['up'])), Vector(( 0.6, 0.1, 0.8)), g['pole_angle'])
    curl(CURL)

def build_action(name, keys):
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    if not A.animation_data:
        A.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    A.animation_data.action = act
    for f, kw in keys:
        make_pose(**kw); key_all(f)
    return act

def link_here(o):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    A.users_collection[0].objects.link(o)

def seg(p0, p1, r, verts=6, matname=None):
    v = p1 - p0
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=v.length, location=(p0 + p1) / 2)
    o = bpy.context.active_object
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = v.normalized().to_track_quat('Z', 'Y')
    if matname: o.data.materials.append(bpy.data.materials[matname])
    return o

def build_broom():
    for o in [o for o in bpy.data.objects if o.name.startswith('Besen')]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.scene.frame_set(1); VL.update()
    mat('Besen_Holz', (0.18, 0.09, 0.035), 0.7)
    mat('Besen_Reisig', (0.55, 0.40, 0.14), 1.0)
    mat('Besen_Band', (0.35, 0.05, 0.05), 0.6)
    random.seed(7)
    d = broom_dir(); seat = seat_point()
    side = Vector((1, 0, 0)); up = d.cross(side).normalized() * -1
    parts = []
    back = seat - d * SEAT_BACK; n = 9
    pts = [back + d * ((SEAT_BACK + SEAT_FRONT) * i / n) for i in range(n + 1)]
    pass
    for i in range(n):
        r = 0.024
        parts.append(seg(pts[i], pts[i + 1], r, 8, 'Besen_Holz'))
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=r, location=pts[i + 1])
        k = bpy.context.active_object; k.data.materials.append(bpy.data.materials['Besen_Holz']); parts.append(k)
    p = pts[-1]; dirv = d.copy()
    for i in range(0):
        dirv = Quaternion(side, math.radians(22)) @ dirv
        q = p + dirv * 0.055
        parts.append(seg(p, q, 0.018 - i * 0.002, 8, 'Besen_Holz')); p = q
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=8, radius=0.024, location=p)
    k = bpy.context.active_object; k.data.materials.append(bpy.data.materials['Besen_Holz']); parts.append(k)
    for off in (0.0, 0.08):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.05 - off * 0.1, minor_radius=0.011, major_segments=16, minor_segments=6, location=back - d * off)
        t = bpy.context.active_object; t.rotation_mode = 'QUATERNION'; t.rotation_quaternion = d.to_track_quat('Z', 'Y')
        t.data.materials.append(bpy.data.materials['Besen_Band']); parts.append(t)
    for i in range(90):
        a = random.uniform(0, 2 * math.pi); r0 = math.sqrt(random.random()) * 0.045
        L = random.uniform(0.55, 0.75); flare = 2.6 + random.uniform(-0.4, 0.6)
        off0 = side * math.cos(a) * r0 + up * math.sin(a) * r0
        p0 = back + d * 0.03 + off0
        p1 = back - d * L + off0 * flare + side * math.cos(a) * 0.05 + up * (math.sin(a) * 0.05 - 0.02 * L)
        parts.append(seg(p0, p1, random.uniform(0.004, 0.007), 4, 'Besen_Reisig'))
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    VL.objects.active = parts[0]
    bpy.ops.object.join()
    broom = bpy.context.active_object; broom.name = 'Besen'
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY')
    link_here(broom)
    mw = broom.matrix_world.copy()
    broom.parent = A; broom.parent_type = 'BONE'; broom.parent_bone = 'mixamorig:Hips'
    VL.update(); broom.matrix_world = mw
    broom.select_set(False)
    return broom

def add_mouth():
    o = bpy.data.objects.get('Mund')
    if o:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.scene.frame_set(1); VL.update()
    hm = A.matrix_world @ pb('Head').matrix
    pos = hm.translation + Vector((0, 0.13, 0.06))
    m = bpy.data.objects.new('Mund', None); m.empty_display_type = 'SPHERE'; m.empty_display_size = 0.04
    A.users_collection[0].objects.link(m); m.location = pos; VL.update()
    mw = m.matrix_world.copy()
    m.parent = A; m.parent_type = 'BONE'; m.parent_bone = 'mixamorig:Head'
    VL.update(); m.matrix_world = mw
    return m

def run2():
    sc = bpy.context.scene
    build_action('Spit', [(1, {}), (5, dict(neck_extra=14)), (8, dict(extra_lean=-6, neck_extra=-22)), (14, {})])
    ride = build_action('Ride', [(1, {}), (21, dict(extra_lean=-4)), (41, {})])
    sc.frame_start = 1; sc.frame_end = 40; sc.frame_set(1)
    build_broom()
    add_mouth()
    A.animation_data.action = ride; sc.frame_set(1)
    return 'ok'

print(run2())
