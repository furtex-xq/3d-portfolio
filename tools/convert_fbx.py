"""Blender: split a Tiny Raid FBX pack into per-model GLB files + thumbnails.
Usage: blender -b --python convert.py -- <fbx> <out_dir> <pack_name>
"""
import bpy, sys, os, json, math, re
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
FBX, OUT, PACK = args[0], args[1], args[2]
os.makedirs(os.path.join(OUT, 'models'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'thumbs'), exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)

# ---- colour / material info from pack json files ----
info = {}
def walk(d, path):
    """Collect {'Model__Part': {color, material, transparency}} from any json layout."""
    if not isinstance(d, dict):
        return
    for k, v in d.items():
        if not isinstance(v, dict):
            continue
        if isinstance(v.get('color'), str):
            info[k if '__' in k else '*__' + k] = v
        elif isinstance(v.get('parts'), dict):
            for pk, pv in v['parts'].items():
                if isinstance(pv, dict) and isinstance(pv.get('color'), str):
                    info[pk if '__' in pk else k + '__' + pk] = pv
            walk(v, k)
        else:
            walk(v, k)
folder = os.path.dirname(FBX)
for fn in os.listdir(folder):
    if fn.endswith('.json'):
        try:
            walk(json.load(open(os.path.join(folder, fn), encoding='utf-8')), '')
        except Exception as e:
            print('json fail', fn, e)

HEX = re.compile(r'^#?[0-9A-Fa-f]{6}$')
def hex2lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]

def has_image(mat):
    return mat and mat.use_nodes and any(n.type == 'TEX_IMAGE' and n.image for n in mat.node_tree.nodes)

def bsdf(mat):
    if not mat.use_nodes:
        mat.use_nodes = True
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            return n
    return None

made = {}
def material_for(obj, mat):
    """Return a material with colour/finish from json (or hex name)."""
    d = info.get(obj.name)
    if d is None and '__' in obj.name:
        d = info.get('*__' + obj.name.split('__', 1)[1])
    if d is None and mat is not None and HEX.match(mat.name):
        d = {'color': mat.name, 'material': 'SmoothPlastic'}
    if d is None:
        return mat
    textured = has_image(mat)
    key = (mat.name if mat else '', d.get('color'), d.get('material'), d.get('transparency', 0), textured)
    if key in made:
        return made[key]
    m = mat.copy() if mat else bpy.data.materials.new(obj.name)
    b = bsdf(m)
    if b:
        rm = (d.get('material') or 'SmoothPlastic')
        if not textured:
            b.inputs['Base Color'].default_value = hex2lin(d['color'])
        rough, metal = 0.55, 0.0
        if rm in ('Metal', 'DiamondPlate', 'CorrodedMetal'): rough, metal = 0.35, 0.85
        elif rm == 'Foil': rough, metal = 0.2, 1.0
        elif rm in ('Glass', 'Ice'): rough = 0.05
        elif rm in ('Fabric', 'Sand', 'Wood', 'WoodPlanks', 'Concrete', 'Slate', 'Grass'): rough = 0.85
        elif rm == 'SmoothPlastic': rough = 0.4
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
        if rm == 'Neon':
            b.inputs['Emission Color'].default_value = hex2lin(d['color'])
            b.inputs['Emission Strength'].default_value = 2.0
        tr = float(d.get('transparency') or 0)
        if tr > 0:
            b.inputs['Alpha'].default_value = max(0.08, 1 - tr)
            try: m.surface_render_method = 'BLENDED'
            except Exception: pass
    made[key] = m
    return m

HIDE = set(filter(None, os.environ.get('HIDE', '').split(',')))
for o in list(bpy.data.objects):
    if o.name in HIDE: bpy.data.objects.remove(o)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    for s in o.material_slots:
        s.material = material_for(o, s.material)

# shrink textures for the web
for img in bpy.data.images:
    if img.size[0] > 1024 or img.size[1] > 1024:
        f = 1024 / max(img.size)
        img.scale(max(1, int(img.size[0] * f)), max(1, int(img.size[1] * f)))

# ---- group objects into models ----
groups = {}
base = os.path.splitext(os.path.basename(FBX))[0].replace('TinyRaid', '')
for o in meshes:
    g = o.name.split('__')[0] if '__' in o.name else base
    groups.setdefault(g, []).append(o)

# ---- render setup ----
scene = bpy.context.scene
for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try:
        scene.render.engine = eng; break
    except Exception:
        pass
try: scene.eevee.taa_render_samples = 32
except Exception: pass
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new('w'); scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.55, 0.62, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.9

cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 50
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
def light(name, kind, energy, rot, size=5):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy
    if kind == 'AREA': ld.size = size
    lo = bpy.data.objects.new(name, ld); scene.collection.objects.link(lo)
    lo.rotation_euler = [math.radians(a) for a in rot]
    return lo
light('key', 'SUN', 3.2, (50, 10, 35))
light('rim', 'SUN', 1.6, (60, 0, 200))

manifest = []
for name, objs in sorted(groups.items()):
    tris = sum(len(o.data.polygons) for o in objs)
    if tris < 20:
        continue
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr, size = (mn + mx) / 2, (mx - mn)
    rad = max(size.length / 2, 1e-4)
    # export
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    slug = (PACK + '-' + name).lower()
    out = os.path.join(OUT, 'models', slug + '.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                              export_apply=True, export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=7, export_image_format='WEBP',
                              export_yup=True, export_cameras=False, export_lights=False)
    # thumbnail
    for o in meshes: o.hide_render = o not in objs
    d = rad / math.tan(cam_data.angle / 2) * 0.95
    dirv = Vector(tuple(float(x) for x in os.environ.get('THUMB_DIR', '0.75,-1.0,0.62').split(','))).normalized()
    cam.location = ctr + dirv * d
    cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam_data.clip_start = d / 100; cam_data.clip_end = d * 10
    scene.render.filepath = os.path.join(OUT, 'thumbs', slug + '.png')
    bpy.ops.render.render(write_still=True)
    manifest.append({'id': slug, 'name': name, 'pack': PACK, 'tris': tris,
                     'kb': round(os.path.getsize(out) / 1024)})
    print('DONE', slug, tris)

mf = os.path.join(OUT, 'manifest_' + PACK + '.json')
json.dump(manifest, open(mf, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
