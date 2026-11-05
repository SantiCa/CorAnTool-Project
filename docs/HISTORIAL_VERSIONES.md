# Historial de versiones de CorAnTool (antes IchAnTool)

Este documento recoge **qué se hizo, qué cambió y por qué** en cada versión del proyecto.
Cada entrega lleva un número **V**. Hasta la V33 se numeraron V1, V2, … V33. **Desde el 05-11-2026 la
numeración es V0.<n>**: la V33 pasa a ser la **V0.1** (primera release publicada) y las siguientes
entregas son V0.2, V0.3… La V1 se reserva para cuando Santiago considere el programa completamente
funcional. La tabla relaciona cada número con la versión interna de cada componente.

Cómo se lee cada versión:
- **Qué se hizo**: resumen en una frase.
- **Cambios**: lista de cambios concretos.
- **Por qué**: motivo de los cambios.
- **Comprobación**: cómo se verificó que funciona.
- **Pendiente o problemas conocidos**.

La descripción detallada de los algoritmos está en
[DOCUMENTACION_TECNICA.md](DOCUMENTACION_TECNICA.md).

## Resumen

| V | Fecha | Componente y versión interna | Qué se hizo |
|---|-------|------------------------------|-------------|
| V1 | mayo–ago 2019 | Interfaz tkinter (`legacy/v2.1_gui`) | Primer programa con interfaz gráfica y herramientas auxiliares |
| V2 | oct 2019 | Script de consola 2.1 (`legacy/v2.1_console`) | Versión usada en el artículo de 2020 |
| V3 | 30-10-2026 | Paquete Python `ichantool` 3.0.0.dev0 | Reorganización como paquete profesional + carpeta de publicaciones |
| V4 | 30-10-2026 | Aplicación web 0.1 (`app/`) | Aplicación en el navegador con detección, edición y aprendizaje |
| V5 | 30-10-2026 | Documentación | Historial de versiones, documentación técnica y defensa de métodos |
| V6 | 30-10-2026 | Aplicación web 0.1, archivo único | `IchAnTool.html` que se abre con doble clic, sin servidor ni conexión |
| V8 | 31-10-2026 | Aplicación web 0.3 | Ajustes de realce de artículos recientes (Dorador et al. 2014 completo, CLAHE de Miguez-Salas et al. 2019), K-medias, ajustes propios, copias de seguridad |
| V7 | 31-10-2026 | Aplicación web 0.2 | Carpetas de proyecto, registro compuesto del sondeo (profundidad/edad), registros externos, sondeo de prueba IODP U1385I |
| V9 | 31-10-2026 | Aplicación web 0.4 | Herramienta de geoquímica: muchos sondeos y proxies, etiquetas por intervalos y reglas, aprendizaje automático configurable, mapas por edad, superposición con el registro icnológico |
| V10 | 31-10-2026 | Aplicación web 0.5 | «Geoquímica» pasa a «Multiproxy»: cualquier registro numérico, capas de intervalos descritos con subdivisiones (litología, turbiditas…), editables e importables, usadas por el clasificador automático de intervalos |
| V11 | 31-10-2026 | Aplicación web 0.6 | Modo claro/oscuro, prueba de la autoclasificación con coloreado de registros, sondeos reales de la tesis (ODP 977A, ODP 976, GP03, LC10) precargados; la rama pasa a `master` |
| V12 | 31-10-2026 | Aplicación web 0.7 | Selección de varias trazas y asignación conjunta; sin saltos ni zoom al asignar; elección automática del ajuste por separabilidad; datos propios de la tesis en Multiproxy (privados); valores que faltan; guía del modo |
| V13 | 31-10-2026 | Aplicación web 0.7.1 | Selección por recuadro arrastrando y Mayús/Ctrl+clic; exclusión de zonas con rectángulo |
| V14 | 31-10-2026 | Aplicación web 0.8 | Reestructuración: pantalla inicial con todos los proyectos y mapa multiproyecto; proyectos con varios sondeos; pestaña Datos (tabla, columnas calculadas y manuales, hoja libre); ventanas sincronizadas y panel flotante; Figuras |
| V15 | 31-10-2026 | Aplicación web 0.9 | Mapas personalizables: fondo (simple, físico, relieve, topográfico, batimétrico, GEBCO, foto aérea, foto aérea + batimetría), símbolo, tamaño, etiquetas, colores, retícula, escala y norte; zoom con rueda, arrastre y extensión editable |
| V16 | 31-10-2026 | Aplicación web 1.0 | Nombre CorAnTool (antes IchAnTool); todos los sondeos de la carpeta de la tesis (GP14, LC21, LC01, LC05, LC06, LC12, LC14, LC20) y más foraminíferos (GP03, LC21) |
| V17 | 31-10-2026 | Aplicación web 1.1 | Pestaña «Todos los proyectos» con análisis multiproyecto (Multiproxy, Datos y Figuras con sondeos de varios proyectos); tres modelos de icnotaxones (sondeo, proyecto, todos) guardados y probabilidad de cada icnotaxón por modelo |
| V18 | 31-10-2026 | Aplicación web 1.2 | Diálogo «Modelos y entrenamiento»: guía para no especialistas, k-NN / Random Forest / Bayes con parámetros, evaluación de 3 métodos × 3 modelos con recomendación, galería de ejemplos (excluir, quitar) y ejemplos de otros proyectos |
| V19 | 31-10-2026 | Aplicación web 1.3 | Proyecto de entrenamiento con 7 sondeos sintéticos del Mediterráneo e imagen con trazas, carteles de ayuda por pestaña y recorrido guiado de 25 pasos |
| V20 | 31-10-2026 | Aplicación web 1.4 | Paneles laterales sin cortes; mapa con 7 métodos de interpolación (IDW, vecino, triangulación, curvatura mínima, RBF, kriging, media móvil), isolíneas, celdas ajustables, solo mar/tierra, escalas y barra de color, lista de sondeos, proyecciones, mapa ampliable y PNG a la resolución elegida |
| V21 | 31-10-2026 | Aplicación web 1.6 | Gráficos tipo Grapher en Datos: registros estratigráficos multipanel y XY con eje Y2, ejes log/invertidos, 6 tipos de serie, ajustes de curva con ecuación y R², estadística y exportación |
| V22 | 31-10-2026 | Aplicación web 1.7 | Revisión de un concilio de 3 agentes (métodos, usabilidad, interfaz y código): evaluación sin inflar, validación por sección e intervalos descritos, mapas solo con datos reales y distancias en km, nombres coherentes, confirmaciones, atajos seguros, pantalla inicial y contraste |
| V23 | 31-10-2026 | Aplicación web 1.8 | Pantalla inicial genérica (todos los proyectos como tarjetas, sin acceso propio de la tesis), sondeos presentes en varios proyectos, paneles laterales redimensionables u ocultables y mapa redimensionable arrastrando sus bordes |
| V24 | 31-10-2026 | Aplicación web 1.8.1 | Los análisis entre proyectos dejan de aparecer como proyectos: se guardan y abren desde la pestaña «Entre proyectos» |
| V25 | 31-10-2026 | Aplicación web 1.9 | Multiproxy más ordenado: panel compacto con resumen por paso, ayuda al pasar el ratón en todo el modo, cursor que lee todos los valores, columnas desplazables y redimensionables con nombres en dos líneas (también en Columna), clase elegida en la barra de curvas, clic para editar intervalos y borrado de clases con confirmación |
| V26 | 01-11-2026 | Aplicación web 2.0 | Multiproxy rehecho en torno a familias de intervalos y clasificadores: clasificación manual arrastrando en la columna de cualquier familia y sondeo, varios clasificadores definidos por el usuario (qué clasifican, con qué datos, qué modelo), red neuronal (perceptrón multicapa) y comparación de modelos |
| V27 | 01-11-2026 | Aplicación web 2.0.1 | Barra de progreso del entrenamiento (con tiempo restante y Cancelar) y número de versión visible en el programa y en el nombre del archivo descargable |
| V28 | 01-11-2026 | Documentación | Nota de traspaso a Claude Code (estado, cómo ejecutar, datos privados, pendientes) |
| V29 | 01-11-2026 | Publicaciones | Cartera de publicaciones actualizada (5 trabajos, estado y orden), métodos y defensa reorganizados, borradores 4 y 5, y exportación del dossier a Word y LaTeX |
| V30 | 05-11-2026 | Coordinación de desarrollo | Instrucciones de Codex, protocolo compartido con Claude y ámbitos de chat; etiqueta de entrega actualizada |
| V31 | 05-11-2026 | Aplicación 2.1 y programa de escritorio | Recorte de imágenes al importar, triángulos Start/End, ocultar zonas excluidas en la columna, arranque limpio sin proyectos precargados, programa de escritorio para Windows, macOS y Linux con descargas en GitHub |
| V0.7 | 05-11-2026 | Aplicación 2.7 | Figura de trazas: varias versiones de cada traza lado a lado (tratada, original, solo la traza, silueta, contorno…) y escala configurable |
| V0.6 | 05-11-2026 | Aplicación 2.6.1 | Ancho y formato del eje de cada columna de la derecha (bioturbación, icnotaxones, BI, ii, registros) |
| V0.5 | 05-11-2026 | Aplicación 2.6 | Estilo configurable de la columna y su figura; indicadores de trazas (flecha, triángulo…) con leyenda y manejo de etiquetas que se tocan |
| V0.4 | 05-11-2026 | Aplicación 2.5 | Intervalos sin datos (excluidos o con pocos píxeles válidos) como SIN DATOS en vez de 0; opción para ampliar esas zonas |
| V0.3 | 05-11-2026 | Aplicación 2.4.1 | Columna y figuras combinan marcas de identificación con bioturbación, icnotaxones, BI e ii |
| V0.2 | 05-11-2026 | Aplicación 2.4 | Importación arreglada en el programa de escritorio; imágenes siempre en un proyecto y un sondeo elegido; ocultar icnotaxones al interpretar; figuras con ventana de profundidad, columnas, registros y anchura con o sin proporción; más fluidez |
| V33 = V0.1 | 05-11-2026 | Aplicación 2.3 (release V0.1) | Imágenes en disco y en memoria solo al usarlas; resolución completa guardada y resolución de trabajo cambiable por sección; recorte sin perder resolución; intervalo de análisis en cm |
| V32 | 05-11-2026 | Aplicación 2.2 | Modo identificación (marcas de trazas sin cuantificar, triángulos y lista de icnotaxones por tramo en la columna), leyenda de icnotaxones en columna y figuras, figura de secciones lado a lado (original, tratada, trazas, flechas…) y gráfico de distribución de icnotaxones |

---

## V1 — Interfaz gráfica (mayo–agosto 2019)

**Qué se hizo.** Primer programa con ventana (tkinter) para analizar imágenes de testigos.

**Cambios.**
- `Program.py`: ventana principal con menú de herramientas.
- `Bioturbation.py`: abre una imagen tratada, cuenta píxeles de bioturbación y crea hojas Excel
  (openpyxl). Permite procesar una carpeta completa de imágenes.
- `AgeConverter.py`: convierte profundidad a edad con un modelo de edad (ejemplo con los datos de
  Martrat et al., 2004, en `Datos/martrat2004_AgeSST.xlsx`).
- `Data_Equalicer.py`: iguala series de datos con distinto espaciado.
- `Excelmerger.py`: une varios archivos Excel.

**Por qué.** Facilitar el uso a investigadores sin experiencia en programación.

**Comprobación.** Uso propio durante la tesis.

**Problemas conocidos.** Variables globales, cálculos píxel a píxel (lentos), dependiente de
Excel, sin pruebas automáticas.

---

## V2 — Script de consola 2.1 (octubre 2019)

**Qué se hizo.** Script de 129 líneas (`IchAnTool.py`) que calcula el porcentaje de bioturbación
y los índices BI e ii. Es la versión descrita en Casanova-Arenillas et al. (2020) y archivada en
Zenodo (registro 3518837). Etiqueta `V2.1` en GitHub.

**Cambios.**
- Lee un JPG con la bioturbación pintada en negro.
- Convierte a gris con pesos 0,30 / 0,56 / 0,11.
- Cuenta por fila los píxeles con valor ≤ 5.
- Promedia cada N filas y asigna la profundidad del centro del intervalo.
- Traduce el porcentaje a BI y a ii mediante tablas de rangos.
- Guarda un CSV.

**Por qué.** Tener un método reproducible y simple para el artículo.

**Comprobación.** Figuras del artículo (imagen idealizada, ODP 977A, IODP M0077, 26 m de 977
frente a temperatura superficial del mar).

**Problemas conocidos** (detectados en 2026 al revisar el código):
- Se pierde el último intervalo: el bucle recorre `range(0, img_rows-1)` y la escritura del CSV
  `range(0, len(depth)-1)`.
- Falla con imágenes que ya están en escala de grises (espera tres canales).
- Solo acepta JPG. La compresión JPG altera los negros.
- Los pesos de gris suman 0,97, no 1. No afecta en la práctica porque el umbral está en el negro.
- Bucles Python píxel a píxel: lento en imágenes grandes.

---

## V3 — Paquete Python y publicaciones (30-10-2026)

**Qué se hizo.** El proyecto se reorganizó como paquete instalable (`pip install`), con pruebas
automáticas, documentación y una carpeta de borradores de publicaciones.

**Cambios.**
- Paquete en `src/ichantool/`, dividido por funciones:
  - `io.py`: lectura de imágenes.
  - `segmentation.py`: obtención de la máscara (umbral o colores).
  - `pipeline.py`: cálculo del porcentaje por intervalos.
  - `indices.py`: BI e ii.
  - `depth.py`: profundidad y edad.
  - `export.py`: CSV y Excel.
  - `plotting.py`: gráficos.
  - `cli.py`: comando `ichantool`.
