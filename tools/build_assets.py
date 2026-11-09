"""Собирает ассеты сайта.

python tools/build_assets.py <папка_с_blender_build> <папка_All_Works>

- берёт GLB + превью из build (их делает tools/convert_fbx.py в Blender),
  оставляет только модели из списка MODELS, кладёт в assets/models и assets/thumbs;
- сжимает рендеры из архива All_Works в assets/renders (webp, полный размер + миниатюра);
- пишет assets/data.js с описанием всех моделей и рендеров.
"""
import json, os, shutil, sys
sys.stdout.reconfigure(encoding="utf-8")
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD, WORKS = sys.argv[1], sys.argv[2]
A = os.path.join(ROOT, 'assets')

CATS = {
    'chars': 'Персонажи',
    'food': 'Еда и сладости',
    'loot': 'Предметы и лут',
    'wear': 'Аксессуары',
    'home': 'Интерьер',
    'world': 'Окружение',
}

# id: (название, категория)
MODELS = {
    'cat-cat': ('Кот', 'chars'),
    'ant-antcharacter': ('Муравей', 'chars'),
    'spiders-captain': ('Паук-капитан', 'chars'),
    'spiders-chef': ('Паук-повар', 'chars'),
    'spiders-detective': ('Паук-детектив', 'chars'),
    'spiders-granny': ('Паучья бабушка', 'chars'),
    'spiders-madame': ('Паучиха-мадам', 'chars'),

    'items-cake': ('Торт', 'food'),
    'items-donut': ('Пончик', 'food'),
    'items-cookie': ('Печенье', 'food'),
    'items-strawberry': ('Клубника', 'food'),
    'items-gummybear': ('Мармеладный мишка', 'food'),
    'items-candy': ('Конфета', 'food'),
    'items-cheese': ('Сыр', 'food'),
    'items-popcorn': ('Попкорн', 'food'),
    'items-pretzel': ('Крендель', 'food'),
    'items-marshmallow': ('Маршмеллоу', 'food'),
    'items-peanut': ('Арахис', 'food'),
    'items-blueberry': ('Черника', 'food'),
    'items-chip': ('Чипс', 'food'),
    'items-cracker': ('Крекер', 'food'),
    'items-crumb': ('Крошка хлеба', 'food'),
    'items-sugarcube': ('Кубик сахара', 'food'),
    'items-macaroni': ('Макаронина', 'food'),
    'items-chocolatechunk': ('Кусок шоколада', 'food'),
    'items-cereal': ('Хлопья', 'food'),
    'props-breadbasket': ('Корзина с хлебом', 'food'),

    'items-crown': ('Корона', 'loot'),
    'items-coin': ('Монета', 'loot'),
    'items-ring': ('Кольцо с камнем', 'loot'),
    'items-bottlecap': ('Крышка от бутылки', 'loot'),
    'items-button': ('Пуговица', 'loot'),
    'items-legobrick': ('Кубик конструктора', 'loot'),
    'items-matchbox': ('Спичечный коробок', 'loot'),
    'items-thimble': ('Напёрсток', 'loot'),
    'items-kingflag': ('Королевский флаг', 'loot'),
    'items-antegg': ('Муравьиное яйцо', 'loot'),

    'cosmetics-crown': ('Корона-шапка', 'wear'),
    'cosmetics-bow': ('Бантик', 'wear'),
    'cosmetics-headphones': ('Наушники', 'wear'),
    'cosmetics-scarf': ('Шарф', 'wear'),
    'cosmetics-sunglasses': ('Солнечные очки', 'wear'),
    'cosmetics-acorncap': ('Шляпка-жёлудь', 'wear'),
    'cosmetics-thimblehelmet': ('Шлем-напёрсток', 'wear'),
    'cosmetics-wrappercape': ('Плащ из фантика', 'wear'),
    'cosmetics-fangs': ('Клыки', 'wear'),
    'cosmetics-thornspikes': ('Шипы', 'wear'),
    'cosmetics-matchboxpack': ('Рюкзак-коробок', 'wear'),
    'shoes-sneakera': ('Кроссовок', 'wear'),
    'shoes-sneakerb': ('Кроссовок высокий', 'wear'),

    'living-sofa': ('Диван', 'home'),
    'living-guitar': ('Гитара', 'home'),
    'living-plantmonstera': ('Монстера', 'home'),
    'living-plantsnake': ('Сансевиерия', 'home'),
    'living-succulent': ('Суккулент', 'home'),
    'living-clock': ('Часы', 'home'),
    'living-bookshelf': ('Книжный шкаф', 'home'),
    'living-coffeetable': ('Журнальный столик', 'home'),
    'living-floorlamp': ('Торшер', 'home'),
    'living-tv': ('Телевизор', 'home'),
    'living-tvstand': ('Тумба под ТВ', 'home'),
    'living-vase': ('Ваза', 'home'),
    'living-book': ('Книга', 'home'),
    'living-photoframe': ('Фоторамка', 'home'),
    'kitchen-kettle': ('Чайник', 'home'),
    'kitchen-pot': ('Кастрюля', 'home'),
    'kitchen-chair': ('Стул', 'home'),
    'kitchen-diningtable': ('Обеденный стол', 'home'),
    'kitchen-coffeemachine': ('Кофемашина', 'home'),
    'kitchen-fridge': ('Холодильник', 'home'),
    'kitchen-trashbin': ('Мусорное ведро', 'home'),
    'decor-cattree': ('Когтеточка-домик', 'home'),
    'decor-broom': ('Веник', 'home'),
    'decor-dustpan': ('Совок', 'home'),
    'decor-herbrail': ('Полка с травами', 'home'),
    'decor-laundrybasket': ('Корзина для белья', 'home'),
    'decor-pouf': ('Пуф', 'home'),
    'decor-slippers': ('Тапочки', 'home'),
    'decor-utensilholder': ('Подставка для приборов', 'home'),
    'decor-winerack': ('Винная полка', 'home'),
    'decor-dishtowel': ('Кухонное полотенце', 'home'),
    'props-fryingpan': ('Сковорода с яичницей', 'home'),
    'props-mug': ('Кружка', 'home'),
    'props-dishrack': ('Сушилка для посуды', 'home'),
    'props-knifeblock': ('Подставка для ножей', 'home'),
    'props-coffeejar': ('Банка для кофе', 'home'),
    'props-teajar': ('Банка для чая', 'home'),
    'props-sugarjar': ('Сахарница', 'home'),
    'props-saltshaker': ('Солонка', 'home'),
    'props-peppershaker': ('Перечница', 'home'),
    'props-soapdispenser': ('Дозатор мыла', 'home'),
    'props-sponge': ('Губка', 'home'),
    'props-cuttingboard': ('Разделочная доска', 'home'),
    'props-cerealbox': ('Коробка хлопьев', 'home'),
    'props-coatrack': ('Вешалка', 'home'),
    'props-gameconsole': ('Игровая приставка', 'home'),
    'props-soundbar': ('Саундбар', 'home'),
    'catstuff-catbed': ('Лежанка', 'home'),
    'catstuff-catbowls': ('Миски', 'home'),
    'vacuum-robotvacuum': ('Робот-пылесос', 'home'),
    'vacuum-vacuumdock': ('Станция пылесоса', 'home'),

    'anthill-anthill': ('Муравейник', 'world'),
    'nest-queenthrone': ('Трон королевы', 'world'),
    'nest-glowshrooma': ('Светящиеся грибы', 'world'),
    'nest-glowshroomb': ('Жёлтые грибы', 'world'),
    'nest-beetleshell': ('Панцирь жука', 'world'),
    'nest-crumbstore': ('Склад крошек', 'world'),
    'nest-eggpile': ('Кладка яиц', 'world'),
    'nest-larvae': ('Личинки', 'world'),
    'nest-leafgarden': ('Грядка из листьев', 'world'),
    'nest-matcharch': ('Арка из спичек', 'world'),
    'nest-roothanga': ('Корни', 'world'),
    'nest-seedstash': ('Запас семечек', 'world'),
    'nest-soilmounda': ('Холмик земли', 'world'),
    'nest-watercup': ('Крышка с водой', 'world'),
    'nest-cocoons': ('Коконы', 'world'),
    'nest-twiglog': ('Веточка', 'world'),
    'nest-pebblesb': ('Камешки', 'world'),
    'training-endurancestation': ('Тренажёр выносливости', 'world'),
    'training-speedstation': ('Беговое колесо', 'world'),
    'training-strengthstation': ('Силовая станция', 'world'),
    'training-stylestation': ('Станция стиля', 'world'),
    'training-jawsstation': ('Тренажёр челюстей', 'world'),
    'training-titleboard': ('Доска рекордов', 'world'),
}

