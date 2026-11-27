# --- Minigun: groesser + wuchtiger + gluehende Laeufe ---
import bpy, math, bmesh
from mathutils import Matrix, Vector, Quaternion

GS = 1.4      # Vergroesserung
GSHIFT = 0.10 # nach vorne schieben (m), damit sie nicht in die Knie ragt

def gun_upgrade():
    show('Ride'); bpy.context.scene.frame_set(1); VL.update()
    gl = bpy.data.objects['Minigun_Laeufe']; gb = bpy.data.objects['Minigun']
    hz = bpy.data.objects['Halterung']; mu = bpy.data.objects['Muendung']
    spin = gl.animation_data.action if gl.animation_data else None
    if gl.animation_data: gl.animation_data.action = None
    VL.update()
    d = broom_dir()
    P = Vector((0, 1.05, stick_z(1.05)))
    M = Matrix.Translation(d * GSHIFT) @ Matrix.Translation(P) @ Matrix.Scale(GS, 4) @ Matrix.Translation(-P)
    for o in (gb, gl, hz, mu):
        o.matrix_world = M @ o.matrix_world
    VL.update()
    src = gl.data.materials[0]
    heat = bpy.data.materials.get('Lauf_Hitze') or src.copy()
    heat.name = 'Lauf_Hitze'
    bs = heat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Emission Color'].default_value = (1.0, 0.32, 0.05, 1)
    bs.inputs['Emission Strength'].default_value = 0.0
    if 'Lauf_Hitze' not in [m.name for m in gl.data.materials if m]:
        gl.data.materials.append(heat)
    hi = [m.name for m in gl.data.materials].index('Lauf_Hitze')
    ys = [v.co.y for v in gl.data.vertices]
    ymin = min(ys)
    n = 0
    for p in gl.data.polygons:
        if p.center.y > ymin + 0.015:
            p.material_index = hi; n += 1
    mat('Gun_Dunkel', (0.035, 0.035, 0.04), 0.35)
    bpy.data.materials['Gun_Dunkel'].node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 1.0
    VL.update()
    mw = gl.matrix_world
    ax = (mw.to_3x3() @ Vector((0, 1, 0))).normalized()
    tip = max((mw @ v.co for v in gl.data.vertices), key=lambda q: q.dot(ax))
    c0 = mw.translation + ax * (tip - mw.translation).dot(ax)
    q = ax.to_track_quat('Z', 'Y')
    parts = []
    for off, r, dep in ((-0.045, 0.078, 0.07), (-0.004, 0.085, 0.016), (-0.086, 0.085, 0.016)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r, depth=dep, location=c0 + ax * off)
        o = bpy.context.active_object; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = q
        o.data.materials.append(bpy.data.materials['Gun_Dunkel']); parts.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    gl.select_set(True); VL.objects.active = gl
    bpy.ops.object.join()
    gl.select_set(False)
    fins = []
    for i in range(5):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.082, depth=0.008, location=c0 - ax * (0.13 + i * 0.03))
        o = bpy.context.active_object; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = q
        o.data.materials.append(bpy.data.materials['Gun_Dunkel']); fins.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in fins: o.select_set(True)
    gb.select_set(True); VL.objects.active = gb
    bpy.ops.object.join()
    gb.select_set(False)
    VL.update()
    mu.matrix_world = Matrix.Translation(c0 + ax * 0.02) @ Matrix.Diagonal(mu.matrix_world.to_scale()).to_4x4()
    VL.update()
    C = gl.matrix_world.translation.copy(); R0 = gl.matrix_world.to_quaternion()
    if spin: bpy.data.actions.remove(spin)
    act = bpy.data.actions.new('MinigunSpin'); act.use_fake_user = True
    gl.animation_data.action = act
    for i in range(9):
        gl.matrix_world = Matrix.Translation(C) @ (R0 @ Quaternion((0, 1, 0), math.radians(45 * i))).to_matrix().to_4x4() @ Matrix.Scale(GS, 4)
        for prop in ('location', 'rotation_quaternion', 'scale'):
            gl.keyframe_insert(prop, frame=1 + i)
    try:
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    for fc in cb.fcurves:
                        for k in fc.keyframe_points: k.interpolation = 'LINEAR'
    except Exception as e:
        print('hinweis', e)
    bpy.context.scene.frame_set(1)
    sh = bpy.data.objects['Schild']; VL.update()
    yv = [(sh.matrix_world @ v.co).y for v in sh.data.vertices]
    y0, y1 = min(yv), max(yv); want = mu.matrix_world.translation.y + 0.15
    if want > y1:
        f = (want - y0) / (y1 - y0)
        S = Matrix.Translation((0, y0, 0)) @ Matrix.Scale(f, 4, Vector((0, 1, 0))) @ Matrix.Translation((0, -y0, 0))
        sh.matrix_world = S @ sh.matrix_world
    VL.update()
    return {'Hitze-Flaechen': n, 'Muendung': tuple(round(v, 2) for v in mu.matrix_world.translation), 'Gun-Groesse': tuple(round(v, 2) for v in gb.dimensions)}

print(gun_upgrade())