- Nuevas capacidades:
  - Formatos PNG y TIFF.
  - Porcentaje por icnotaxón a partir de imágenes con colores.
  - Índices configurables.
  - Modelo de edad.
- Corrección de los fallos de V2: se conserva el último intervalo (opcional) y funcionan las
  imágenes en gris.
- Cálculo vectorizado con NumPy (sin bucles por píxel).
- Código original intacto en `legacy/`.
- Archivos de proyecto: `pyproject.toml`, `CITATION.cff`, `CHANGELOG.md`, `CONTRIBUTING.md`,
  pruebas automáticas en GitHub Actions.
- Carpeta `publications/` con tres artículos previstos y una lista de revistas.

**Por qué.** Convertir el script en una herramienta que otros puedan instalar, citar y ampliar,
y preparar la publicación.

**Comprobación.**
- 9 pruebas automáticas (`pytest`).
- **Prueba de regresión:** la V3 reproduce exactamente (a nivel de decimales) el CSV de la V2
  sobre la imagen de ejemplo, en profundidad, porcentaje, BI e ii.

**Pendiente.** Procesado por lotes, exportación LAS, zonas excluidas en el paquete Python,
publicación en PyPI y DOI nuevo en Zenodo.

---

## V4 — Aplicación web 0.1 (30-10-2026)

**Qué se hizo.** Aplicación que funciona en el navegador, sin instalar nada. Las imágenes no se
envían a ningún servidor.

**Cambios.**
- **Sondeo:** varias secciones por proyecto, techo, muro, unidades, zona de análisis, giro de 90°
  y modelo de edad.
- **Realce:** niveles, gamma, brillo, contraste, saturación, ecualizado, contraste local, canal e
  inversión. Ajustes predefinidos.
- **Detección automática:** umbral adaptativo (local) o global, morfología (apertura y cierre) y
  componentes conexas con tamaño mínimo.
- **Edición:** varita, pincel, lazo, borrador y capa de exclusión (grietas, huecos, muestras).
  Deshacer hasta 30 pasos.
- **Icnotaxones:** 12 clases iniciales editables, con teclas 1–9 y 0 (artefacto).
- **Aprendizaje:** k vecinos más cercanos sobre 12 descriptores de forma, tamaño y color, con
  rechazo de formas desconocidas, acierto estimado y exportación e importación del modelo.
- **Resultados:**
  - Porcentaje total y por icnotaxón, BI e ii automáticos y manuales.
  - Perfil dibujado junto a la imagen a la misma escala.
  - Exportación CSV, PNG y JSON.
  - Proyecto guardable.
- Interfaz en español e inglés.
- 8 pruebas automáticas (Node) para el cálculo, el procesado de imagen y el aprendizaje.

**Por qué.** Era la idea de Santiago. El usuario sube imágenes, el programa las realza y detecta
formas, el usuario etiqueta, y el programa aprende a identificar lo que se repite.

**Comprobación.**
- Pruebas automáticas (8/8 correctas).
- Prueba en navegador real (Chromium) con la imagen de ejemplo del artículo, comparando
  110 intervalos con el CSV de la V2:
  - BI e ii coinciden en el **100 %** de los intervalos.
  - Diferencia en el porcentaje: máxima **0,56** puntos, media **0,13** puntos. Se explica
    por los pesos de gris (ver documentación técnica, §3.4).
  - Profundidades idénticas (diferencia < 10⁻¹³).

**Pendiente o problemas conocidos.**
- **No probada con fotografías reales** de testigos. Los valores por defecto de la detección pueden
  necesitar ajustes.
- El aprendizaje clasifica objetos ya detectados; todavía no aprende a detectar (segmentación por
  píxel).
- El acierto estimado (validación cruzada dejando uno fuera) es optimista si los ejemplos vienen
  del mismo testigo.
- TIFF depende de una librería externa (UTIF) que se descarga al abrir el primer TIFF.
- Imágenes muy grandes (> 50 millones de píxeles) pueden ir lentas o agotar memoria.

---

## V5 — Documentación (30-10-2026)

**Qué se hizo.** Documentación completa del proyecto para poder entenderlo y defenderlo ante
revisores.

**Cambios.**
- `docs/HISTORIAL_VERSIONES.md`: este documento.
- `docs/DOCUMENTACION_TECNICA.md`: cada algoritmo con fórmulas, parámetros, justificación,
  validación y limitaciones.
- `publications/METODOS_Y_DEFENSA.md`: para cada artículo, qué métodos usa, qué se puede afirmar,
  qué falta por validar y preguntas probables de revisores con su respuesta.
- `CLAUDE.md` y `CONTRIBUTING.md`: regla de documentar cada cambio.
- Sección de implementación ampliada en el borrador para JOSS.

**Por qué.** Petición de Santiago: poder leer cómo funciona todo y defenderlo ante un revisor.

**Comprobación.** Revisión de cada fórmula contra el código fuente (`src/ichantool/*.py`,
`app/js/*.js`).

---

## V6 — Aplicación en un solo archivo (30-10-2026)

**Qué se hizo.** Un único archivo `IchAnTool.html` que contiene toda la aplicación y la imagen de
ejemplo. Se abre con doble clic en Chrome, Edge, Firefox o Safari, sin servidor y sin internet.

**Cambios.**
- `tools/build_standalone.py`: genera `dist/IchAnTool.html`. Une los módulos JavaScript en orden
  de dependencia, quita `import`/`export` e incrusta la imagen de ejemplo en base64. Se detiene si
  dos módulos definen el mismo nombre.
- `dist/` no se guarda en git: el archivo se genera con el script (o se adjunta a una release).
- El código de la aplicación no cambia: el cálculo es idéntico al de V4.

**Por qué.** Los navegadores no cargan módulos JavaScript desde archivos locales (`file://`), así
que `app/index.html` necesitaba un servidor. Santiago quería probarla directamente.

**Comprobación.** Abierto desde `file://` en Chromium: carga el ejemplo, detecta 756 objetos,
112 intervalos y bioturbación media del 17,45 % (igual que la versión servida), exporta el CSV, y
la consola no da ningún error.

**Pendiente.**
- Sin conexión se usan fuentes del sistema, porque las tipográficas vienen de Google Fonts.
- Abrir TIFF necesita internet la primera vez (librería UTIF).
- Un ejecutable de escritorio (.exe/.app con Electron o Tauri) queda como opción futura.

---

## V7 — Proyectos, registro compuesto y sondeo de prueba (31-10-2026)

**Qué se hizo.** La aplicación guarda proyectos ("carpetas") en el navegador y tiene una segunda
vista, **Registro del sondeo**: todas las secciones juntas en profundidad o en edad, con ventana de
intervalo, imagen adaptada al eje, bioturbación total, por icnotaxón e índices, y registros externos
(CSV, TXT, Excel) proyectados junto a ella. Exporta SVG y CSV. Incluye un sondeo de prueba real
(IODP 397-U1385I-1H).

**Cambios.**
- `app/js/storage.js` (nuevo): biblioteca de proyectos en IndexedDB. Crear, abrir, renombrar, borrar,
  importar y exportar. Guardado automático 1,5 s después de cada cambio. Cada proyecto guarda sus
  imágenes, profundidades, modelo de edad, máscaras, clases, ajustes, registros y vista del registro.
- `app/js/log.js` (nuevo, sin navegador):
  - lectura de tablas (`parseTable`);
  - cambio de eje profundidad↔edad;
  - filas del registro compuesto;
  - SVG del registro (`buildLogSVG`);
  - CSV de la ventana con los registros interpolados (`windowCSV`).
- `app/js/imageproc.js`: `downsampleRGBA` (reducción por promedio de bloques).
- `app/js/app.js`:
  - resolución de trabajo al importar (máx. 8 MP por defecto);
  - vista de registro con la imagen remuestreada fila a fila al eje elegido;
  - diálogo de registros externos (Excel con SheetJS, descargado al usarlo por primera vez);
  - diálogo de proyectos;
  - sondeo de prueba;
  - la detección se separa en `detectSection`.
- `examples/U1385I-1H/`: 6 imágenes de media sección (reducidas a 50 px/cm), color L\*a\*b\* y
  susceptibilidad magnética del LIMS del IODP, con su procedencia. Modelo de edad **ilustrativo**.
- Formato de proyecto versión 2: añade `ds` (factor de reducción), `records`, `logView` y `notes`.
  Los archivos de la versión 1 se siguen abriendo.
- `tools/build_standalone.py`: incluye los módulos nuevos y el sondeo de prueba en el archivo único
  (3,9 MB).
- Interfaz: selector de modo (Sección / Registro del sondeo) y botón de proyecto con estado de
  guardado. Se quitan los botones Nuevo/Abrir/Guardar, que pasan al diálogo de proyectos.

**Por qué.** Petición de Santiago:
- probar con imágenes reales;
- carpetas de proyecto que conserven las definiciones de profundidad y edad;
- ver el sondeo completo o una ventana en profundidad o edad, con la bioturbación elegida;
- exportar SVG o CSV;
- proyectar registros externos (por ejemplo, geoquímica).

**Comprobación.**
- 13 pruebas automáticas de la aplicación (`npm test`; 5 nuevas para `log.js` y la reducción) y
  9 de Python.
- Prueba en Chromium con el servidor y con el archivo único desde disco:
  - el sondeo de prueba se carga en unos 4 s;
  - detección en las 6 secciones;
  - registro en profundidad y en edad (ventana 10–40 ka);
  - exportación SVG (295 kB) y CSV con L\*, a\*, b\* y susceptibilidad interpoladas;
  - importación de una tabla con «;» y coma decimal;
  - creación de un segundo proyecto y vuelta al primero;
  - recarga de la página con el proyecto recuperado;
  - ningún error en consola.
- Los parámetros de detección del sondeo de prueba se compararon en la sección 3 (113 / 60 / 45
  objetos con tres combinaciones) y se eligió un ajuste moderado.

**Pendiente o problemas conocidos.**
- El modelo de edad del sondeo de prueba es ilustrativo. Para trabajo real, usar el publicado.
- La detección en este lodo detecta parte de las manchas y trazas oscuras, pero no la bioturbación
  difusa (moteado), que hay que marcar con pincel. Además confunde algunas marcas de corte y de
  muestreo, que hay que excluir o marcar como artefacto.
- Los proyectos viven en el navegador de cada ordenador: borrar los datos del navegador los
  elimina. Hay que exportar copias de seguridad.
- Excel necesita internet la primera vez (librería SheetJS). CSV y TXT funcionan sin conexión.
- En el registro compuesto, todas las secciones y registros deben usar unidades coherentes. La
  aplicación convierte mm, cm y m entre secciones, pero no los registros externos.

---

## V8 — Ajustes publicados, ajustes propios y copias de seguridad (31-10-2026)

**Qué se hizo.** Se revisó la bibliografía posterior a 2014 sobre tratamiento de imagen en icnología
de testigos y se añadieron los métodos publicados que faltaban. El usuario puede guardar sus propios
ajustes, y se añadió un sistema de copias de seguridad en tres capas.

**Bibliografía revisada** (detalle en la documentación técnica, §6, §7 y §20):
- Dorador, Rodríguez-Tovar e IODP Exp. 339 (2014, *Facies* 60): Niveles → Brillo/Contraste →
  Vibrance/Saturación, con rangos y medias publicados.
- Miguez-Salas, Dorador y Rodríguez-Tovar (2019, *Marine Geology* 413): CLAHE en Fiji; ICY con
  K-medias de 2 clases; filtros binarios (erosión, rellenar huecos, mínimo/máximo).
- Rodríguez-Tovar, Miguez-Salas y Dorador (2020, *Ichnos*): Fiji e ICY aplicados a icnofábricas
  compuestas. Solo se consultó la ficha, no el texto.
- Kikuchi y Naruse (2024, *Sedimentary Geology* 461): U-Net para *Phycosiphon* (Dice 0,892).
  Se anota para el artículo 2; no se implementa.

**Cambios.**
- `imageproc.js`:
  - `autoLevels` (percentiles 0,5 % y 99,5 % en la zona de análisis, y mediana);
  - `gammaForMedian` (gamma automática limitada a 0,19–1);
  - `clahe` (Zuiderveld, 1994);
  - vibrance;
  - `kmeansThreshold`;
  - `fillHoles`;
  - nuevos ajustes `dorador2014` y `clahe2019`;
  - el ajuste «levels» pasa a llamarse genérico, porque **antes se atribuía erróneamente a Dorador y
    Rodríguez-Tovar (2014)** y sus valores eran propios.
- Detección: método K-medias de 2 clases y opción de rellenar huecos.
- **Ajustes propios:** se guardan realce y detección con nombre. Son comunes a todos los proyectos
  (IndexedDB más una copia en localStorage). También se puede aplicar un ajuste a todas las
  secciones.
- **Copias de seguridad:**
  - almacenamiento persistente del navegador (`navigator.storage.persist`);
  - copia automática en una carpeta elegida por el usuario (Chrome/Edge, *File System Access*):
    proyecto actual 20 s después de cada cambio, copia diaria en `historial/` y
    `ichantool_ajustes.json`;
  - descarga de una copia completa (todos los proyectos y ajustes);
  - restauración de varios archivos a la vez (proyectos, copias completas o ajustes).
- `storage.js`: base de datos versión 2 con almacén `prefs`.

**Por qué.** Petición de Santiago: métodos más recientes que Dorador (2014), poder guardar sus
propios ajustes y no perder nada si falla el ordenador.

