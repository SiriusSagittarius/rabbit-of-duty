import bpy, math
from mathutils import Matrix, Vector

P = r'C:\Users\adm\Desktop\Rabbit of Duty\rabbit-of-duty'
A = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
VL = bpy.context.view_layer

def pb(n):
    return A.pose.bones['mixamorig:' + n]

def wpos(n):
    VL.update()
    return (A.matrix_world @ pb(n).matrix).translation.copy()

def rot(n, axis, deg):
    """Bone um eine WELT-Achse (X/Y/Z) am Gelenk drehen. Blick = +Y, links = -X, oben = +Z."""
    b = pb(n)
    VL.update()
    M = A.matrix_world @ b.matrix
    h = M.translation.copy()
    R = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-h)
    b.matrix = A.matrix_world.inverted() @ (R @ M)
    VL.update()

def reset_pose():
    for b in A.pose.bones:
        b.rotation_mode = 'QUATERNION'
        b.location = (0, 0, 0)
        b.rotation_quaternion = (1, 0, 0, 0)
        b.scale = (1, 1, 1)
    VL.update()

# Winkel (Grad) - zum Feintuning hier aendern
POSE = dict(
    spine=-12, spine1=-8, neck=12, head=8,
    thigh=78, thigh_out=12, knee=-105, foot=25,
    arm_fwd=72, arm_down=38, arm_in=0, fore_in=22, fore_down=0,
)

def make_pose(extra_lean=0.0):
    reset_pose()
    p = POSE
    # Oberkoerper nach vorne
    rot('Spine', 'X', p['spine'] + extra_lean)
    rot('Spine1', 'X', p['spine1'])
    rot('Neck', 'X', p['neck'] - extra_lean * 0.5)
    rot('Head', 'X', p['head'])
    # Beine: Oberschenkel nach vorne + leicht nach aussen, Knie nach hinten
    rot('LeftUpLeg', 'X', p['thigh']);  rot('LeftUpLeg', 'Y', -p['thigh_out'])
    rot('RightUpLeg', 'X', p['thigh']); rot('RightUpLeg', 'Y', p['thigh_out'])
    rot('LeftLeg', 'X', p['knee']);     rot('RightLeg', 'X', p['knee'])
    rot('LeftFoot', 'X', p['foot']);    rot('RightFoot', 'X', p['foot'])
    # Arme: aus T-Pose nach vorne, dann nach unten
    rot('LeftArm', 'Z', -p['arm_fwd']);  rot('RightArm', 'Z', p['arm_fwd'])
    rot('LeftArm', 'X', -p['arm_down']); rot('RightArm', 'X', -p['arm_down'])
    rot('LeftForeArm', 'Z', -p['fore_in']); rot('RightForeArm', 'Z', p['fore_in'])
    rot('LeftForeArm', 'X', -p['fore_down']); rot('RightForeArm', 'X', -p['fore_down'])

def key_all(frame):
    for b in A.pose.bones:
        b.keyframe_insert('location', frame=frame)
        b.keyframe_insert('rotation_quaternion', frame=frame)
        b.keyframe_insert('scale', frame=frame)

def build_ride():
    old = bpy.data.actions.get('Ride')
    if old:
        bpy.data.actions.remove(old)
    if not A.animation_data:
        A.animation_data_create()
    act = bpy.data.actions.new('Ride')
    act.use_fake_user = True
    A.animation_data.action = act
    bpy.context.scene.frame_set(1)
    make_pose(0);  key_all(1)
    make_pose(-4); key_all(21)
    make_pose(0);  key_all(41)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 40
    bpy.context.scene.frame_set(1)
    return act

def mat(name, rgb, rough=0.8):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    return m

def build_broom():
    for n in ('Besen_Stiel', 'Besen_Reisig', 'Besen'):
        o = bpy.data.objects.get(n)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.scene.frame_set(1)
    VL.update()
    hips = wpos('Hips')
    seat = Vector((0, hips.y, hips.z - 0.13))
    hands = (wpos('LeftHand') + wpos('RightHand')) / 2
    grip = Vector((0, hands.y, hands.z - 0.03))
    d = broom_dir(seat, grip)
    L = 1.7
    front = grip + d * 0.25
    back = front - d * L
    center = (front + back) / 2
    q = d.to_track_quat('Z', 'Y')
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.022, depth=L, location=center)
    stick = bpy.context.active_object
    stick.name = 'Besen_Stiel'
    stick.rotation_mode = 'QUATERNION'; stick.rotation_quaternion = q
    stick.data.materials.append(mat('Besen_Holz', (0.30, 0.16, 0.06)))
    bl = 0.5
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.14, radius2=0.035, depth=bl, location=back + d * (bl / 2 - 0.08))
    br = bpy.context.active_object
    br.name = 'Besen_Reisig'
    br.rotation_mode = 'QUATERNION'; br.rotation_quaternion = q
    br.data.materials.append(mat('Besen_Reisig', (0.62, 0.45, 0.16), 1.0))
    bpy.ops.object.select_all(action='DESELECT')
    stick.select_set(True); br.select_set(True)
    VL.objects.active = stick
    bpy.ops.object.join()
    broom = bpy.context.active_object
    broom.name = 'Besen'
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY')
    for c in A.users_collection:
        if broom.name not in c.objects:
            c.objects.link(broom)
    for c in list(broom.users_collection):
        if c not in A.users_collection:
            c.objects.unlink(broom)
    mw = broom.matrix_world.copy()
    broom.parent = A
    broom.parent_type = 'BONE'
    broom.parent_bone = 'mixamorig:Hips'
    VL.update()
    broom.matrix_world = mw
    return broom

def export(name='SoldierBesen.glb'):
    path = P + r'\assets\models\soldier' + '\\' + name
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True)
    return path

def run():
    build_ride()
    build_broom()
    return 'ok'
