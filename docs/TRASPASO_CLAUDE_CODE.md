# Traspaso a Claude Code (01-11-2026)

> Nota histórica de V28/V29. Desde V30 (05-11-2026), leer primero `CLAUDE.md` y
> `docs/COORDINACION_IA.md` para el turno de edición y el traspaso vigente.

Estado del proyecto al pasar de la conversación de claude.ai a Claude Code. Léelo junto con `CLAUDE.md`
(reglas) y `docs/HISTORIAL_VERSIONES.md` (qué se hizo en cada entrega).

## Estado
- Última entrega: **V0.1** (`DELIVERY` en `app/js/app.js`; aplicación 2.3 y programa de escritorio; imágenes en disco, resolución por sección, intervalo en cm).
- Pruebas: `npm test` (44, Node) y `pytest` (9, Python). Deben pasar antes de cada commit.
- Rama de trabajo: `master`. Remoto: `https://github.com/SantiCa/CorAnTool-Project.git` (público; antes IchAnTool-Project, GitHub redirige).

## Cómo ejecutar
- App en local: desde la raíz, `python -m http.server 8765` y abrir `http://localhost:8765/app/`.
- Archivo sin conexión: `python tools/build_standalone.py` → `dist/CorAnTool_V<n>.html` (`dist/` no se sube a git).
- Programa de escritorio: `cd desktop && npm ci && npm start` (probar) o `npm run dist` (instaladores del sistema actual).
  Las descargas de GitHub se generan al subir la etiqueta `V0.<n>`.
- Publicaciones en Word y LaTeX: `python tools/export_publications.py` (necesita pandoc).
- Python: `pip install -e ".[dev]"` (incluye pytest, openpyxl y matplotlib) y `pytest`.

## Datos privados
- El repositorio no contiene datos ni resultados inéditos del autor. No subir nunca datos privados.

## Estructura clave
- `app/js/app.js` (~4 650 líneas, interfaz y lógica de la página). Módulos puros sin DOM: `core.js`, `imageproc.js`,
  `learn.js` (icnotaxones), `log.js` (columna compuesta), `geo.js` (multiproxy, clasificadores, red neuronal, mapas),
  `interp.js` (interpolación), `plot.js` (gráficos), `sheet.js` (hoja de cálculo); `storage.js`, `i18n.js` (textos
  es/en: los bloques añadidos al final sobrescriben a los anteriores).
- `tools/build_standalone.py` concatena los módulos en el orden `ORDER` y comprueba que no se repitan nombres.

## Pendiente (por prioridad sugerida)
0. (V0.17) Probar en Windows/macOS el entrenamiento en escritorio (instalación CUDA, GPU de Apple) y el modelo DINOv2 real.
0. (V0.15) U-Net: entrenar con testigos reales; métodos clásicos en Python para la comparación del artículo 2; clic asistido (SAM) y textura para icnotaxones. Ver `docs/HISTORIAL_VERSIONES.md` V0.15.
1. Dividir `app.js` en módulos (pantalla inicial, sección/bioturbación, columna, datos, multiproxy, clasificadores,
   mapas, figuras) sin cambiar el comportamiento; añadirlos a `ORDER`.
2. Nombres de columna fijos al desplazar en vertical las curvas (Columna y Multiproxy).
3. Importación de datos unificada; modelo de edad dentro del diálogo del sondeo.
4. ~~Imágenes en disco cargadas por sección~~ (hecho en V0.1); fuentes incrustadas.
5. Mapa de varianza del kriging; importancia de variables por permutación (también para la red neuronal).
6. Evitar sesgo de selección de modelo: opción de reservar sondeos para una prueba final independiente.

## Primera petición sugerida en Claude Code
«Lee CLAUDE.md y docs/TRASPASO_CLAUDE_CODE.md, ejecuta las pruebas y arranca la app en local para comprobar que
todo funciona.»