**Comprobación.**
- 20 pruebas de la aplicación (6 nuevas: CLAHE, niveles automáticos, gamma automática, K-medias,
  rellenar huecos, ajustes completos y detección por K-medias) y 9 de Python.
- En Chromium:
  - los ajustes nuevos se aplican en la sección 3 del sondeo de prueba (niveles automáticos 65–114);
  - se guarda un ajuste propio;
  - la copia completa (3,1 MB) se descarga y se restaura en un navegador limpio con su proyecto y
    su ajuste;
  - ningún error.
- La copia en carpeta no se pudo probar automáticamente, porque el selector de carpeta exige un
  clic real. Hay que probarla a mano en Chrome o Edge.

**Pendiente o problemas conocidos.**
- La equivalencia numérica con Photoshop (contraste y brillo) es aproximada (§6).
- El CLAHE es por mosaicos con interpolación (Zuiderveld, 1994), no la ventana deslizante del
  plugin de Fiji. El efecto es parecido, pero no idéntico píxel a píxel.
- La copia automática en carpeta solo funciona en Chrome y Edge, y el navegador pide el permiso
  de nuevo en cada sesión (un clic en «Reactivar copia automática»).
- La carpeta `historial/` crece un archivo por proyecto y día; hay que limpiarla a mano.

---

## V9 — Herramienta de geoquímica y aprendizaje automático (31-10-2026)

**Qué se hizo.** Se añadió a la aplicación un tercer modo, «Geoquímica», separado de las imágenes
pero dentro del mismo proyecto. Sirve para interpretar registros de muchos proxies en muchos
sondeos (pensado para llegar a cientos), etiquetar eventos, entrenar un clasificador que
autoclasifica los sondeos nuevos y hacer mapas por edad al estilo del atlas. La interpretación
icnológica del proyecto entra como datos más.

**Cambios.**
- Nuevo módulo `app/js/geo.js` (sin navegador):
  - importación de tabla larga, un archivo por sondeo y catálogo de posiciones;
  - muestras remuestreadas a una malla común de edad o profundidad, razones A/B, log10, z-score
    por sondeo y escalado global o por sondeo;
  - etiquetas por intervalos y por reglas (asociaciones de proxies con z-score o valor);
  - Random Forest (CART, Gini, pesos equilibrados, importancia MDI), k vecinos, Bayes ingenuo
    gaussiano y k-medias, todos con semilla;
  - validación cruzada dejando un sondeo fuera (o 5 bloques contiguos con un solo sondeo), matriz
    de confusión y acierto equilibrado;
  - resumen por ventana de edad, interpolación IDW y mapa SVG con costa de Natural Earth.
- Interfaz (`app.js`, `index.html`, `i18n.js`):
  - modo «Geoquímica» con cuatro pasos: sondeos y datos, preparación, etiquetas y reglas,
    aprendizaje (con explicación de cada método y parámetro, valores sugeridos y semilla);
  - pestañas Registros (variables + bandas de etiquetas y clasificación, marcar intervalos
    arrastrando), Mapa (ventana de edad, ◀ ▶, clase dominante o valor, IDW, anomalía, SVG y CSV) y
    Modelo (métricas, matriz de confusión, importancia, nombres de grupos de k-medias, CSV);
  - «Añadir el sondeo de las imágenes»: bioturbación, BI, ii, % por icnotaxón y registros
    externos como variables;
  - el modelo se aplica también a sondeos añadidos después de entrenar, con la escala congelada;
  - banda «Clases geoq.» en el registro compuesto del sondeo de imágenes;
  - aviso por sondeo de las variables que le faltan.
- `log.js`: `parseTable` devuelve también el texto de cada celda; `buildLogSVG` admite bandas de
  clases (`bands`, `bandLegend`) y devuelve la posición del gráfico.
- Archivo de proyecto: campo `geo` (sondeos, etiquetas, intervalos, reglas, ajustes). El modelo
  no se guarda: se reentrena con la misma semilla al abrir.
- Datos: `examples/data/land-50m.json` (costa Natural Earth 1:50 m, dominio público) y
  `examples/geochem_demo/` con `tools/make_geochem_demo.py` (15 sondeos **sintéticos**).
- `tools/build_standalone.py`: añade `geo.js`, la costa y la tabla de demostración al archivo único.

**Por qué.** Petición de Santiago: integrar una herramienta de interpretación geoquímica
multiproxy con etiquetas propias, aprendizaje automático ajustable con ayuda para no expertos,
autoclasificación de muchos sondeos, mapas por edad y superposición con la interpretación
icnológica en los mismos proyectos. Formatos elegidos por él: tabla larga y archivos por sondeo;
etiquetado por intervalos y reglas; mapas de puntos con interpolación.

**Comprobación.**
- 27 pruebas de la aplicación (7 de geoquímica) y 9 de Python.
- En Chromium, servidor local y archivo único:
  - la demostración entrena un Random Forest con 1730 muestras etiquetadas: acierto 98,6 % y
    acierto equilibrado 97,7 % dejando un sondeo fuera (datos sintéticos: **solo comprueba la
    implementación**, §21.8);
  - el mapa de 6–10 ka muestra baja oxigenación al este y fondo al oeste, como en la verdad
    sintética;
  - importación de tres archivos por sondeo y del catálogo con asignación automática de columnas;
  - sondeo de las imágenes incluido (440 intervalos, 8 variables), marcado de intervalos
    arrastrando, entrenamiento con un solo sondeo (5 bloques) y banda «Clases geoq.» en el
    registro compuesto;
  - tras recargar, se recuperan los intervalos y el modelo se reentrena solo;
  - ningún error de JavaScript.

**Pendiente o problemas conocidos.**
- Validar con sondeos reales con interpretación publicada (dejando sondeos enteros fuera) antes
  de afirmar nada sobre la capacidad de detectar eventos reales.
- Importancia por permutación (más fiable que MDI con proxies correlacionados).
- Con cientos de miles de muestras, el k-NN y la validación cruzada pueden tardar: todo corre en
  el navegador. Si hace falta, pasar el entrenamiento a un *web worker* o al paquete Python.
- No se propaga la incertidumbre de los modelos de edad ni se modela la autocorrelación.
- El paquete Python todavía no tiene la parte de geoquímica.

---

## V10 — Herramienta multiproxy: capas de intervalos y clasificación automática de intervalos (31-10-2026)

**Qué se hizo.** El modo «Geoquímica» pasa a llamarse **«Multiproxy»**, porque admite cualquier
registro numérico (geoquímica, foraminíferos, TOC, sedimentología…) y además **intervalos
descritos** organizados en capas (litología, turbiditas, zonas de migración de metales, eventos…).
Una capa puede ser **subdivisión** de otra. Los intervalos se importan, se dibujan y se editan, y
**todas** las capas entran como variables en el clasificador automático de intervalos, que puede
aprender cualquier capa como objetivo. Se deja explícito que este clasificador es independiente
del que sugiere icnotaxones.

**Cambios.**
- `geo.js`:
  - `buildSamples` añade una columna 0/1 por categoría de cada capa usada (sin escalar);
  - `labelSamples` filtra por capa objetivo y no usa intervalos automáticos;
  - nuevas `intervalsFromTable` (formato ancho y largo), `intervalsOnAxis`, `orphanIntervals`
    (intervalos hijos fuera de la capa madre) y `layerFeatureNames`.
- Interfaz:
  - paso 3 «Capas de intervalos y etiquetas»: crear, renombrar y borrar capas, elegir la capa
    madre (sin ciclos), categorías con color y reglas por capa (también con variables de capas);
  - importación de intervalos (techo, base, eje, columna de capa opcional, columnas de categoría;
    sondeo por columna, por nombre de archivo o elegido), sin duplicar intervalos idénticos;
  - registro con una banda por capa en orden jerárquico; al dibujar en una capa hija, el
    intervalo se recorta al intervalo madre; lista editable (categoría, techo, base), aviso ⚠ de
    intervalos fuera de su madre, exportación CSV;
  - paso 4: capa objetivo y capas usadas como variables; la capa objetivo nunca es variable;
  - «Aceptar la clasificación como intervalos»: crea intervalos automáticos (en claro), que se
    confirman con ✓ y solo entonces cuentan para entrenar;
  - el registro compuesto del sondeo de imágenes muestra sus capas de intervalos y la
    clasificación.
- Proyectos de V9: la lista de etiquetas se convierte en la capa «Eventos» (`normalizeGeo`).
- Demostración: `intervals.csv` sintético (Litologia y Turbidita como subdivisión), generado con
  una semilla aparte para no cambiar los registros numéricos.
- `log.js`: el ancho de cada banda es configurable.

**Por qué.** Petición de Santiago: no limitarlo a geoquímica; importar y modificar intervalos
definidos y subdividirlos; que el sistema de clasificación automática de intervalos los use; y
separarlo claramente del sistema que sugiere la clasificación de la bioturbación.

**Comprobación.**
- 28 pruebas de la aplicación (1 nueva: importación de intervalos, columnas 0/1 con conversión de
  eje, capa objetivo y comprobación de anidamiento) y 9 de Python.
- En Chromium:
  - demostración: 3 capas, 9 variables, acierto 98,4 % y acierto equilibrado 96,7 % dejando un
    sondeo fuera (sintético; solo comprueba la implementación);
  - con «Litologia» como capa objetivo se entrena y se aceptan 7 intervalos automáticos;
  - arrastre en la capa hija recortado al intervalo madre;
  - diálogo de importación con detección de techo, base, sondeo y columnas de categoría; volver a
    importar el mismo archivo no duplica;
  - proyecto con formato de V9 convertido correctamente;
  - recarga con todo recuperado; banda de clasificación en el registro compuesto; ningún error.

**Pendiente o problemas conocidos.**
- Las muestras se sitúan con los registros numéricos: un sondeo que solo tenga intervalos (sin
  ningún dato numérico) no aporta muestras.
- Sin intervalo de una capa, sus columnas valen 0, igual que «no presente»: no se distingue «no
  descrito» de «ausente».
- Los intervalos en profundidad deben estar en las mismas unidades que los registros del sondeo.
- Importancia por permutación y validación con datos reales siguen pendientes (V9).

---

## V11 — Modo oscuro, prueba de la autoclasificación y sondeos de la tesis (31-10-2026)

**Qué se hizo.** Botón para cambiar entre modo claro y oscuro. Botón para **probar la
autoclasificación** en un sondeo sin usar sus propias etiquetas, con bandas de resultado y de
acierto y la opción de **colorear los registros** por clase. Para esta primera versión, el modo
Multiproxy carga solo los **sondeos de la tesis** (capítulos VI–IX) con datos reales. Desde esta
entrega los cambios van a la rama principal (`master`).

**Cambios.**
- Tema: botón ☾/☀ en la cabecera; se guarda en `localStorage` (`ichantool.theme`); sin elección,
  sigue al sistema.
- `geoTestCore` (app.js): si otros sondeos tienen etiquetas de al menos dos clases, entrena con
  ellos y predice el sondeo actual; si no, divide el sondeo en 5 bloques contiguos y predice cada
  bloque con un modelo entrenado sin él. Bandas «Prueba» y «Acierto» (verde = coincide con la
  etiqueta, rojo = no) y porcentaje de coincidencia.
- «Colorear registros por clase»: fondo translúcido de cada columna de registro con la clase de la
  prueba, de la clasificación o de las etiquetas (`log.js`, opción `shade`).
- `geo.js`: al convertir intervalos entre profundidad y edad, los extremos fuera de los datos del
  sondeo se ajustan al primer/último valor (antes se perdía el intervalo entero; p. ej. la unidad
  superior de 977A, que empieza en 0 mbsf).
- `examples/tesis_casanova/` (ver su README):
  - registros de PANGAEA: ODP 977A (SST de alquenonas y C37:4, CaCO3, TOC, color L\*a\*b\*,
    susceptibilidad magnética) y ODP 976 (SST, K37, tasa de sedimentación, δ18O, Mg/Ca);
  - intervalos de la tesis: ORL L1–L8 de 977A con su tipo (Cap. VII), unidades icnológicas de 977A
    (Cap. VI), ORL 1 de GP03 con sus fases euxínica y subóxica como subdivisión, HS1 (Cap. VIII),
    sapropeles S2–S6 de LC10 con la interrupción de S4 como subdivisión (Cap. IX);
  - posiciones (Tabla IV.1) y modelo de edad de LC10 (Tabla IX.1).
- `PRELOAD_THESIS = true` en app.js: los carga al abrir Multiproxy en un proyecto sin sondeos, y
  hay un botón para cargarlos cuando se quiera. En la versión final se pondrá en `false`.

**Por qué.** Petición de Santiago: modo oscuro/claro, probar la autoclasificación con coloreado,
tener sus sondeos en esta primera versión y empezar a trabajar sobre la rama principal.

**Comprobación.**
- 28 pruebas de la aplicación (ampliada la de capas con el ajuste de extremos) y 9 de Python.
- En Chromium: se cargan los 4 sondeos con posición, 30 intervalos en 5 capas, ninguno fuera de su
  capa madre; ODP 977A da 311 muestras (0,5 ka). Random Forest con capa objetivo «Capas
  orgánicas»: validación por 5 bloques, acierto 78,8 % y **acierto equilibrado 36 %**; la prueba
  en 977A coincide con la etiqueta en el 73,8 % de 263 muestras. Las ORL de tipo 1–3 son pocas y
  cortas: el modelo acierta sobre todo «fuera de capa orgánica». Es un resultado real y modesto,
  útil como punto de partida, no como validación.
- Modo oscuro aplicado y guardado; ningún error de JavaScript.