# Рендеры из архива: (папка, подпись группы, [файлы или None = все], надпись по имени файла)
RENDERS = [
    ('01_Portfolio_4K', 'Коллекции', None),
    ('02_Egg_Collection_20/Renders', 'Яйца питомцев', None),
    ('03_Eggs', 'Яйца питомцев', ['StarterEgg', 'GoldenEgg', 'CrystalEgg', 'MythicEgg', 'GalaxyEgg', 'PumpkinEgg']),
    ('04_Dumbbells', 'Гантели', ['Tiny2kg', 'Small5kg', 'Medium10kg', 'Heavy20kg', 'Iron50kg', 'Gold100kg', 'Platinum200kg',
                                 'Ruby400kg', 'Emerald700kg', 'Sapphire1t', 'Obsidian2t', 'Cosmic5t', 'Quantum10t',
                                 'Infinity25t', 'Pumpkin60t', 'Reaper100t']),
    ('05_Catapults', 'Катапульты', ['Catapult_Wooden', 'Catapult_Stone', 'Catapult_Copper', 'Catapult_Iron',
                                    'Catapult_Gold', 'Catapult_Diamond', 'Catapult_Magma', 'Catapult_Haunted']),
    ('06_Gym', 'Локации', ['gym3_overview', 'gym3_zone1', 'gym3_zone2', 'gym3_zone3', 'gym3_detail']),
    ('07_Lobby', 'Локации', ['lobby_v3_wide', 'lobby_v3_high', 'lobby_v3_floor', 'lobby_v3_windows']),
    ('08_Props', 'Артефакты', ['portfolio_chest', 'portfolio_altar', 'portfolio_crystals', 'portfolio_potions', 'portfolio_sword']),
]

