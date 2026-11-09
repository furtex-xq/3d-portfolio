# 3D-портфолио nochevvsky

Сайт-визитка с 3D-моделями для Roblox: https://furtex-xq.github.io/3d-portfolio/

- `index.html`, `style.css`, `app.js` — сам сайт (three.js с CDN, без сборки).
- `assets/models/*.glb` — модели (Draco), `assets/thumbs` — превью, `assets/renders` — рендеры.
- `assets/data.js` — список моделей и рендеров, генерируется скриптом.

## Как добавить модели

1. Экспорт FBX-пака в GLB + превью (Blender 5.2):
   `blender -b --python tools/convert_fbx.py -- <pack.fbx> <build_dir> <pack_name>`
2. Добавить id модели с названием и категорией в `MODELS` в `tools/build_assets.py`.
3. `python tools/build_assets.py <build_dir> <папка All_Works>` — пересоберёт `assets/`.