**Pendiente o problemas conocidos.**
- Faltan los datos propios de la tesis (XRF/WDXRF de GP03 y LC10, bioturbación de 976/977): GP03
  y LC10 solo tienen intervalos y no aportan muestras hasta importar sus registros.
- ODP 976 solo tiene en común con 977A la SST de alquenonas.
- Quitar la precarga (`PRELOAD_THESIS = false`) en la versión final.

---

## V12 — Selección múltiple, elección del ajuste y datos propios de la tesis (31-10-2026)

**Qué se hizo.**
- **Selección de varias trazas** (automáticas o dibujadas) y asignación a un icnotaxón de una vez.
- Al asignar, la vista **ya no salta ni hace zoom**: «Saltar a la siguiente» está desactivado por
  defecto, se recuerda y, si se activa, ya no cambia el zoom.
- Revisión bibliográfica sobre preselección de parámetros de realce y botón para **elegir el ajuste**
  que más separa trazas y matriz.
- Modo Multiproxy con los **datos propios de la tesis** (carpeta del autor), una guía «¿Cómo funciona
  este modo?» y la opción de rellenar variables que faltan.

**Cambios.**
- `app.js`: `S.multi`, Ctrl+clic, Mayús+arrastrar (rectángulo), «Seleccionar las sugeridas como…» y
  «Seleccionar todas sin revisar»; `assignClassMany`, `acceptSuggestions`, `deleteObjects` en una
  sola operación de deshacer; panel de selección múltiple; `centerOn` solo desplaza.
- `imageproc.js::separability` (η de Otsu) y `app.js::rankPresets` + botón «Elegir el ajuste que más
  separa trazas y matriz».
- `geo.js`: `missing: 'mean'` y `colStats`; las reglas no se cumplen sobre valores que faltan.
- `tools/make_thesis_dataset.py` → `examples/tesis_casanova/privado/` (en `.gitignore`); el archivo
  único lo incluye si existe; `loadThesisCores` usa esos datos si están y, si no, la versión pública.
- Interfaz: guía del modo Multiproxy y selector de valores que faltan.

**Por qué.** Petición de Santiago: asignar varias trazas a la vez, que no salte ni haga zoom al
asignar, buscar publicaciones sobre preselección de parámetros y usar los datos reales de su tesis
(no los de los artículos publicados) en el modo Multiproxy, que además no se entendía bien.

**Comprobación.**
- 29 pruebas de la aplicación (nueva: separabilidad) y 9 de Python.
- En Chromium: selección por rectángulo de 28 trazas y asignación con la tecla 2 a las 28, sin cambio
  de vista ni de zoom; el botón de ajuste ordena los ajustes (η 0,81 «ecualizado + contraste local»,
  0,68 Dorador 2014…) y aplica el primero.
- Multiproxy con datos propios: 4 sondeos, 7 capas, ninguna fuera de su madre; validación dejando un
  sondeo fuera, acierto 61,1 % y equilibrado 17,7 %; prueba en LC10 85,6 %, en GP03 29,8 %. Ningún error.

**Pendiente o problemas conocidos.**
- Los datos propios no están en GitHub; para publicarlos hace falta el acuerdo de los coautores.
- η favorece cualquier bimodalidad; es una propuesta inicial.
- Falta la bioturbación de GP03 y LC10 (está en otros archivos del autor, p. ej. `TODOS GP03.xlsx`).
- La transferencia de la clasificación entre sondeos con variables distintas es pobre.

---

## V13 — Selección arrastrando y exclusión con rectángulo (31-10-2026)

**Qué se hizo.** Con la herramienta de selección, **arrastrar dibuja un recuadro** que selecciona las
trazas (antes arrastrar desplazaba la imagen). Mayús o Ctrl + clic añade o quita una traza, y Mayús o
Ctrl + recuadro añade a la selección. Las herramientas **Excluir** y **Recuperar** tienen la forma
«Rectángulo» (o Mayús + arrastrar con el pincel) para marcar zonas que no cuentan.

**Cambios.** `app.js`: el arrastre de selección pasa a recuadro; desplazar la vista queda en la
herramienta mano, la barra espaciadora o el botón central; tipo de arrastre `exrect` que marca o
desmarca la capa de exclusión en el rectángulo con una sola operación de deshacer; opción
`S.exShape`. `index.html`, `i18n.js`: selector de forma y textos de ayuda.

**Por qué.** Petición de Santiago: seleccionar varias trazas con Mayús, Ctrl o arrastrando, y poder
excluir partes del sondeo con un recuadro.

**Comprobación.** 29 pruebas de la aplicación y 9 de Python. En Chromium: recuadro simple (1 traza),
Mayús + recuadro añade (2), recuadro nuevo sustituye (1); exclusión con rectángulo de 2688 px;
ningún error.

**Pendiente o problemas conocidos.** Reestructuración del programa en proyectos → sondeos (pedida a
la vez; se planifica aparte).

---

## V0.7 — Figura de trazas más configurable (05-11-2026)

**Qué se hizo.** En «Trazas representativas por icnotaxón»:
- **Versiones de cada traza** una al lado de otra (con su nombre encima): tratada, tratada con contorno, original,
  original con contorno, solo la traza (fondo blanco), solo la traza tratada, solo la traza con contorno, silueta en el
  color del icnotaxón y solo contorno.
- **Escala:** barra, barra con divisiones (nº de divisiones), línea con topes o sin escala; posición (cuatro esquinas),
  longitud fija en cm o automática, colores de relleno y borde, y en la primera versión o en todas. Sobre fondo blanco
  la escala blanca se dibuja en el color del borde para que se vea.

**Cambios.** `app.js`: `traceCanvas` (fondo blanco, solo traza, silueta), `TRACE_VIEWS`, `traceViews`, `traceScale`,
`tracesSVG` y controles del panel. `i18n.js`.

**Por qué.** Petición de Santiago.

**Comprobación.** `npm test` (47); prueba sin pantalla en Chromium con el proyecto de entrenamiento (selección
automática, tres versiones y escala con divisiones), sin errores.

**Pendiente.** Nada.

---

## V0.6 — Ancho y ejes de las columnas (05-11-2026)

**Qué se hizo.** En «Estilo de la columna y su figura», tabla con una fila por columna a la derecha del testigo
(bioturbación, icnotaxones, BI, ii y cada registro): ancho en px, mínimo y máximo del eje, número de divisiones,
decimales de las etiquetas, invertir el eje y, en los registros, escala logarítmica. Vacío = automático. El ancho es el
mismo que se cambia arrastrando el borde de la columna, y la figura de columna usa ahora esos anchos.

**Cambios.** `log.js::buildLogSVG`: `style.axes` en `xScale` (mín/máx, divisiones exactas, decimales, invertir, log
base 10); barras desde la base del eje; BI e ii con ancho ajustable. `app.js`: `axesFormHTML`, `onStyleInput`, anchos en
`coreSVG`. `i18n.js`.

**Por qué.** Petición de Santiago.

**Comprobación.** `npm test` (47); prueba sin pantalla en Chromium (máximo, divisiones, ancho y escala log), sin errores.

**Pendiente.** Nada.

---

## V0.5 — Estilo de la columna y de las figuras (05-11-2026)

**Qué se hizo.**
- **Estilo de la columna y su figura** (panel «Estilo…» en la columna y en la figura de columna; se guarda por
  sondeo): unidades del eje (profundidad m/cm/mm; edad a/ka/Ma), intervalo de marcas o número de divisiones del eje,
  divisiones de los ejes de %, tamaño de letra, forma de la bioturbación (barras y línea, barras, línea, puntos) y sus
  colores, títulos de las columnas de bioturbación e icnotaxones, marco de las columnas, rejilla, límites de sección,
  título y subtítulo.
- **Figura de secciones, panel de flechas:** indicador de las trazas (flecha y abreviatura, solo flecha, triángulo
  invertido, triángulo, círculo, cuadrado, estrella, aspa). Con un símbolo solo, la leyenda de abajo muestra el símbolo
  con su color y el nombre. Etiquetas que se tocan: dejarlas, desplazarlas hacia abajo, unirlas («Ch, Pl») u ocultar la
  de abajo.

**Cambios.** `log.js`: `LOG_STYLE` y opción `style` de `buildLogSVG`. `app.js`: `logStyleOf`, `styleFormHTML`,
`onStyleInput`, `figSymbol`, opciones `markStyle` y `overlap` de `S.fig`. `index.html` e `i18n.js`.

**Por qué.** Petición de Santiago: más configuración en figuras y columna.

**Comprobación.** `npm test` (47); prueba sin pantalla en Chromium de la columna, la figura de columna y la de
secciones con los nuevos ajustes, sin errores.

**Pendiente.** Las figuras de distribución y de trazas no usan aún el estilo de la columna.

---

## V0.4 — Intervalos sin datos (05-11-2026)

**Qué se hizo.** Un intervalo cuyo porcentaje de píxeles válidos (no excluidos) es menor que un mínimo (20 % por
defecto, ajustable en el paso 4) no tiene datos: su bioturbación, icnotaxones, BI e ii quedan vacíos (no 0), se dejan
fuera de los CSV y en la columna (y su figura) se dibuja una banda rayada «SIN DATOS». En el panel de la columna,
«Ampliar zonas sin datos (cm por lado)» marca también sin datos los intervalos cercanos a esas zonas.

**Cambios.** `core.js`: `rowCounts` devuelve `nCols`; `binRows` acepta `minValid` y marca `noData`. `app.js`:
ajustes `minValid` y `noDataPad`, ampliación en `analyze`, controles y etiquetas. `log.js::buildLogSVG`: patrón
rayado y texto en las columnas de bioturbación, icnotaxones, BI e ii. Prueba nueva en `core.test.mjs`.

**Por qué.** Petición de Santiago: que las secciones excluidas o con muy pocos datos no aparezcan como 0.

**Comprobación.** `npm test` (47). Sin pruebas en navegador.

**Pendiente.** El paquete Python no tiene capa de exclusión, así que no aplica el mínimo de píxeles válidos. Los
proyectos existentes pueden cambiar en intervalos con menos del 20 % de píxeles válidos (antes daban un valor).

---

## V0.3 — Identificación y cuantificación juntas (05-11-2026)

**Qué se hizo.** En la columna del sondeo y en las figuras (columna y distribución de icnotaxones) las marcas del modo
identificación se pueden mostrar junto con las columnas cuantificadas (bioturbación, icnotaxones, BI, ii, manual).
Antes, el modo identificación las quitaba siempre.

**Cambios.** `app.js`: `renderLog` y `coreSVG` usan las columnas elegidas también en modo identificación; `rangeSVG`
dibuja a la vez barras de abundancia y triángulos de presencia; subtítulos según lo que se muestra. `i18n.js`:
`fig.rangeSubBoth`.

**Por qué.** Petición de Santiago: combinar identificación y cuantificación en la columna y las figuras.

**Comprobación.** `npm test` correcto. Sin pruebas en navegador.

**Pendiente.** Nada.

---

## V0.2 — Importación en escritorio, sondeo obligatorio, ocultar icnotaxones, opciones de figuras y fluidez (05-11-2026)

**Qué se hizo.**
- **Importación en el programa de escritorio:** los proyectos importados no se guardaban («Cambios sin guardar») ni
  aparecían en la lista. Las imágenes se guardan ahora como bytes en el almacén de imágenes, porque los Blob de
  IndexedDB fallan en el origen `app://` del programa. Si una importación falla, se muestra el motivo.
- El trabajo empezado sin proyecto se guarda como proyecto nuevo, y **no se pueden añadir imágenes sin proyecto**: al
  añadirlas se pregunta siempre **a qué sondeo pertenecen** (o se crea uno nuevo).
- **Ocultar icnotaxones al interpretar:** botón 👁 en cada icnotaxón, «Ver solo el activo» (sigue al icnotaxón
  activo) y «Mostrar todos». Solo afecta a la imagen: no se borra nada ni cambian el análisis ni las figuras.
- **Figuras:** ventana de profundidad (desde/hasta) común a todas (trazas, columna, distribución, secciones). En la
  columna: qué columnas salen (imagen, bioturbación, icnotaxones, BI, ii, manual) y qué otros registros; ancho del
  testigo libre o con «Mantener proporción» (el alto sigue a la forma real del testigo). En la figura de secciones,
  la misma opción para ancho y alto de los paneles.
- **Fluidez:** el recuento por filas de cada sección se reutiliza mientras no cambien trazas, zona o clases; el
  guardado reutiliza las máscaras comprimidas que no han cambiado; el modelo de icnotaxones solo se reentrena si
  cambian los ejemplos o sus ajustes, y solo se predicen los objetos nuevos o modificados; los formularios de figuras
  ya no recalculan el sondeo entero.

**Cambios.** `storage.js` (`putImage`/`getImage` con bytes; lee también los Blob de V0.1). `app.js`: `markDirty`,
`restoreFiles`, `pickCore`, `addFiles`, `hiddenCls`/`setHidden`/`rebuildLUT`/`render`/`drawMarks`,
`secFigRange`, `figAxisWin`, `coreRatio`, `figRecords`, `coreFigSize`, `secFigSize`, `figWinHTML`, `figLightD`,
`classTraces`, `analyze` (caché `_rc`), `lazyMask` (caché de RLE con contador `_mv`), `trainSig`/`learnNow`.
`i18n.js` e `index.html` (botones de icnotaxones).

**Por qué.** Peticiones de Santiago al probar la V0.1 en Windows.

**Comprobación.** `npm test` (46) y `pytest` (10). Importación probada en Chromium (versión web) antes del cambio a
bytes. Sin pruebas en el programa de escritorio (las hace Santiago).