def pretty(name):
    import re
    n = re.sub(r'^\d+_', '', name).replace('portfolio_', '').replace('Catapult_', '').replace('gym3_', 'Gym ').replace('lobby_v3_', 'Lobby ')
    n = n.replace('_', ' ')
    n = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', n)
    n = re.sub(r'(?<=[a-z])(?=\d)', ' ', n)
    return n[:1].upper() + n[1:]

def crop_thumb(src, dst, size=480):
    im = Image.open(src).convert('RGBA')
    bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if bb:
        im = im.crop(bb)
    w, h = im.size
    side = int(max(w, h) * 1.12)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2))
    canvas.resize((size, size), Image.LANCZOS).save(dst, 'WEBP', quality=86, method=6)

def main():
    for d in ('models', 'thumbs', 'renders'):
        p = os.path.join(A, d)
        shutil.rmtree(p, ignore_errors=True)
        os.makedirs(p)
    stats = {}
    for fn in os.listdir(BUILD):
        if fn.startswith('manifest_'):
            for m in json.load(open(os.path.join(BUILD, fn), encoding='utf-8')):
                stats[m['id']] = m
    models = []
    for mid, (name, cat) in MODELS.items():
        if mid not in stats:
            print('нет модели', mid); continue
        shutil.copy(os.path.join(BUILD, 'models', mid + '.glb'), os.path.join(A, 'models', mid + '.glb'))
        crop_thumb(os.path.join(BUILD, 'thumbs', mid + '.png'), os.path.join(A, 'thumbs', mid + '.webp'))
        models.append({'id': mid, 'name': name, 'cat': cat, 'tris': stats[mid]['tris'], 'kb': stats[mid]['kb']})

    renders = []
    for folder, group, only in RENDERS:
        src = os.path.join(WORKS, folder)
        names = only or sorted(os.path.splitext(f)[0] for f in os.listdir(src) if f.endswith('.png'))
        for n in names:
            im = Image.open(os.path.join(src, n + '.png')).convert('RGB')
            rid = (folder.split('/')[0][:2] + '-' + n).lower()
            big = im.copy(); big.thumbnail((1920, 1920), Image.LANCZOS)
            big.save(os.path.join(A, 'renders', rid + '.webp'), 'WEBP', quality=82, method=6)
            sm = im.copy(); sm.thumbnail((640, 640), Image.LANCZOS)
            sm.save(os.path.join(A, 'renders', rid + '-s.webp'), 'WEBP', quality=78, method=6)
            renders.append({'id': rid, 'group': group, 'name': pretty(n), 'w': big.size[0], 'h': big.size[1]})
            print('render', rid)

    with open(os.path.join(A, 'data.js'), 'w', encoding='utf-8') as f:
        f.write('// Сгенерировано tools/build_assets.py\n')
        f.write('export const CATS = ' + json.dumps(CATS, ensure_ascii=False) + ';\n')
        f.write('export const MODELS = ' + json.dumps(models, ensure_ascii=False) + ';\n')
        f.write('export const RENDERS = ' + json.dumps(renders, ensure_ascii=False) + ';\n')
    print(len(models), 'моделей,', len(renders), 'рендеров')

main()
