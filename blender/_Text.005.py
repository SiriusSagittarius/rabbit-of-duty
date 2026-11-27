from mathutils import Euler
def add_fp_cam():
    o = bpy.data.objects.get('Kamera_FP')
    if o: bpy.data.objects.remove(o, do_unlink=True)
    show('Ride'); bpy.context.scene.frame_set(1); VL.update()
    mu = bpy.data.objects['Mund'].matrix_world.translation.copy()
    E = mu + Vector((0, -0.05, 0.07))
    e = bpy.data.objects.new('Kamera_FP', None); e.empty_display_type = 'ARROWS'; e.empty_display_size = 0.05
    A.users_collection[0].objects.link(e); e.location = E; VL.update()
    mw = e.matrix_world.copy(); e.parent = A; e.parent_type = 'BONE'; e.parent_bone = 'mixamorig:Hips'; VL.update(); e.matrix_world = mw
    return tuple(round(v, 3) for v in E)

def fp_preview(pitch=-12, lens=18, hide_head=True):
    VL.update()
    E = bpy.data.objects['Kamera_FP'].matrix_world.translation.copy()
    if hide_head:
        pb('Head').scale = (0.001, 0.001, 0.001); VL.update()
    bpy.data.objects['Schild'].hide_set(True)
    f = Vector((0, math.cos(math.radians(pitch)), math.sin(math.radians(pitch))))
    for a in bpy.context.screen.areas:
        if a.type == 'TEXT_EDITOR':
            a.type = 'VIEW_3D'
    for a in bpy.context.screen.areas:
        if a.type == 'VIEW_3D':
            sp = a.spaces.active; r = sp.region_3d
            sp.lens = lens; sp.clip_start = 0.01; sp.shading.type = 'MATERIAL'
            sp.overlay.show_overlays = False
            r.view_perspective = 'PERSP'
            r.view_rotation = Euler((math.radians(90 + pitch), 0, 0)).to_quaternion()
            r.view_distance = 0.3
            r.view_location = E + f * 0.3
    return tuple(round(v, 3) for v in E)