**Pendiente.** Comprobar la importación en el .exe. Las cachés dependen de que todo cambio de máscaras pase por
`beginOp`/`afterChange` o por asignación del array (así es hoy en todo el código).

---

## V33 (= V0.1) — Imágenes en disco, resolución por sección e intervalos en cm (05-11-2026)

**Qué se hizo.**
- Las imágenes originales se guardan **una vez** en un almacén aparte en disco (IndexedDB `images`) y
  el proyecto solo guarda la referencia. Al abrir un proyecto no se decodifica ninguna imagen: los
  píxeles se cargan al trabajar con una sección y se liberan los de las secciones que no se usan.
- Se conserva siempre el **original a resolución completa**. Cada sección tiene un selector
  «Resolución de trabajo» (completa, 1/2, 1/3…, con px/cm y MP) que recalcula la imagen desde el
  original y adapta máscaras, zona de análisis y marcas. Botón para igualar todas las secciones a
  los mismos px/cm.
- El **recorte** ya no vuelve a codificar la imagen reducida: guarda el rectángulo en píxeles del
  original.
- El **intervalo de análisis se fija en cm** (antes en píxeles), igual para todas las secciones.

**Cambios.**
- `storage.js`: base de datos versión 4 con almacén `images`; `putImage`, `getImage`, `gcImages`;
  borrar un proyecto borra sus imágenes.
- `app.js`: `decodeBytes` acepta Blob y recorte; residencia en memoria (`ensurePixels`,
  `withPixels`, `needPixels`, límites de memoria); máscaras empaquetadas (`lazyMask`); formato de
  proyecto v4 (`file.key`, `crop`, `full`, estadísticas `st` y miniaturas `th` de objetos);
  migración automática de proyectos anteriores; exportación y copias con las imágenes en base64;
  `changeResolution` y `renderResForm`; columna con imagen reducida separada de las trazas;
  `binCm`, `binRowsOf` y conversión de `binPx` antiguos.
- `core.js::binRows` y `pipeline.py` (`bin_edges`, `bin_cm`): filas por intervalo fraccionarias con
  la misma regla en JS y Python.
- Pruebas: 1 nueva en JS y 1 en Python.

**Por qué.** Petición de Santiago: proyectos con muchas imágenes grandes sin agotar la memoria,
poder cambiar la resolución con que se ve cada sección sin perder la original, e intervalos en cm.

**Comprobación.** `npm test` (46) y `pytest` (10) correctos; archivo sin conexión generado. Sin
pruebas en navegador en esta entrega: las hace Santiago al usar el programa.

**Pendiente o problemas conocidos.**
- Probar con proyectos reales grandes y con proyectos de versiones anteriores (migración).
- Las figuras de trazas y de secciones necesitan los píxeles; la primera vez leen las secciones de
  dos en dos y tardan más.
- Al aumentar la resolución, las trazas ya dibujadas mantienen el escalonado de la resolución
  anterior.
- Los límites de memoria son fijos (~0,9 GB píxeles, ~0,5 GB máscaras); podrían pasar a ajustes.

---

## V32 — Modo identificación, leyendas y figuras de secciones (05-11-2026)

**Qué se hizo.** Petición de Santiago: un modo para sondeos donde no se puede cuantificar la bioturbación (solo identificar
trazas), la leyenda de icnotaxones con colores en todas las figuras y la exportación de secciones del sondeo con varias
versiones lado a lado, como en las publicaciones; se revisaron figuras de artículos de icnología de sondeos (tratamiento de
imagen de Dorador y Rodríguez-Tovar; IODP U1385) para elegir los tipos.

**Cambios.**
- Sección: casilla **Modo identificación** y herramienta **Marcar** (M). En la lista de icnotaxones se cuentan las marcas.
- Columna en modo identificación: sin porcentajes ni índices; triángulos de color sobre la imagen en la posición de cada
  traza y columna «Icnotaxones identificados» por tramo; leyenda de icnotaxones al pie (también en modo normal).
- Figuras nuevas: **Secciones del sondeo** (original, tratada, trazas coloreadas, con transparencia, contornos, solo trazas,
  en negro, flechas con abreviaturas; tramo, tamaño de panel, opacidad y tamaño mínimo para flechas elegibles; leyenda con
  abreviaturas) y **Distribución de icnotaxones** (columnas por icnotaxón con barras de abundancia relativa o presencia).
- Flujo de GitHub: también se compila al publicar una release desde la web.

**Por qué.** Muchos tramos solo permiten reconocer trazas; las figuras de publicación necesitan comparar el mismo tramo en
bruto, tratado e interpretado, con leyenda.

**Comprobación.** `npm test` 45 (nueva: marcas, columna de identificados, leyenda, abreviaturas únicas y gráfico de
distribución). Navegador (proyecto de entrenamiento): figura de secciones 20–60 cm con cinco paneles, flechas y leyenda;
distribución de icnotaxones; cuatro marcas en modo identificación y columna con triángulos y lista; sin errores de la app.

**Pendiente o problemas conocidos.** Flechas apiñadas cuando hay muchas trazas pequeñas (usar el tamaño mínimo). La figura de
secciones trabaja en profundidad aunque la columna esté en edad.

---

## V31 — Recorte, Start/End, zonas excluidas, arranque limpio y programa de escritorio (05-11-2026)

**Qué se hizo.** Cambios pedidos por Santiago: recortar en altura la imagen de una sección (escalas, etiquetas) con
ajuste de techo y muro; ocultar en la columna las zonas excluidas; triángulos «Start» y «End» para el inicio y el final de
lo analizado; arranque limpio sin la tesis precargada; y, por los problemas de memoria del navegador, un programa de
escritorio para Windows, macOS y Linux descargable desde GitHub.

**Cambios.**
- Sección: botón **✂ Recortar** (y se ofrece al importar una sola imagen). Dos líneas rojas «Crop top» / «Crop bottom»
  con zona sombreada; opción de recalcular las profundidades (eran de la imagen completa) o mantenerlas (ya eran del
  sondeo); muestra los píxeles y la profundidad resultantes. La imagen recortada sustituye a la original en el proyecto.
- Sección: triángulos **Start** y **End** a la izquierda de la imagen para mover el inicio y el final del área de análisis.
- Columna: casilla **Ocultar zonas excluidas** (salen en blanco en la imagen).
- Memoria: la copia de cada sección para la columna se reduce a ≤ 512 px de ancho.
- Arranque limpio: sin proyectos precargados y sin guardar nada hasta crear o abrir uno; botón «Proyecto de la tesis»
  solo donde existen los datos privados; `build_standalone.py` ya no los incluye salvo con `--with-thesis`.
- **Programa de escritorio** (`desktop/`, Electron): ventana propia, más memoria, proyectos en el disco, enlaces externos
  en el navegador del sistema. `.github/workflows/desktop.yml` compila Windows, macOS y Linux al subir la etiqueta de la
  entrega y los publica en **Releases** con instrucciones (`desktop/RELEASE_NOTES.md`). README con la sección de descarga.

**Por qué.** Las imágenes de sondeo traen escalas que falseaban techo y muro; las zonas excluidas se veían en la columna;
el área de análisis solo se podía cambiar dibujando un rectángulo; la página se quedaba sin memoria.

**Comprobación.** `npm test` 44 y `pytest` 9. Navegador: arranque sin proyectos; recorte de 20 px que recalcula el techo
(0 → 0,533 cm); Start arrastrado a la fila 40; zonas excluidas en blanco en la columna; sin errores. Programa de escritorio
compilado aquí para Linux (AppImage 127 MB, deb 93 MB) y abierto con Playwright: carga `app://`, muestra V31, arranca vacío,
abre el proyecto de entrenamiento y el almacenamiento queda persistente. Windows y macOS se compilan en GitHub Actions.

**Pendiente o problemas conocidos.** Ejecutables sin firma (avisos de Windows y macOS). Electron limita cada ventana a unos
4 GB de objetos JavaScript; si siguiera faltando memoria con proyectos muy grandes, el siguiente paso es guardar las
imágenes en disco y cargarlas por sección (pendiente desde V22).

---

## V29 — Publicaciones actualizadas y exportación a Word y LaTeX (01-11-2026)

**Qué se hizo.** Puesta al día de las publicaciones previstas con lo desarrollado hasta V28 y versión descargable del
dossier en Word y LaTeX.

**Cambios.**
- `publications/README.md`: cartera de 5 trabajos (software; dataset y segmentación; validación y aplicación;
  clasificación multiproxy, nuevo; nota en Geogaceta, nueva), orden recomendado 1 → 5 → 4 → 2 → 3 y tabla de qué puede
  afirmar hoy cada uno.
- `METODOS_Y_DEFENSA.md`: las notas de versión dispersas pasan a una sección «Lo que hay que saber del software»;
  se recolocan dos notas que estaban en el artículo 2; artículo 1 con todos los módulos (multiproxy, mapas, gráficos,
  proyecto de entrenamiento); artículo 4 con clasificadores, red neuronal, cifras de V26, prueba final independiente y
  respuesta sobre el sesgo de selección de modelo; artículo 5 nuevo.
- Borradores nuevos: `04_multiproxy_classification/draft.md` (inglés) y `05_nota_geogaceta/draft.md`.
- Borrador JOSS: nombre CorAnTool y funciones de la aplicación web.
- `tools/export_publications.py` (pandoc) genera `publications/export/Publicaciones_CorAnTool.docx` y `.tex` (citas
  del borrador JOSS resueltas con su `paper.bib`; símbolos fuera de Latin-1 convertidos para que compile con pdflatex).

**Por qué.** Petición de Santiago: actualizar las potenciales publicaciones en GitHub y poder descargarlas en Word y
LaTeX.

**Comprobación.** El `.tex` compila con pdflatex (18 páginas) y el `.docx` se abre y convierte bien (19 páginas);
tablas y listas revisadas visualmente. Pruebas del programa sin cambios (`npm test` 44, `pytest` 9).

**Pendiente o problemas conocidos.** Las cifras de los borradores son provisionales. El programa no cambia (V27).

---

## V28 — Traspaso a Claude Code (01-11-2026)

**Qué se hizo.** Nota `docs/TRASPASO_CLAUDE_CODE.md` para seguir el proyecto en Claude Code: estado, cómo ejecutar la
app y las pruebas, dónde van los datos privados, estructura y lista de pendientes por prioridad.

**Cambios.** Solo documentación; `DELIVERY` pasa a V28. Sin cambios en el programa respecto a V27.

**Por qué.** Santiago decide continuar el desarrollo en Claude Code con el repositorio en su ordenador.

**Comprobación.** `npm test` 44 y `pytest` 9 correctas.

**Pendiente o problemas conocidos.** Ver la lista de la nota de traspaso.

---

## V27 — Barra de progreso del entrenamiento y número de versión visible (01-11-2026)

**Qué se hizo.** Petición de Santiago: una barra de progreso visible al entrenar los modelos y un indicativo de
versión en el archivo descargable y en el propio programa.

**Cambios.**
- Entrenamiento por pasos sin bloquear la página: barra de progreso arriba de Multiproxy y en el pie del panel,
  con el paso en curso («Entrenando «Red» · Capas orgánicas · época 120/200», «validación 3 de 7»), el tiempo
  restante estimado y **Cancelar** (conserva los modelos anteriores). Los botones de entrenar se desactivan mientras
  tanto; al terminar, aviso con la duración.
- `geo.js`: `crossValidateSteps` y `fitModelSteps` (generadores); la red neuronal cede tras cada época.
- **Versión:** etiqueta «V27» junto a CorAnTool en la cabecera, en la pantalla inicial y en la ayuda; título de la
  ventana «CorAnTool V27»; campo `delivery` en los proyectos guardados; el archivo sin conexión pasa a llamarse
  `CorAnTool_V27.html` (el número sale de `DELIVERY` en `app.js`).

**Por qué.** Con redes neuronales o muchos clasificadores el entrenamiento tarda segundos y la página parecía
colgada; y con varias versiones descargadas no se sabía cuál era cuál.

**Comprobación.** `npm test`: 44 correctas (nueva: la validación cede una vez por pliegue y la red una vez por época,
con el mismo resultado que la llamada directa). En navegador: barra avanzando de 0 a 100 % con textos de pliegue y
época, Cancelar a mitad de una red grande (64,32 neuronas, 600 épocas) mantiene el modelo anterior; etiqueta V27 en
la cabecera y la pantalla inicial; título de la ventana con la versión. Sin errores.

**Pendiente o problemas conocidos.** Al cambiar de entrega hay que actualizar `DELIVERY` en `app.js` (anotado en
CLAUDE.md).

---

## V26 — Familias, clasificación manual en columnas, clasificadores a medida y red neuronal (01-11-2026)

**Qué se hizo.** Rediseño del modo Multiproxy según lo pedido por Santiago: abrir sondeos y ver su compuesto;
crear familias de intervalos (periodo frío/cálido; baja oxigenación con sapropel, ORL…); añadir esas columnas a
sondeos que no las tenían y clasificar a mano; y crear columnas de clasificación automática referidas a una o varias
familias eligiendo el modelo (incluida una red neuronal) y con qué datos se alimenta.

**Cambios.**
- «Capas» pasa a llamarse **familias** (paso 3). Cada familia es una columna en todos los sondeos (opción «Mostrar
  todas las familias», activa por defecto), aunque el sondeo no tenga intervalos.
- **Clasificación manual en la propia columna:** arrastrar en vertical crea un intervalo con la última clase usada y
  abre un panel para elegir la clase (o crear una nueva); clic en un intervalo para cambiar la clase, confirmarlo o
  borrarlo. Desaparece «Marcar intervalos».
