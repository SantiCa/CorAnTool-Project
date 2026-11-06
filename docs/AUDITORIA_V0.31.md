# Auditoría de CorAnTool — V0.31 (06-11-2026)

Seis revisores independientes (científico; funcionamiento y pruebas; eficiencia y memoria; interfaz y accesibilidad;
gestión de datos; ingeniería y GitHub) revisaron el repositorio en modo lectura. Los hallazgos de prioridad alta se
comprobaron después en el código. Estado de partida: 70 pruebas JS y 16 de Python correctas (2 omitidas por falta de
`onnx`/`torch`); guardar y volver a abrir un proyecto conserva trazas y píxeles.

**Lo que está bien.** El binning, los índices BI e ii, la interpolación de edad y el conteo con trazas solapadas son
idénticos en Python y JS y coinciden con la literatura. Los módulos de cálculo están separados de la interfaz y
probados. El guardado en IndexedDB es atómico y no se solapa. Electron está bien aislado. Los textos están en las dos
lenguas salvo 3 claves.

## 1. Corregir ya (riesgo de datos o resultados erróneos)

| # | Área | Problema | Arreglo |
|---|------|----------|---------|
| 1 | Datos | Si falla la carga de un proyecto a mitad, queda un proyecto incompleto con el id del original y el siguiente guardado lo sobrescribe (`loadProject`). | Construir el estado aparte y sustituirlo solo si la carga termina; avisar si falla. |
| 2 | Datos | Un guardado programado puede ejecutarse durante una carga (`saveToDB` no mira `loading`; `resetState` no cancela el temporizador). | `if (loading) return` y `clearTimeout(saveTimer)`. |
| 3 | Datos | El formato sigue en `version: 4` aunque V0.20 añadió `stacks`; una versión anterior abriría y estropearía un proyecto con trazas solapadas. | `version: 5`; avisar y abrir en solo lectura si el archivo es más nuevo. |
| 4 | Ciencia | El modelo de edad lee mal la coma decimal (`10,5;3,2`) y toma cualquier 3.ª y 4.ª columna como intervalo de edad (p. ej. sigma y código). | Coma decimal como en los registros; columnas por cabecera; aviso si se pega una tabla de Bacon. |
| 5 | Datos | Los CSV no dicen con qué versión y parámetros se calcularon. | Cabecera `# CorAnTool V0.x, fecha, parámetros` (los lectores ya ignoran `#`). |
| 6 | Datos | Se pueden perder los últimos 1,5 s de cambios al cerrar. | `flushSave()` en `pagehide` y en `before-quit` de Electron. |
| 7 | Seguridad | SheetJS 0.18.5 tiene vulnerabilidades conocidas al abrir Excel ajenos (CVE-2023-30533, CVE-2024-22363). | Pasar a SheetJS ≥ 0.20.2. |
| 8 | Interfaz | La cabecera de la tabla de Datos se descoloca: la regla CSS `.rec` de las tarjetas de registros se aplica también a `<th class="rec">`. | Acotar la regla. |
| 9 | Interfaz | Textos sin traducir que salen como clave: `fig.keepRatio`, `fig.ratioNote`, `geo.cancel`. | Añadirlos. |

## 2. Ciencia y validación (antes de publicar)

- **Evaluación de icnotaxones optimista.** Con menos de 5 secciones se usan pliegues sin agrupar (trazas de la misma
  sección en entrenamiento y prueba); se agrupa por sección, no por sondeo; y el acierto mostrado es el de la misma
  evaluación que elige el modelo. Dejar una sección (o un sondeo) fuera siempre, decir qué esquema se usó y marcar el
  acierto como optimista hasta tener un conjunto reservado.
- **Multiproxy.** Una familia objetivo puede usar como entrada a su familia madre (p. ej. «sapropel» con «baja
  oxigenación»): excluir ancestros y descendientes. El escalado global incluye el sondeo de prueba y los bloques
  contiguos no dejan margen: corregir y matizar en METODOS («nunca mezcla muestras vecinas» es excesivo).
- **Elección del realce sin trazas.** Con ruido sin estructura, «Ecualizado + contraste local» sigue ganando
  (0,71 frente a 0,38 sin realce): el cociente de Fisher solo es invariante a estiramientos lineales. Comparar con la
  imagen sin realce y corregir el texto que dice lo contrario. Con trazas identificadas el criterio es correcto.
- **Detalles.** Cita del ajuste del variograma (el peso n/h² es el de gstat, no el de Cressie 1985); `idwGrid` en
  `geo.js` no se usa y contradice la documentación; Python y JS difieren fuera de rango (−1 frente a vacío).
- **METODOS y documentación desfasados:** la comparación con V2 (≤ 0,56 puntos) solo se prueba en Python; el criterio
  de realce aún se describe como Otsu; el número de pruebas en §13.1 es antiguo; añadir que el intervalo de Bacon se
  interpola entre filas.

## 3. Pruebas y funcionamiento