- **Clasificadores (paso 4):** lista de clasificadores; cada uno con nombre, qué familias clasifica, con qué datos
  aprende (variables del paso 2 y otras familias como 0/1), modelo (bosque aleatorio, red neuronal, k vecinos, Bayes
  ingenuo, k-medias) con explicación, ajustes avanzados, probabilidad mínima, semilla y reglas. Botones Entrenar,
  Ver resultados, Duplicar, Eliminar; «Entrenar todos» al pie.
- Cada clasificador crea una **columna ⚙** por familia en todos los sondeos (intensidad según la probabilidad).
  Clic en ella: copiar el tramo o la columna entera del sondeo a la familia (la columna entera queda pendiente de
  revisar).
- **Red neuronal** (perceptrón multicapa con Adam, L2, clases equilibradas y parada temprana) en `geo.js`.
- Pestaña **Clasificadores** (antes Modelo): tabla comparativa de todos los clasificadores y familias (acierto
  equilibrado, acierto, n) y detalle del elegido. El mapa de clases elige qué columna representar.
- Los modelos se aplican buscando sus columnas por nombre: añadir familias, variables o sondeos ya no los invalida.
- Proyectos anteriores: el primer clasificador se crea a partir de los ajustes del modelo único.

**Por qué.** El flujo anterior (una sola capa objetivo, un solo modelo, marcar intervalos con un interruptor) era
poco claro y no permitía clasificar a mano sondeos sin intervalos ni comparar modelos.

**Comprobación.** `npm test`: 43 correctas (nueva: la red neuronal aprende una frontera no lineal, es determinista y
se valida dejando un sondeo fuera); `pytest`: 9. En navegador (proyecto de entrenamiento): clasificador creado desde
los ajustes antiguos (bosque aleatorio, 90,6 % de acierto equilibrado), duplicado como red neuronal (≈ 80 %), ambas
columnas ⚙ en las curvas, tabla comparativa, intervalo dibujado en la familia «Eventos» de un sondeo y clase cambiada
desde el panel, panel de copia en una columna ⚙, mapa con las columnas automáticas. Versión sin conexión con la tesis:
clasificador creado desde los ajustes guardados (18 % de acierto equilibrado, como en §21.8 ter). Sin errores.

**Pendiente o problemas conocidos.** Elegir el mejor modelo con la misma validación sesga el acierto al alza
(ver METODOS_Y_DEFENSA). Al abrir un proyecto se reentrenan todos los clasificadores; con redes neuronales grandes
puede tardar unos segundos. Los nombres de columna no quedan fijos al desplazar en vertical.

---

## V25 — Multiproxy más claro, ayuda al pasar el ratón y columnas redimensionables (31-10-2026)

**Qué se hizo.** Revisión de usabilidad del modo Multiproxy, que resultaba caótico, y de la Columna.

**Cambios.**
- Panel izquierdo: importación en una cuadrícula de 4 botones cortos con explicación al pasar el ratón
  (los formatos y los datos de demostración, en un desplegable); los sondeos pasan de tarjetas grandes a
  una tabla compacta (nombre · lat · lon · variables · intervalos, detalle al pasar el ratón, ✎ para
  editar o eliminar); cada paso muestra un resumen en su cabecera (p. ej. «9 variables · Edad 0,5»);
  «Entrenar y clasificar» queda fijo al pie del panel con el estado del modelo.
- Ayuda emergente propia en todos los controles del modo (eje, paso, escalado, huecos, variables,
  capas, reglas, método, probabilidad mínima, mapa, modelo…), en los sondeos del mapa y en la matriz
  de confusión («N muestras de A clasificadas como B», qué es el acierto equilibrado).
- Curvas: barra agrupada (sondeo con ◀ ▶; marcar intervalos con capa y clase elegidas allí mismo;
  colorear por clase y ancho de columnas; probar la autoclasificación). Cursor de lectura con el valor
  de cada variable a esa altura y una ficha con bandas, profundidad o edad, etiqueta y clase predicha.
  Clic en una banda: selecciona y enfoca ese intervalo en la lista para cambiar su clase o borrarlo.
- Columnas (Curvas y Columna): el gráfico se desplaza dentro de su marco cuando hay muchas variables;
  cada columna se ensancha arrastrando su borde junto al nombre (doble clic restaura); los nombres
  ocupan hasta dos líneas; deslizador de ancho general y «Anchos por defecto».
- Lista de intervalos a la derecha de las curvas (fija al desplazarse), con selectores más anchos y
  unidades abreviadas.
- Clases de una capa: botón ✕ visible con ayuda; si la clase tiene intervalos pide confirmación
  («¿Borrar y sus N intervalos?»). Icnotaxones: ayuda en ✕ y aviso en las clases del programa.
- Texto corregido: «Hueco máximo (vacío = automático)» (desde V22 el vacío es 3 × espaciado típico).

**Por qué.** Petición de Santiago: el modo era difícil de usar, faltaba información al pasar el ratón,
las columnas se cortaban con muchos proxies y no encontraba cómo borrar clases ni cómo seleccionar en el
sondeo un tramo de una clase. En la prueba automática el borrado de clases y el marcado funcionaban, pero
eran poco visibles: la clase había que elegirla en el panel izquierdo, lejos de las curvas.

**Comprobación.** `npm test`: 42 correctas (nueva: nombres en dos líneas y anchos por columna);
`pytest`: 9. En navegador (proyecto de entrenamiento): ficha del cursor con 20 filas, cabecera con
nombre completo, columna ensanchada a 141 px y guardada, ayudas en botones, sondeos y mapa, clase
borrada, intervalo dibujado con la clase de la barra, clic en una banda que selecciona el intervalo ORL;
Columna con cursor; sin errores de la aplicación.

**Pendiente o problemas conocidos.** Los nombres de columna no se quedan fijos al desplazar en vertical
un gráfico muy alto. Siguen los pendientes de V23.

---

## V24 — Los análisis entre proyectos no son proyectos (31-10-2026)

**Qué se hizo.** Un análisis que combina sondeos de varios proyectos ya no aparece como una tarjeta más
en la lista de proyectos. Se crea, se guarda y se abre desde la pestaña «Entre proyectos» (antes
«Todos los proyectos»), que reúne todo lo que trasciende a un proyecto: mapa común, tabla de sondeos y
análisis guardados.

**Cambios.**
- Pantalla inicial: la pestaña «Proyectos» y su número excluyen los proyectos de tipo `multi`.
- Pestaña «Entre proyectos»: nuevo bloque «Análisis entre proyectos guardados» (oculto si no hay
  ninguno) con nombre, número y nombres de sondeos, y las acciones Abrir, Actualizar desde los
  proyectos, Renombrar y Eliminar (confirmación en dos pasos). El buscador también filtra esta lista.
- Con un análisis abierto, la cabecera dice «Análisis» en lugar de «Proyecto» y el botón de la pantalla
  inicial «Volver al análisis abierto».
- Textos: «Nuevo análisis entre proyectos», nota que explica que no es un proyecto.
- Sin cambios en el formato de archivo ni en los métodos (sigue siendo `projectKind: 'multi'`).

**Por qué.** Petición de Santiago: el análisis multiproyecto debe estar por encima de los proyectos,
no mezclado con ellos.

**Comprobación.** `npm test`: 41 correctas. En navegador: se crea «Alborán» con GP03 (tesis) y ENT-01
(entrenamiento); la lista de proyectos sigue mostrando 3 tarjetas; «Alborán» aparece solo en
«Entre proyectos»; abrir un proyecto y luego el análisis cambia la cabecera (Proyecto ↔ Análisis); sin
errores de consola.

**Pendiente o problemas conocidos.** Los mismos de V23.

---

## V23 — Pantalla inicial para cualquier usuario, sondeos compartidos y paneles redimensionables (31-10-2026)

**Qué se hizo.** La pantalla inicial deja de estar pensada para la tesis: muestra todos los proyectos
guardados (ninguno, dos o los que haya) como tarjetas iguales, con una miniatura de sus sondeos. Los
sondeos que aparecen en más de un proyecto se reconocen y no se cuentan dos veces. Los paneles laterales
de configuración se pueden ensanchar, estrechar u ocultar, y el mapa se redimensiona arrastrando su
borde derecho o inferior (pedido antes y no hecho hasta ahora).

**Cambios.**
- Pantalla inicial: cabecera con «Importar archivo», «Nuevo proyecto» (formulario con nombre
  obligatorio) y «Volver al proyecto abierto»; pestañas «Proyectos» y «Todos los sondeos» con su número;
  buscador de proyectos y sondeos; tarjeta por proyecto (sondeos como columnas con imagen, intervalos o
  aviso de sondeo compartido; número de sondeos, imágenes y compartidos; Abrir, Renombrar, Eliminar
  con confirmación en dos pasos; etiqueta de tipo). Estado vacío con acciones. Ejemplos (recorrido
  guiado, sondeo IODP, ejemplo idealizado) en un desplegable «Ejemplos y aprendizaje»; «Exportar este
  proyecto» pasa a «Copias de seguridad». Desaparece el botón propio de la tesis: es un proyecto más.
- Sondeos compartidos (mismo nombre normalizado: sin mayúsculas, acentos ni signos; solo letras y cifras):
  - mapa de todos los sondeos: un único punto; el valor es la media de los proyectos con datos;
  - tabla: ordenada por sondeo, con la etiqueta «en N proyectos» y la lista de los otros;
  - análisis multiproyecto: el mismo sondeo de varios proyectos se une en un solo sondeo (eje común,
    filas a la misma profundidad o edad fusionadas, intervalos repetidos eliminados);
  - modelo de icnotaxones: los ejemplos de otros proyectos idénticos (mismos descriptores a 3
    decimales) a los propios, a la biblioteca o a otros ya incluidos se descartan.
- Paneles: divisores entre paneles (arrastrar = ancho, doble clic = ancho por defecto, botón =
  ocultar/mostrar). Se guardan en el navegador (`ichantool.panels`).
- Mapas del proyecto y de todos los sondeos: asas en el borde derecho (ancho) e inferior (alto); doble
  clic restaura. Al fijar el alto, la extensión se amplía (nunca se recorta) para llenar el marco
  (`fitBBoxAspect`). Se guardan en `ichantool.mapFrames`.
- Plurales correctos en los textos de recuento (clave `.one`).

**Por qué.** El programa debe servir a cualquiera desde el primer arranque; los datos de la tesis
solo son una prueba. Un sondeo puede estar en dos proyectos (por ejemplo, uno de imágenes y otro de
geoquímica): contarlo dos veces sesgaría el mapa, duplicaría muestras en el análisis multiproyecto y
filtraría ejemplos repetidos entre entrenamiento y evaluación del modelo de todos los proyectos.

**Comprobación.** `npm test`: 41 pruebas correctas (nueva: `fitBBoxAspect` en tres proyecciones);
`pytest`: 9 correctas. En navegador (Playwright): tarjetas con 3 proyectos, búsqueda sin resultados,
modo oscuro; un sondeo renombrado a GP03 en el proyecto de entrenamiento aparece como compartido en las
tarjetas y en la tabla, un solo punto en el mapa, y el análisis multiproyecto crea un único GP03 con 51
variables; divisor izquierdo arrastrado (436 px), panel derecho ocultado, mapa reducido en alto (689 →
383 px) y en ancho; sin errores de consola.

**Pendiente o problemas conocidos.** La coincidencia de sondeos es por nombre: dos sondeos distintos
con el mismo nombre se unirían (avisado con la etiqueta). Sigue pendiente lo que dejó el concilio:
importación unificada, modelo de edad en el diálogo del sondeo, imágenes en almacén aparte, fuentes
incrustadas, mapa de varianza de kriging, importancia por permutación y red neuronal (MLP) opcional.

---

## V22 — Revisión del concilio: métodos, usabilidad, interfaz y código (31-10-2026)

**Qué se hizo.** Tres agentes revisaron el proyecto por separado (métodos científicos; navegación y
usabilidad; diseño visual y código) y se aplicaron los cambios de más valor.
- **Métodos (se corrigen resultados):**
  - La evaluación de icnotaxones contaba mal: las predicciones de un taxón ausente del conjunto de prueba
    se descartaban y el acierto salía inflado (en una prueba, 100 % con 0 aciertos). Ahora cuentan como error.
  - Validación **por imagen (sección)**: trazas de la misma imagen nunca están a la vez en entrenamiento y
    prueba (grupos y dejar-uno-fuera).
  - El clasificador de intervalos ya no se puntúa con sus propias reglas (era circular); da también el acierto
    por sondeo (media ± desviación) y la cobertura con la probabilidad mínima.
  - El mapa de valores ya no promedia los ceros de relleno: solo datos reales.
  - Interpolación con distancias en **km** (proyección de áreas iguales), sondeos coincidentes promediados,
    variograma ponderado n/h², aviso con pocos sondeos; por defecto sin extrapolar y solo en el mar.
  - Remuestreo que no cruza huecos (3 × espaciado mediano por defecto); Bayes sin la varianza artificial 1;
    k-NN de Multiproxy sin votos casi seguros; aviso de inversiones en el modelo de edad.
- **Usabilidad:** los atajos de teclado solo actúan en Bioturbación (antes «x» en Datos cambiaba la
  herramienta y Espacio bloqueaba los botones); confirmación en dos pasos para borrar imágenes, capas,
  columnas, registros, ajustes e intervalos automáticos; **un nombre por concepto** («Columna» para la vista
  del sondeo, «Curvas» en Multiproxy, «Tramos» para la discretización, «Opacidad de trazas», «Sugerencias»,
  «categorías»); textos que aún citaban modos antiguos; parámetros con nombre en español; pantalla inicial con
  «Primeros pasos» (aprender, crear, tesis) y copias de seguridad plegadas; el recorrido empieza en el proyecto
  abierto, entrena antes de explicar el modelo y deja la pantalla inicial al final; cartel de ayuda a la
  derecha; Esc cierra la pantalla inicial; pestañas con roles accesibles; botón «Entrenar» en Modelo vacío.
- **Interfaz y código:** el panel derecho quedaba en blanco al usar las pestañas de Multiproxy (selector
  compartido); la lista de icnotaxones se cortaba (clase CSS duplicada); contraste AA (texto sobre acento,
  bordes de campos, botones activos en modo oscuro); cartel de ayuda con colores de tema; móvil sin
  desbordamiento horizontal; guardado sin solapes y aviso de espacio lleno; modelos guardados sin reajustar en
  cada guardado; el modelo en uso se ajusta al momento y los otros dos en segundo plano; miniaturas que ya no
  se pierden; IndexedDB cierra al actualizarse en otra pestaña; escape de apóstrofos.

**Cambios.** `learn.js` (evaluación, `groupedFolds`, dejar-uno-fuera por grupo), `geo.js` (`crossValidate`
con `scored`/`minProb`, `mapSummary`, `autoGap`, NB, k-NN), `interp.js` (km, fusión, Cressie, pivote, valores
por defecto), `core.js` (inversiones), `app.js`, `storage.js`, `index.html`, `i18n.js` (bloque final de
terminología), pruebas nuevas en `learn.test.mjs` y `geo.test.mjs`.

**Por qué.** Santiago pidió revisar todo con un concilio de al menos 3 agentes desde el punto de vista
científico, de navegación, de criterios científicos y de usabilidad e interfaz, y cambiar lo necesario.

**Comprobación.** 40 pruebas de la aplicación y 9 de Python. En Chromium: recorrido de 25 pasos; validación del
proyecto de entrenamiento: dejando un sondeo fuera, acierto equilibrado 90,6 %, por sondeo 92,7 ± 10,0 % (4
sondeos), cobertura 100 % con acierto 97,3 % a probabilidad 0,5; «x» en Datos ya no cambia la herramienta; el
panel derecho no desborda ni queda vacío; borrar una imagen pide confirmación; a 412 px no hay desbordamiento
horizontal; ningún error.

**Pendiente o problemas conocidos.** Queda del informe: unificar la importación de datos en un solo sitio y
mover el modelo de edad al diálogo del sondeo; guardar las imágenes en un almacén aparte (guardado más ligero);
fuentes incrustadas para el archivo sin conexión; varianza de kriging como mapa; importancia por permutación;
plurales. Los resultados de clasificación de V12–V21 pueden cambiar con la evaluación corregida.

---

## V21 — Gráficos tipo Grapher en Datos (31-10-2026)

**Qué se hizo.** En Datos → Vista → «Gráficos (tipo Grapher)»: varios gráficos por proyecto (crear, duplicar,
borrar), de dos tipos: **registro estratigráfico** (un panel por variable con el mismo eje de profundidad o edad,
un color por sondeo) y **XY** (cualquier columna frente a otra, eje Y secundario). Seis tipos de serie (línea,
puntos, línea y puntos, escalón, área, barras), ejes logarítmicos o invertidos y límites manuales, título,
tamaño, leyenda y cuadrícula; **ajustes de curva** (lineal, polinómico, exponencial, potencial, logarítmico,
media móvil) con ecuación y R²; tabla de estadística; exportación SVG, PNG y CSV.

**Cambios.** Nuevo `plot.js` (en `ORDER`) y `tests/app/plot.test.mjs`; `app.js`: `defaultPlot`, `plotSpec`,
`renderDataPlot`, `drawDataPlot`, `plots`/`plotCur` en el archivo de proyecto; `index.html` (vista y estilos);
`i18n.js`.

**Por qué.** Santiago pidió funcionalidades parecidas a Grapher en la parte de datos.

**Comprobación.** 38 pruebas de la aplicación y 9 de Python (los ajustes recuperan exactamente funciones
conocidas). En Chromium, con el proyecto de entrenamiento: registro de 3 paneles con 4 sondeos; XY Ti/Ca–Zr/Rb
de 4 sondeos con ajuste lineal (R² 0,77–0,89) y r de Pearson; ningún error.

**Pendiente o problemas conocidos.** No hay barras de error ni ejes rotos; los ajustes no dan intervalos de
confianza.

---

## V20 — Interfaz sin cortes y mapas tipo Surfer (31-10-2026)

**Qué se hizo.**
- **Paneles laterales:** los textos y botones largos ya no se cortan; las pestañas de la derecha pasan a dos
  líneas si no caben.
- **Mapa (Multiproxy y pantalla inicial):** panel «Interpolación y escala de color» con 7 métodos (inverso de la
  distancia, vecino más cercano, triangulación lineal, curvatura mínima, funciones de base radial, kriging con
  variograma automático o manual, media móvil) y sus parámetros explicados; tamaño de celda; rellenar mar y
  tierra, solo mar o solo tierra; solo dentro del contorno de los sondeos; isolíneas con valores; 8 escalas de
  color, rango y clases; **barra de color**.
- **Lista de sondeos** del mapa con casillas para quitar los que no se quieran.
- **Proyección:** equirrectangular, Mercator (con fondos raster) o Lambert azimutal de áreas iguales.
- **Mapa más grande:** ocupa todo el ancho, botón para ocultar el panel y pantalla completa.
- **PNG** a 1800–7200 px, con el fondo raster descargado a esa resolución.

**Cambios.** Nuevo `interp.js` (interpolación, Delaunay, variograma, isolíneas, escalas) en `ORDER`;
`geo.js`: `makeProjection`, `mapFrame`, `MAP_PROJECTIONS`, celdas, isolíneas y barra de color en `buildMapSVG`;
`app.js`: `valueLayer`, `interpUI`, `coreListUI`, `exportMapPNG`, fondos en EPSG:3857, zoom con proyección
inversa; `index.html`: CSS de paneles y mapa, botones; `i18n.js`; `tests/app/interp.test.mjs`.

**Por qué.** Petición de Santiago: arreglar la interfaz cortada; modos de interpolación como Surfer, lista de
sondeos, celdas más pequeñas, barra y escala de color, solo mar/tierra, mapa más grande, resolución del PNG y
proyección.

**Comprobación.** 36 pruebas de la aplicación y 9 de Python. Sin desbordamiento horizontal en los paneles a 412,
1280 y 1500 px. En el proyecto de entrenamiento (Ba/Ti, 6–10 ka): los 7 métodos dibujan la malla; kriging ajusta
el variograma (esférico, pepita 0,18, meseta 0,91, alcance 22,7°); isolíneas, solo mar, 200 celdas; quitar ENT-01
deja 6 sondeos; Lambert y Mercator con zoom; PNG de 3600 px descargado; ningún error.

**Pendiente o problemas conocidos.** Con pocos sondeos (7) cualquier interpolación es especulativa: el variograma
automático es poco fiable. Lambert no admite fondos raster.

---

## V19 — Proyecto de entrenamiento y recorrido guiado (31-10-2026)

**Qué se hizo.**
- **Proyecto de entrenamiento** (botón en la pantalla inicial): 7 sondeos ficticios en posiciones aleatorias
  del Mediterráneo (Alborán, Baleares, Tirreno, Jónico, Adriático, Egeo, Levantino) con 12 registros
  sintéticos, modelos de edad, turbiditas, tefras, periodos climáticos y una capa orgánica descrita solo en 4
  sondeos. ENT-03 tiene una imagen sintética con 122 trazas de 4 icnotaxones; la mitad ya está etiquetada.
- **Carteles de ayuda** en cada pestaña con una tarea concreta para practicar.
- **Recorrido guiado** de 25 pasos por todo el programa (pantalla inicial, sondeos, Bioturbación, modelos,
  Registro, Datos, Multiproxy, mapa, Figuras, Ayuda).

**Cambios.**
- Nuevo `tools/make_tutorial.py` y `examples/tutorial/` (datos sintéticos, verdad de las trazas, README).
- `app.js`: `buildTutorialProject`, `openTutorial`, `updateTip`, `TOUR`, `startTour`, `showTourStep`.
- `index.html`, `i18n.js`: botón, tarjeta de ayuda, capa del recorrido, textos de 25 pasos y carteles.
- `tools/build_standalone.py`: los archivos del tutorial van dentro del archivo único.

**Por qué.** Santiago preguntó si era viable un proyecto de entrenamiento con sondeos artificiales, muchos
carteles de ayuda y un recorrido que explique qué hace cada cosa, con 6–7 sondeos en el Mediterráneo.

**Comprobación.** 34 pruebas de la aplicación y 9 de Python. En Chromium: el proyecto se crea con 7
sondeos (12 registros; ENT-03 con 20 columnas al sumar la imagen), 4 capas y 72 intervalos; la detección
encuentra 122 objetos (las 122 trazas dibujadas), 61 etiquetados y 60 con sugerencia; los 25 pasos del
recorrido resaltan su elemento; los carteles cambian con la pestaña; ningún error.

**Pendiente o problemas conocidos.** Las trazas sintéticas son esquemáticas (formas geométricas): sirven para
aprender el flujo de trabajo, no para calibrar el clasificador con trazas reales. Las profundidades de agua son
inventadas (p. ej. el Adriático central real es mucho más somero).

---

## V18 — Control del entrenamiento y guía de los modelos (31-10-2026)

**Qué se hizo.** En Aprendizaje hay un botón «Modelos y entrenamiento…» que abre un diálogo con cuatro
pestañas:
- **Cómo funciona:** guía para alguien sin formación en aprendizaje automático (qué mide el programa
  de cada traza, los tres métodos, qué modelo usar, cómo leer las cifras, buenas prácticas) y una
  recomendación con los datos del proyecto.
- **Método y evaluación:** elegir k-NN, Random Forest o Bayes ingenuo y sus parámetros, con
  explicación de cada uno; «Evaluar y comparar» prueba los 3 métodos con los 3 modelos sobre las mismas
  trazas no vistas, muestra acierto equilibrado y total, la matriz de confusión, recomienda una
  combinación y la aplica con un clic.
- **Ejemplos usados:** las imágenes de las trazas que usa cada modelo, por taxón; se puede desmarcar
  una traza como ejemplo (sigue etiquetada), quitar ejemplos de la biblioteca o ir a la traza.
- **Ejemplos de otros proyectos:** ver las trazas etiquetadas de otro proyecto con su imagen y añadir
  las elegidas a la biblioteca de este.

**Cambios.**
- `learn.js`: peso del voto configurable; `rng`, `stratifiedFolds`, `TaxonModel`, `evaluateModels`.
- `app.js`: `ML_DEFAULT`, `mlOpt`, `mkModel`, `ownExamples`, `mlSets`; modelos `TaxonModel`; `o.nt`
  guardado; lista de exclusión `ml.excluded`; ejemplos del índice `lite` con clave y miniatura;
  `thumbOf`; diálogo (`renderMl`, `mlTrainHTML`, `runMlEval`, `mlExamplesHTML`, `mlOthersHTML`).
- `index.html`, `i18n.js`: diálogo, estilos y textos (guía en español e inglés).
- `tests/app/learn.test.mjs`: grupos estratificados, Random Forest y evaluación.

**Por qué.** Santiago pidió control sobre el entrenamiento, saber qué aprendizaje automático se usa,
información para elegir modelo sin ser especialista, y ver, quitar y añadir (de otros proyectos) las
imágenes de entrenamiento.

**Comprobación.** 34 pruebas de la aplicación y 9 de Python. En Chromium, con 40 trazas etiquetadas en
el sondeo de prueba (3 taxones, etiquetas de prueba asignadas por forma): evaluación de las 9
combinaciones (k-NN 81 %, RF 93 %, Bayes 88 % de acierto equilibrado), «Usar esta combinación» aplica
RF; desmarcar un ejemplo deja 39 de 40 en uso; 40 miniaturas; ningún error.

**Pendiente o problemas conocidos.** Con un solo sondeo etiquetado los tres modelos dan lo mismo. RF se
reajusta en cada cambio (con muchos ejemplos puede tardar algo). Las miniaturas de otros proyectos
aparecen cuando esos proyectos se guardan con esta versión.

---

## V17 — Análisis multiproyecto y modelos por sondeo, proyecto y todos (31-10-2026)

**Qué se hizo.**
- **Todos los proyectos en su propia pestaña** de la pantalla inicial, con tabla, mapa y un nuevo
  **análisis multiproyecto**: se marcan sondeos de varios proyectos y se crea un proyecto de análisis
  donde se usan Multiproxy, Datos y Figuras con todos ellos. Se puede actualizar desde los proyectos de
  origen.
- **Tres modelos de icnotaxones:** el del sondeo abierto, el de todo el proyecto y el de todos los
  proyectos, ajustados a la vez y guardados (proyecto y sondeos en el archivo de proyecto; todos los
  proyectos en el navegador). En Aprendizaje se elige qué modelo sugiere y se ven los ejemplos y el
  acierto de cada uno. En el panel del objeto aparece la **probabilidad de cada icnotaxón según cada
  modelo**.

**Cambios.**
- `learn.js`: `vote` devuelve `probs`; `predict` las incluye (también en formas nuevas); `toJSON`,
  `fromJSON`; `LOO_MAX`.
- `app.js`: `clfs`, `CLF_SCOPES`, `learnNow` con tres conjuntos, `refreshOtherExamples`, `saveAllModel`,
  `projectModels`, `probTable`; `settings.clfScope`; ejemplos en el índice `lite`; `projectKind`,
  `multiSource` y `models` en el archivo de proyecto; `buildMultiProject`, `updateMultiProject`,
  pestañas de la pantalla inicial.