- **Lo crítico de `app.js` no tiene pruebas:** tijeras, unir, fusión del mismo icnotaxón, deshacer, carga y
  migraciones, exportaciones, importación de registros y de Bacon. Sacarlo a un módulo puro (`edit.js`) y probarlo con
  máscaras sintéticas solapadas.
- **Prueba de extremo a extremo en CI** con el navegador sin pantalla: abrir el sondeo de prueba, detectar, deshacer,
  guardar, recargar y comparar.
- **Errores que no se ven:** `busy()` no captura errores y no hay manejador global; añadir uno que muestre un aviso.
- **Deshacer** tras asignar una clase que fusiona trazas necesita dos pasos; agruparlos en uno.

## 4. Eficiencia y memoria (medido con imágenes sintéticas de 20 MP)

- **La interfaz se congela 1–3 s** al mover filtros (realce con CLAHE ≈ 1,7 s) y al detectar (≈ 2,2 s): todo va en el
  hilo principal. Pasar `applyFilters` y la detección a un Web Worker (son módulos puros).
- **Cada pincelada regenera lienzos a resolución completa** (≈ 80 MB temporales a 20 MP) para la columna lateral y las
  figuras: pintar directamente a la resolución de salida y solo la franja editada.
- **Picos de > 400 MB en la detección** por arrays nuevos en cada paso: reutilizar búferes y limitarse a la zona de
  análisis.
- **El guardado reescribe todo el proyecto** 1,5 s después de cada cambio: guardar por secciones y solo las cambiadas.
- **Kriging** con 100 sondeos y malla 400×300: 2,9 s; factorizar una vez y precalcular (≈ ×n más rápido).
- La tabla de solapes solo crece durante la sesión; el presupuesto de memoria no cuenta lienzos de figuras ni el
  deshacer.

## 5. Interfaz y accesibilidad (WCAG 2.1 AA)

- Deslizadores sin nombre accesible (15); pestañas sin el patrón ARIA (flechas, `tabpanel`); avisos (`#toast`,
  estado de guardado) que un lector de pantalla no anuncia; el texto de ayuda sustituye al nombre visible de algunos
  botones.
- **Atajos de una letra** sin opción para desactivarlos (criterio 2.1.4): ofrecerla en Ayuda o limitarlos al visor.
- **Contraste:** botón de borrar en oscuro (2,3:1), etiquetas de tipo de columna en Datos (2,9–3,9:1), `--warn` sin
  definir y bordes de casillas y chips muy tenues (1,5:1).
- CSS duplicado o contradictorio en varios selectores, 5 bloques para móvil y 49 estilos en línea; objetivos táctiles
  pequeños en móvil.

## 6. Gestión de datos

- Copia automática: hay que reactivarla en cada sesión, solo copia el proyecto abierto y no reintenta; avisar si la
  última copia es antigua y copiar todos los proyectos modificados.
- «Reemplazar» al importar sobrescribe sin copia previa.
- Lectura de CSV frágil: comillas, miles con punto, archivos de Excel en Latin-1, columnas que faltan sin aviso.
- Los mapas de fondo piden teselas a Esri y GEBCO con la zona de estudio: que sea opción explícita y documentada.
- El modelo de visión (DINOv2) no está fijado a una versión: guardar el commit.
- Sin control de cuota de almacenamiento ni rotación del historial diario; comprobar RLE al importar.

## 7. Ingeniería y GitHub

- **Versiones incoherentes:** Python y CITATION.cff en 3.0.0.dev0 (y CITATION aún titulado IchAnTool), app V0.31,
  escritorio 0.1.0. Una sola fuente (0.31.0) y una prueba que lo compruebe. Decidir el nombre en PyPI.
- **Licencia del escritorio** declarada MIT; el proyecto es GPL-3.0.
- **Sin releases desde V0.17:** sin release no hay DOI de Zenodo. Publicar los hitos con un script de release.
- `app.js` tiene ~6300 líneas y 47 variables globales: extraer por pantalla cuando se toque cada zona, sin reescribir.
- Sin linter ni tipado: ESLint y `// @ts-check` en los módulos puros; `ruff` en Python; `pythonpath = ["src"]` en
  pytest.
- CI solo en Ubuntu, sin cobertura ni prueba del archivo offline; Dependabot no configurado; respaldo de librerías por
  CDN sin SRI ni CSP.
- Trabajo directo en `master`: para un autor solo basta con una rama por entrega, un PR propio y exigir que pase el
  CI. Plantillas de incidencias, SECURITY.md y CODE_OF_CONDUCT (JOSS los valora); ampliar CONTRIBUTING.

## Orden propuesto

1. **V0.32 — datos seguros:** puntos 1–9 de la sección 1.
2. **Validación científica:** sección 2, antes de cualquier envío.
3. **Pruebas:** módulo `edit.js` probado y prueba de extremo a extremo en CI.
4. **Rendimiento:** Web Worker para realce y detección; lienzos a resolución de salida.
5. **Publicación:** versiones, licencia, release con DOI, CITATION, comunidad.
6. **Accesibilidad y limpieza de CSS.**