- `index.html`, `i18n.js`: pestañas, recuadro multiproyecto, selector de modelo y tablas.
- `tests/app/learn.test.mjs` (probabilidades, novedad, guardar y recuperar el modelo).

**Por qué.** Petición de Santiago: ver todos los proyectos en otra pestaña con figuras y análisis
multiproxy entre proyectos; entrenar la clasificación por sondeo, proyecto y todos los proyectos,
guardar esos pesos y ver la probabilidad de cada taxón según el modelo.

**Comprobación.** 33 pruebas de la aplicación y 9 de Python. En Chromium: análisis «Prueba multi» con
GP03, LC10 (Tesis) y U1385I-1H (prueba): 3 sondeos, 7 capas unidas por nombre, 41 intervalos, 12
variables, 182 muestras; «Actualizar» lo rehace; con 12 objetos etiquetados en el sondeo de prueba los
tres modelos tienen 12 ejemplos y el panel muestra la tabla de probabilidades; ningún error.

**Pendiente o problemas conocidos.** El análisis multiproyecto copia los datos: no cambia solo cuando
cambian los proyectos de origen (hay que pulsar «Actualizar»). El modelo de todos los proyectos usa la
copia ligera guardada de cada proyecto, que se actualiza al guardarlo.

---

## V16 — CorAnTool y todos los sondeos de la tesis (31-10-2026)

**Qué se hizo.**
- **Nombre:** el programa pasa a llamarse **CorAnTool** (*Core Analysis Tool*, antes IchAnTool), como
  eligió Santiago, porque ya no es solo icnología. Se conserva todo lo necesario para no perder datos:
  claves del navegador, paquete Python `ichantool` y lectura de archivos antiguos.
- **Datos de la tesis completos:** además de ODP 977A, ODP 976, GP03 y LC10, el proyecto «Tesis» carga
  GP14, LC21, LC01, LC05, LC06, LC12, LC14 y LC20 desde la carpeta «Proyectos Investigación».
- **Foraminíferos:** GP03 suma arena > 63 µm, P/B, riqueza y N/g de bentónicos (a los grupos de
  oxigenación ya cargados); LC21 trae los isótopos de foraminíferos planctónicos de Amies et al. (2019).
- El proyecto «Tesis» guardado en el navegador se actualiza solo una vez.

**Cambios.**
- `tools/make_thesis_dataset.py`: `extra_cores` (GP14, LC21, LC12, LC01, LC05, LC06, LC14, LC20),
  `xrf_ratios`, `itrax_txt`, `write_core`; manifiesto `extra_cores.json`; variables nuevas de GP03.
- `app.js`: carga de los sondeos del manifiesto en `loadThesisCores`; `THESIS_DATA = 2` y
  actualización en `ensureThesisProject`; `APP`/`APP_NAMES`; nombres de los archivos exportados
  (`.corantool.json`, `corantool_*`).
- `index.html`, `i18n.js`, cabeceras de los módulos, `README.md`, `app/README.md`, `CLAUDE.md`,
  `tools/build_standalone.py` (salida `dist/CorAnTool_V<n>.html`).

**Por qué.** Santiago pidió que estuvieran todos los sondeos y los foraminíferos de su carpeta, y
preguntó si era el momento de cambiar el nombre; eligió CorAnTool.

**Comprobación.** 32 pruebas de la aplicación y 9 de Python. Salidas: GP14 401 filas (83 variables),
LC21 2726 (18), LC12 265, LC01 1356, LC05 2082, LC06 2669, LC14 316, LC20 290 (medias de 1 cm). En
Chromium, el proyecto «Tesis» se crea con los 12 sondeos y sin errores; el título y la marca dicen
CorAnTool.

**Pendiente o problemas conocidos.** Coordenadas de GP14, LC01, LC05, LC06, LC12, LC14 y LC20 (no
están en los archivos): añadir con ✎. Modelos de edad de LC01, LC05, LC06, LC12, LC14 y LC20. La
profundidad de LC06, LC14 y LC20 es supuesta (secciones apiladas). El repositorio de GitHub sigue
llamándose IchAnTool-Project (renombrarlo es decisión de Santiago). Los recuentos por especie de
foraminíferos de GP03 (≈ 200 especies) no se cargan, solo los índices y grupos.

---

## V15 — Personalización y zoom de los mapas (31-10-2026)

**Qué se hizo.** Los mapas (Multiproxy → Mapa, mapa multiproyecto de la pantalla inicial, y por tanto
Figuras, panel flotante y ventana del mapa) tienen un panel «Personalizar mapa y zoom»:
- **Fondo:** simple (vectorial, funciona sin conexión), mapa físico, relieve sombreado, topográfico,
  batimétrico, batimétrico y topográfico (GEBCO), foto aérea/satélite y foto aérea + batimetría
  (GEBCO en el mar y foto recortada a la tierra). Opacidad del fondo y línea de costa opcional.
- **Sondeos:** símbolo (círculo, cuadrado, triángulo, rombo, estrella, hexágono, cruz), tamaño,
  tamaño según la fracción de la clase o fijo, color de relleno (sin dato o modo situación) y de borde.
- **Etiquetas:** sí/no, tamaño, color, halo y valor en la etiqueta.
- **Otros:** colores de tierra y mar del mapa simple, retícula, barra de escala y flecha de norte.
- **Zoom:** rueda del ratón (centrado en el cursor), arrastrar para mover, doble clic para acercar
  (Mayús + doble clic aleja), botones ＋ − «Ajustar a los sondeos» y extensión editable (O S E N).
- El estilo y la extensión del mapa del proyecto se guardan con el proyecto; los del mapa multiproyecto,
  en el navegador. La atribución de cada fondo se escribe en el mapa y en el SVG exportado.

**Cambios.**
- `geo.js`: `MAP_STYLE`, `MAP_SYMBOLS`, `symbolSVG`, `mapGeometry`, `zoomBBox`; `buildMapSVG` acepta
  `style` y `bg` (imagen en EPSG:4326 estirada sobre el área del mapa, segunda imagen recortada a la
  tierra, atribución), barra de escala y norte; la leyenda usa el símbolo elegido.
- `app.js`: fondos `MAP_BG` (servicios Esri `export` y WMS de GEBCO) con caché y vuelta al mapa simple
  si no hay conexión; `mapStyleUI`, `attachMapZoom`; `S.geo.map.style` y `S.geo.map.view`.
- `index.html`, `i18n.js`: paneles `#gmStyle` y `#amStyle`, textos `ms.*`.
- `tests/app/geo.test.mjs`: prueba de símbolos, estilo, fondo, recorte y zoom.

**Por qué.** Petición de Santiago: elegir tamaño y símbolo de los sondeos, etiqueta, color y fondo
(físico, batimétrico, batimétrico y topográfico, foto aérea, foto aérea + batimetría…) y hacer zoom.

**Comprobación.** 32 pruebas de la aplicación y 9 de Python. Desde el navegador de Santiago, los seis
servicios de fondo devuelven imagen JPEG (HTTP 200) con CORS. En Chromium (servicios simulados):
fondo «foto aérea + batimetría» con dos imágenes y recorte a la tierra, estrellas, zoom con rueda y
arrastre que cambian la extensión guardada, la figura de mapa incluye el fondo, mapa multiproyecto
con fondo GEBCO y zoom; ningún error.

**Pendiente o problemas conocidos.** Los fondos necesitan conexión a internet (sin ella se usa el mapa
simple). La costa vectorial (1:50 m) no coincide exactamente con la foto a mucho zoom. Antes de
publicar un mapa con fondo Esri o GEBCO hay que revisar sus condiciones de uso y citar la fuente
(ya escrita en el mapa).

---

## V14 — Proyectos con sondeos, Datos, ventanas y Figuras (31-10-2026)

**Qué se hizo.** Se reorganizó el programa como pidió Santiago:
- **Pantalla inicial** con los proyectos y «Todos los proyectos»: tabla de los sondeos de todos los
  proyectos (clic para abrir) y **mapa multiproyecto** (situación, valor de una variable o categoría
  dominante de una capa en una ventana de edad).
- **Proyecto → sondeos.** Cada proyecto tiene varios sondeos; cada sondeo guarda sus imágenes y su
  bioturbación, datos importados, registros, modelo de edad e intervalos. La icnología (Bioturbación)
  y el Multiproxy son pestañas separadas que trabajan sobre los mismos sondeos.
- **Datos:** todos los datos del proyecto distinguiendo importados, creados y calculados; columnas
  calculadas por fórmula, columnas manuales y una hoja libre tipo Excel.
- **Ventanas:** mapa, registros multiproxy y registro del sondeo en otra ventana que se actualiza sola,
  o en un panel flotante dentro de la misma.
- **Figuras:** trazas representativas por icnotaxón (elección manual o automática), sondeo entero
  interpretado, registro, registro multiproxy y mapa, con título y pie, en SVG y PNG.
- La tesis pasa a ser un proyecto propio («Tesis Casanova-Arenillas (2023)») que se crea la primera
  vez; ya no se mezcla con el sondeo de prueba.

**Cambios.**
- `app.js`: modelo de sondeos (`makeCore`, `activateCore`, `refreshCoreData`, `coreImageParts`),
  formato de proyecto v3 con conversión de v1/v2 (`upgradeProject`), pantalla inicial
  (`showHome`, `renderAllProjects`, `buildAllMap`), pestaña Datos, ventanas (`openWindow`,
  `startWindow`) y panel flotante, Figuras (`traceCanvas`, `autoPick`, `tracesSVG`, `coreSVG`,
  `wrapFigure`); el multiproxy usa los sondeos del proyecto; se quita «Añadir el sondeo de las imágenes».
- Nuevo `sheet.js` (fórmulas, sin `eval`) y `tests/app/sheet.test.mjs`.
- `storage.js`: base de datos v3 con almacén `lite`.
- `index.html`, `i18n.js`: cabecera con proyecto, sondeo (+, ✎) y pestañas Bioturbación, Registro,
  Datos, Multiproxy y Figuras; pantalla inicial; diálogo de sondeo; panel flotante.

**Por qué.** Petición de Santiago: separar icnología y multiproxy, organizar por proyectos y sondeos,
ver y calcular datos como en Excel, trabajar en un sondeo mientras se ve el mapa en otra ventana,
navegar por todos los proyectos con mapas multiproyecto y sacar figuras.

**Comprobación.**
- 31 pruebas de la aplicación (2 nuevas de fórmulas) y 9 de Python.
- En Chromium, perfil limpio: se crean el sondeo de prueba y el proyecto de la tesis; pantalla
  inicial con 2 proyectos y 6 sondeos en la tabla; mapa multiproyecto por proyecto; figura de
  trazas (2 icnotaxones × 4 trazas elegidas automáticamente) y figura del sondeo entero; pestaña
  Datos (2174 filas), columna calculada `[Bioturbación %] * 2` y celda `=MEAN(COL("Bio_x2"))`;
  multiproxy con los sondeos del proyecto; panel flotante del mapa; sondeo nuevo añadido; ventana
  nueva del mapa en solo lectura; ventana del registro del sondeo; proyecto de la tesis con
  validación dejando un sondeo fuera; selección por recuadro y exclusión rectangular siguen igual;
  ningún error de JavaScript.

**Pendiente o problemas conocidos.**
- Con `file://`, la ventana nueva puede no recibir cambios en algunos navegadores (queda la
  comprobación cada 4 s y el panel flotante).
- Los proyectos restaurados desde archivo aparecen en «Todos los proyectos» cuando se abren una vez.
- El registro del sondeo necesita imágenes; los sondeos solo con datos se ven en Multiproxy.
- La bioturbación de GP03 y LC10 de la tesis sigue sin cargar.

---

## V30 — Coordinación entre Claude y Codex (05-11-2026)

**Qué se hizo.** Preparar el repositorio para colaborar desde Claude Code y chats
especializados de Codex con contexto acotado.

**Cambios.** `AGENTS.md` remite a las reglas comunes de `CLAUDE.md`;
`docs/COORDINACION_IA.md` define ámbitos de chat, turno de un solo editor en `master`,
sincronización y traspaso. Se enlazan desde las instrucciones y el README. El traspaso
de noviembre de V28/V29 queda señalado como histórico. `DELIVERY` pasa a V30.

**Por qué.** Evitar cambios simultáneos sobre la misma copia y lecturas o auditorías
repetidas al distribuir el trabajo entre herramientas y modelos.

**Comprobación.** 44 pruebas JavaScript correctas con `node --test tests/app/*.test.mjs`
(mismo comando de `npm test`, sin npm en PATH), 9 pruebas Python correctas con
`.\.venv\Scripts\python.exe -m pytest -q` y generación correcta de
`dist/CorAnTool_V30.html` con `tools/build_standalone.py`. `git diff --check` sin errores.
Se creó un entorno Python local ignorado por Git. No se realizó una revisión visual
de la interfaz; el cambio en la app se limita a la etiqueta de entrega.

**Pendiente.** Los pendientes funcionales de V29 continúan sin cambios. Los chats no
inician trabajo de producto al crearse. La reserva de edición es una convención compartida,
no un bloqueo automático del sistema de archivos.

---

## Cómo mantener este documento

En cada entrega nueva:
1. Añadir una sección `V<n>` con fecha y los cinco apartados.
2. Añadir la fila a la tabla de resumen.
3. Si cambia un algoritmo o un valor por defecto, actualizar `DOCUMENTACION_TECNICA.md` en la misma
   entrega.
4. Actualizar `CHANGELOG.md` (resumen breve en inglés para usuarios externos).
