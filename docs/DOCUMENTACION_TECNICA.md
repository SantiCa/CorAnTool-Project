# Documentación técnica de CorAnTool (antes IchAnTool)

Versión del documento: V22 (31-10-2026). Componentes descritos: paquete Python 3.0.0.dev0 y
aplicación web 1.7.

**Nombre (desde V16).** El programa pasa a llamarse **CorAnTool** (*Core Analysis Tool*): nació como
IchAnTool (icnología, Casanova-Arenillas et al., 2020) y ahora analiza también registros multiproxy.
Por compatibilidad se mantienen el nombre del paquete Python (`ichantool`), las claves del
almacenamiento del navegador (`ichantool*`) y la lectura de archivos con `app: 'IchAnTool'`; los
nuevos archivos llevan `app: 'CorAnTool'` y la extensión `.corantool.json`.

Este documento explica **cómo funciona cada parte**, con las fórmulas y los valores por defecto
tal como están en el código. Cada apartado indica el archivo donde está implementado, para poder
comprobarlo. Al final de cada bloque hay una nota **«Para el revisor»** con la justificación y los
límites del método.

## Índice
1. Arquitectura general
2. Convenciones: orientación, zona de análisis y escala de profundidad
3. Porcentaje de bioturbación por intervalos
4. Índices BI e ii
5. Modelo de edad
6. Realce de la imagen
7. Detección automática de trazas
8. Herramientas de edición y capa de exclusión
9. Descriptores de cada objeto
10. Aprendizaje: identificación de icnotaxones
11. Qué se cuenta como bioturbación
12. Exportación y formatos de archivo
13. Validación realizada
14. Limitaciones conocidas
15. Reproducibilidad
16. Resolución de trabajo al importar
17. Proyectos (carpetas) y guardado automático
18. Registro compuesto del sondeo
19. Registros externos
20. Ajustes del usuario y copias de seguridad
21. Herramienta multiproxy: registros numéricos, capas de intervalos y clasificación automática de intervalos
22. Organización del programa: proyectos, sondeos, datos, ventanas y figuras
23. Referencias

---

## 1. Arquitectura general

El proyecto tiene dos implementaciones que comparten las mismas definiciones de cálculo:

| Componente | Lenguaje | Uso | Carpeta |
|------------|----------|-----|---------|
| Paquete `ichantool` | Python (NumPy, Pillow, pandas) | Análisis por lotes, scripts, reproducibilidad | `src/ichantool/` |
| Aplicación web | JavaScript (sin librerías, salvo UTIF para TIFF) | Trabajo interactivo: realce, detección, edición, etiquetado | `app/` |
| Código original | Python 3.7 | Reproducir el artículo de 2020 | `legacy/` |

Flujo de trabajo común:

```
imagen del testigo
   → (realce)                       solo app; no cambia el cálculo, solo lo que se ve y se detecta
   → máscara de etiquetas           cada píxel: 0 = matriz, n = objeto o clase
   → porcentaje por fila
   → intervalos de N filas          profundidad del centro, %, % por clase
   → índices BI e ii
   → (edad)                         interpolación del modelo de edad
   → CSV / Excel / PNG / proyecto
```

La aplicación web añade sobre la máscara una capa de **objetos**: cada objeto es un conjunto
conexo de píxeles con un identificador, una clase y unos descriptores. Esto permite etiquetar y
aprender.

Módulos de la aplicación web:

| Archivo | Contenido | Depende del navegador |
|---------|-----------|-----------------------|
| `app/js/core.js` | Intervalos, índices, edad, CSV, codificación RLE | No |
| `app/js/imageproc.js` | Realce, detección, componentes, varita, lazo, descriptores, giro | No |
| `app/js/learn.js` | Clasificador k-NN con rechazo de novedades | No |
| `app/js/log.js` | Registro compuesto: tablas, ejes, SVG y CSV de una ventana | No |
| `app/js/sheet.js` | Fórmulas de la pestaña Datos: columnas calculadas y celdas (analizador propio, sin `eval`) | No |
| `app/js/geo.js` | Multiproxy: muestras, capas de intervalos, etiquetas, Random Forest, k-NN, Bayes, k-medias, validación cruzada, mapas | No |
| `app/js/storage.js` | Biblioteca de proyectos (IndexedDB) | Sí |
| `app/js/app.js` | Interfaz, herramientas, dibujo, archivos | Sí |
| `app/js/i18n.js` | Textos en español e inglés | Sí |

`core.js`, `imageproc.js`, `learn.js`, `log.js` y `geo.js` no usan el navegador. Por eso se prueban automáticamente con Node
(`tests/app/core.test.mjs`).

---

## 2. Convenciones

### 2.1 Orientación
La fila 0 de la imagen es el **techo** de la sección. Si la foto está en horizontal, se gira 90°
en la aplicación (`rotate90`, `imageproc.js`).

### 2.2 Zona de análisis (ROI)
Rectángulo `[x0, x1) × [y0, y1)` en píxeles. Por defecto es la imagen completa. Sirve para dejar
fuera la escala, la carta de color y los bordes del testigo. Solo se cuentan píxeles dentro de
la zona.

### 2.3 Escala de profundidad
El usuario indica la profundidad del **borde superior** (techo, `top`) y del **borde inferior**
(muro, `bottom`) de la zona de análisis. Se supone escala lineal (sin compresión ni huecos dentro
de la sección).

Con `R = y1 − y0` filas y `Δz = (bottom − top) / R` unidades por fila, la profundidad del centro
de la fila `r` (contada desde `y0`) es:

    z(r) = top + (r + 0,5) · Δz

Resolución en píxeles por centímetro (necesaria para los descriptores físicos):

    ppcm = R / ((bottom − top) · f)      con f = 0,1 (mm), 1 (cm) o 100 (m)

Implementación: `depth.py::pixel_depths`, `app.js::depthAtRow` y `pxPerCm`.

**Para el revisor.** Se supone que los píxeles son cuadrados (misma escala en horizontal y en
vertical). Es cierto en fotografías y escáneres lineales corregidos. Si no lo fuera, las áreas
físicas tendrían un factor de error constante, pero el porcentaje no cambia, porque es una
proporción de píxeles.

---

## 3. Porcentaje de bioturbación por intervalos

Implementación: `pipeline.py::analyze_mask` (Python) y `core.js::rowCounts` + `binRows` (web).

### 3.1 Por fila
Para cada fila `r` de la zona de análisis:
- `V_r` = píxeles **válidos**: dentro de la zona y no excluidos.
- `B_r` = píxeles válidos que pertenecen a bioturbación (ver §11).
- `C_r,k` = píxeles válidos de la clase `k`.

### 3.2 Por intervalo
Desde V0.1 el usuario fija el **intervalo de análisis en centímetros** (`binCm`, 1 cm por defecto;
en Python `bin_cm`). En cada sección se convierte en filas por intervalo:

    N = max(1, binCm · ppcm)          (ppcm = filas por cm de la zona de análisis, §2.3)

`N` puede ser fraccionario. El intervalo `j` abarca las filas

    [⌊j·N + ½⌋, min(⌊(j+1)·N + ½⌋, R))

así los límites no se desplazan a lo largo de la sección (el error de cada límite es < ½ fila). Con
`N` entero se obtienen los intervalos clásicos `[jN, (j+1)N)` (parámetro `bin_px` en Python).
**El último intervalo puede ser incompleto y se conserva** (en Python se puede descartar con
`keep_partial=False`). Implementación: `core.js::binRows`/`binEdge`, `app.js::binRowsOf`,
`pipeline.py::bin_edges`.

Los proyectos anteriores a V0.1 guardaban `binPx` (filas); al abrirlos se convierte a
`binCm = binPx / ppcm` de la primera sección, de modo que esa sección conserva exactamente sus
intervalos.

    %bioturbación_j = 100 · Σ B_r / Σ V_r
    %clase_k,j      = 100 · Σ C_r,k / Σ V_r
    profundidad_j   = top + ((r0 + r1) / 2) · Δz       (centro del intervalo)

**Trazas solapadas (desde V0.20).** Un píxel puede pertenecer a varias trazas (p. ej. *Chondrites* dentro de
*Thalassinoides*). Entonces `B_r` lo cuenta **una vez** (si al menos una de sus trazas cuenta) y `C_r,k` lo cuenta una
vez **por cada clase distinta** presente en él (dos trazas de la misma clase en el mismo píxel cuentan una vez). Por
tanto `%bioturbación_j ≤ 100`, pero `Σ_k %clase_k,j` puede ser mayor que `%bioturbación_j` (y que 100): cada
icnotaxón conserva su superficie completa. Sin solapes, ambas definiciones coinciden con las anteriores.
Implementación: `core.js::rowCounts` (parámetro `stacks`); en Python, `analyze_mask` con una máscara 3-D
`(clases, filas, columnas)` de capas booleanas.

**Codificación.** `labels[i] > 0` es un objeto; `0`, matriz; `labels[i] < 0` es la pila `stacks[−labels[i]]`, lista de
objetos de abajo arriba (`core.js::idsAt, withId, withoutId, renameId`). La tabla de pilas solo crece durante la sesión
(el deshacer guarda los códigos anteriores) y se compacta al abrir el proyecto (`compactStacks`). Los descriptores de
cada objeto (§9) usan todos sus píxeles, también los solapados. Lo que necesita un solo objeto por píxel (máscara PNG,
datos de entrenamiento de la U-Net, figuras de trazas, clic) usa la traza superior.

Si un intervalo tiene menos de `minValid` (20 % por defecto) de sus píxeles válidos —es decir, `Σ V_r < minValid · N · anchura`— no tiene datos (V0.4): porcentajes, BI e ii quedan vacíos (nunca 0) y la columna lo dibuja como SIN DATOS. Opcionalmente (`noDataPad`, cm) se marcan también sin datos los intervalos de la misma sección que solapan con `[techo − pad, muro + pad]` de un intervalo sin datos. Solo en la aplicación web (el paquete Python no tiene capa de exclusión).

### 3.3 Equivalencia con la versión publicada (V2)
La V2 calculaba el porcentaje de cada fila y después la **media** de las filas del intervalo.
Si todas las filas tienen el mismo número de píxeles válidos (sin exclusiones), la media de los
porcentajes es igual al cociente de sumas de §3.2. Con exclusiones, el cociente de sumas es el
estimador correcto: cada píxel pesa lo mismo.

La profundidad asignada por la V2, `(i − N/2) · Δz + top` con `i = (j+1)N`, es la misma que la de
§3.2.

Diferencias con la V2:
- La V2 perdía el último intervalo. Ahora se conserva.
- La V2 no tenía zona de exclusión.

### 3.4 Conversión a gris y diferencia de 0,56 puntos
En el flujo heredado (imagen con la bioturbación pintada de negro), la máscara se obtiene con un
umbral sobre el gris:
- Python: `gris = 0,30 R + 0,56 G + 0,11 B` (pesos de la V2) y bioturbación si `gris ≤ 5`.
- Web: `L = 0,299 R + 0,587 G + 0,114 B` (norma ITU-R BT.601). En el ejemplo se usa el umbral
  global `L < 6`.

Los dos criterios solo difieren en píxeles casi negros, que en un JPG aparecen en los bordes de
las manchas por la compresión. Por eso la aplicación web difiere de la V2 como máximo 0,56 puntos
porcentuales, sin cambiar ningún BI ni ii (§13). El paquete Python mantiene los pesos de la V2 y la
reproduce exactamente.

**Para el revisor.** El porcentaje es una medida directa: superficie marcada como bioturbación
dividida por la superficie analizada, en la cara expuesta del testigo (2D). No estima la
bioturbación en volumen. La calidad del resultado depende de la calidad de la máscara (§7–§8),
no del cálculo, que es exacto.

---

## 4. Índices BI e ii

Implementación: `indices.py` (Python) y `core.js::BI, II, classify` (web). Cada tramo es un
intervalo semiabierto `[mínimo, máximo)` en porcentaje.

### 4.1 Bioturbation Index (Reineck, 1963; Taylor y Goldring, 1993)

| BI | Rango de % |
|----|-----------|
| 0 | [0, 1) |
| 1 | [1, 5) |
| 2 | [5, 31) |
| 3 | [31, 61) |
| 4 | [61, 91) |
| 5 | [91, 100) |
| 6 | 100 |

### 4.2 Ichnofabric index (Droser y Bottjer, 1986)

| ii | Rango de % |
|----|-----------|
| 1 | [0, 1) |
| 2 | [1, 10) |
| 3 | [10, 40) |
| 4 | [40, 60) |
| 5 | [60, 100) |
| 6 | 100 |

Son los mismos tramos de la V2. En Python se pueden definir otros esquemas con `IndexScheme`,
sin tocar el código.

### 4.3 Índices manuales (aplicación web)
En la tabla de resultados el usuario puede anotar su propio BI e ii visual en cada intervalo. Se
guarda como un tramo de profundidad `[desde, hasta)`. Si se cambia el tamaño del intervalo, cada
intervalo nuevo hereda el valor manual del tramo que contiene su centro. Se exporta en las
columnas `BI_manual` e `ii_manual`.

**Para el revisor.** BI e ii son escalas semicuantitativas pensadas para estimación visual. El ii
de Droser y Bottjer también tiene en cuenta si se conserva la estructura sedimentaria original
(ii 6 = homogeneización total). Aquí solo se calcula su componente de **porcentaje**: es una
conversión automática y reproducible, no un sustituto de la descripción del icnofábrica. Por eso
la aplicación guarda también el índice manual, y la comparación entre ambos es objeto del
artículo 3.

---

## 5. Modelo de edad

Implementación: `depth.py::depth_to_age` (Python) y `core.js::parseAgeModel, interpAge` (web).

- Desde V0.28 (solo web): cada línea puede llevar dos columnas más, `edad mínima, edad máxima` (p. ej. el intervalo
  del 95 % de Bacon), que se usan solo si están en todas las líneas. Se interpolan linealmente como la edad central
  (`core.js::interpAgeRange`), se exportan en `age_min` y `age_max` y se dibujan como columna «Intervalo de edad»
  (máx − mín) en la columna y las figuras. La edad central (mediana o media) es la que se usa para el eje de edad.
- **Bacon** (V0.28; `core.js::baconToAgeText`): la tabla `*_ages.txt` de rbacon (`depth min max median mean`,
  profundidad en cm, edad en años cal BP) se convierte a las unidades de profundidad del sondeo (÷ cm por unidad) y de
  edad elegidas (÷ 1, 1000 o 10⁶), con la mediana (o la media, a elegir) como edad central. El programa no ejecuta
  Bacon ni usa las iteraciones del MCMC; el paquete Python todavía no lee las columnas de intervalo.
- Entrada: pares `(profundidad, edad)`, ordenados por profundidad. Los separadores pueden ser
  coma, punto y coma, tabulador o espacio, y se ignoran las líneas no numéricas.
- Edad de cada intervalo: **interpolación lineal** entre los dos puntos del modelo que rodean la
  profundidad del centro del intervalo.
- Fuera del rango del modelo:
  - Web: sin valor.
  - Python: `NaN`, o extrapolación lineal con la pendiente del primer o último tramo si
    `extrapolate=True`.

**Para el revisor.** Es el mismo procedimiento usado en el artículo de 2020 para el testigo 977
(modelo de Martrat et al., 2004). La incertidumbre del modelo de edad no se propaga; habría que
hacerlo aparte.

---

## 6. Realce de la imagen (aplicación web)

Implementación: `imageproc.js::applyFilters`. **El realce solo cambia lo que se ve y lo que usa
la detección automática.** No interviene en el cálculo del porcentaje, que depende únicamente de
la máscara, ni en los descriptores de color del aprendizaje, que se calculan sobre la imagen
original (§9).

Orden de las operaciones sobre cada píxel `(R, G, B)`, con valores de 0 a 255:

1. **Canal:** color, gris (BT.601), o un solo canal R, G o B copiado a los tres.
2. **Niveles:** `v₁ = limitar((v − negro) / (blanco − negro), 0, 1)`. Con **niveles automáticos**, negro
   y blanco son los percentiles 0,5 % y 99,5 % de la luminancia (BT.601, redondeada) dentro de la zona
   de análisis (`autoLevels`).
3. **Gamma:** `v₂ = v₁^(1/γ) · 255`. Con **gamma automática** (`gammaForMedian`, adaptación propia),
   γ = ln(m) / ln(0,5), donde `m` es la mediana normalizada tras los niveles, limitada a [0,01; 0,99].
   Así la mediana pasa a gris medio. γ se limita al rango 0,19–1 publicado por Dorador et al. (2014).
4. **Contraste y brillo:** `v₃ = (v₂ − 128) · F + 128 + 2,55 · brillo`, con
   `F = 259 (C + 255) / (255 (259 − C))` y `C = 2,55 · contraste` (contraste entre −100 y 100).
   Los pasos 2 a 4 se precalculan en una tabla de 256 valores.
5. **Saturación:** `v₄ = l + (v₃ − l) · s`, con `l` = luminancia BT.601 y `s` = saturación / 100.
5b. **Vibrance:** como la saturación, pero con factor `f = 1 + (vibrance/100) · (1 − sᵥ)`, donde
   `sᵥ = (máx − mín)/255` es la saturación del píxel. Afecta más a los píxeles poco saturados. Es una
   aproximación al «Vibrance» de Photoshop, cuyo algoritmo exacto no es público.
6. **Ecualización del histograma** (opcional): sobre la luminancia, con la función de
   distribución acumulada:
   `T = (CDF(L) − CDF_min) / (n − CDF_min) · 255`.
6b. **CLAHE** (`clahe`; Zuiderveld, 1994), opcional, sobre la luminancia:
   - la imagen se divide en `nx × ny` mosaicos de unos `bloque` px (`nx = redondeo(ancho/bloque)`);
   - en cada mosaico se calcula el histograma de 256 niveles y se recorta cada nivel al límite
     `pendiente × n/256`;
   - el exceso se reparte por igual entre los 256 niveles, y la función acumulada normalizada
     (×255) es la transformación del mosaico;
   - cada píxel se transforma por **interpolación bilineal** de las cuatro transformaciones de los
     centros de mosaico más cercanos.
7. **Contraste local** (máscara de enfoque, *unsharp mask*): sobre la luminancia,
   `T' = T + a · (T − media_r(T))`, con `a = cantidad / 25` y `media_r` = media en una ventana
   cuadrada de lado `2r + 1` (desenfoque de caja separable, coste proporcional al número de
   píxeles).
8. Los pasos 6 y 7 se aplican como un **desplazamiento de luminancia** igual en R, G y B
   (`R += T' − L`, etc.), que conserva aproximadamente el tono.
9. **Inversión** (opcional): `v = 255 − v`.

Ajustes predefinidos (`FILTER_PRESETS`):

| Ajuste | Valores | Fuente |
|--------|---------|--------|
| Sin realce | todo neutro | — |
| **Dorador et al. (2014)** | niveles automáticos, gamma automática (0,19–1), contraste 20, brillo −3, vibrance −31, saturación 34 % | Dorador, Rodríguez-Tovar e IODP Exp. 339 (2014) |
| **CLAHE (Miguez-Salas et al., 2019)** | bloque 127 px, pendiente 3 | Miguez-Salas et al. (2019); valores por defecto de Fiji |
| Niveles y contraste (genérico) | negro 40, blanco 215, contraste 25, saturación 140 % | propio |
| Contraste local | cantidad 60, radio 25 px, contraste 15 | propio |
| Ecualizado + contraste local | gris, ecualizar, cantidad 40, radio 20 px | propio |

**Cómo se trasladó cada protocolo publicado.**

- **Dorador et al. (2014)** describen tres pasos en Photoshop CS6, con valores elegidos en cada
  imagen (38 testigos y 10 intervalos):
  1. Niveles: valores mínimo y máximo del histograma de entrada; medias 54,3 y 100; gris medio 0,76,
     con rango 0,19–1.
  2. Brillo y contraste: contraste medio 70 (escala −50 a 100); brillo medio −8 (escala −150 a 150).
  3. Vibrance y saturación: medias −31 y −66.

  Como los niveles dependen de cada imagen (con las imágenes del sondeo de prueba, 54–100 dejaría casi
  todo en blanco), aquí se calculan con percentiles, y la gamma se ajusta a la mediana dentro del rango
  publicado. Vibrance y saturación usan las medias publicadas. Las escalas de contraste y brillo de
  Photoshop no son lineales ni equivalentes a las nuestras, así que 20 y −3 son equivalentes aproximados
  elegidos visualmente. El usuario puede afinarlos.
- **Miguez-Salas et al. (2019)** aplican «Enhance Local Contrast (CLAHE)» de Fiji ajustando el tamaño
  de bloque y los bins del histograma, sin dar valores. Se usan los valores por defecto de Fiji
  (bloque 127, 256 bins, pendiente 3). El plugin de Fiji calcula el histograma en una ventana deslizante
  alrededor de cada píxel; aquí se usa la versión por mosaicos con interpolación (Zuiderveld, 1994).
  El efecto es equivalente, pero no idéntico píxel a píxel.

**Elegir el ajuste automáticamente** (`imageproc.js::separability`, `app.js::rankPresets`, desde V12).
Procedimiento propio, no publicado. Para cada ajuste (de fábrica y del usuario) se realza una copia
reducida de la imagen (lado ÷ k, con k tal que quedan ~0,4 MP; promedio de bloques) y se mide, en la
zona de análisis, la separabilidad de Otsu (1979) del histograma de luminancia BT.601:
`η = σ²_B(t*) / σ²_T`, con `σ²_B(t) = (μ·ω₀(t) − μ₀(t))² / (ω₀(t)·(1 − ω₀(t)))` maximizada en `t*`
(η ∈ [0, 1]). Se aplica el ajuste de mayor η y se muestran los cuatro primeros.
**Desde V0.28** el procedimiento es otro, porque η premiaba cualquier bimodalidad y la ecualización (histograma
uniforme: η = 0,75) siempre ganaba. Se prueban los ajustes y, para los de fábrica, también cada canal (R, G, B).
(1) Si en la sección hay ≥ 50 píxeles (en la copia reducida) de trazas identificadas a mano con una clase que cuenta,
se mide cuánto separa cada ajuste esas trazas de la matriz (píxeles sin traza o de la clase Artefacto, fuera de
exclusiones), con la variable que usa la detección: luminancia menos su media local de radio `radius/k` (umbral
adaptativo) o luminancia (umbral global). Puntuación = 2·AUC − 1 en el sentido de «Las trazas son» (más oscuras, más
claras o ambas: máx(AUC, 1 − AUC)), con AUC = P(matriz > traza) + ½ P(igual) a partir de histogramas
(`imageproc.js::traceSeparation`). (2) Sin trazas identificadas, separabilidad local: en cuadros de ~96 px de la
imagen completa con desviación ≥ 4 niveles se separa en el umbral de Otsu y se calcula el cociente de Fisher
`J = (μ₁ − μ₂)² / (σ₁² + σ₂²)`, que no cambia con un estiramiento de contraste y vale 6 para un histograma uniforme;
puntuación = media de `J / (J + 6)` (0,5 = como un reparto uniforme; `imageproc.js::localSeparability`). Una η alta indica dos
grupos de grises bien separados (relleno y matriz), en la línea de la comparación de valores de
píxel de Rodríguez-Tovar y Dorador (2015). Limitación: η premia cualquier bimodalidad (también
grietas o cambios de color de fondo), y un histograma uniforme da 0,75; por eso es una propuesta
inicial que el usuario revisa.

**Revisión bibliográfica (V12).** No se ha encontrado ningún trabajo posterior a Miguez-Salas et
al. (2019) que proponga cómo preseleccionar los parámetros de realce en imágenes de testigos. Los
trabajos recientes usan tomografía (*Scientific Reports*, 2020, doi:10.1038/s41598-019-57028-z) o
laminografía (*Marine Geology*, 2024, https://www.sciencedirect.com/science/article/pii/S0025322724000513) o redes neuronales
entrenadas directamente sobre la imagen sin realce previo (Di Martino et al., 2023; Kikuchi y Naruse,
2024).

**Para el revisor.** Son operaciones estándar de procesado de imagen (Gonzalez y Woods, 2018). Los dos
ajustes con fuente publicada se describen arriba, con sus diferencias respecto al original; los demás
son puntos de partida propios y así se indican en la interfaz. Los parámetros efectivos de realce de
cada sección se guardan en el proyecto, así que el procedimiento se puede reproducir.

---

## 7. Detección automática de trazas (aplicación web)

Implementación: `imageproc.js::detectMask, components` y `app.js::runDetection`.

### 7.1 Umbral
Se trabaja con la luminancia `L` (BT.601) de la imagen **realzada**, solo dentro de la zona de
análisis y fuera de las zonas excluidas.

- **Adaptativo (local)**, opción por defecto. Se calcula la media local `μ` en una ventana
  cuadrada de lado `2r + 1` (desenfoque de caja). Un píxel es candidato si:
  - trazas más oscuras: `L < μ − δ`
  - trazas más claras: `L > μ + δ`
  - ambas: `|L − μ| > δ`

  Es el umbral de «media menos constante» (*mean-C*), que compensa los cambios de iluminación y
  de color de fondo a lo largo del testigo.
- **Global**: candidato si `L < t` (oscuras) o `L > t` (claras). La opción «ambas» se trata como
  «oscuras» en este modo.
- **K-medias de 2 clases** (`kmeansThreshold`), como la opción K-Means de ICY usada por Miguez-Salas
  et al. (2019):
  - centros iniciales en los percentiles 10 y 90 de `L` dentro de la zona;
  - se iteran asignación y media hasta que los centros cambian < 0,001 (máximo 50 iteraciones);
  - el umbral es el punto medio entre los dos centros, y se aplica como el umbral global.
- **Rellenar huecos** (opcional, `fillHoles`): tras la morfología, los píxeles de fondo no
  alcanzables desde el borde de la zona (relleno 4-conexo) pasan a traza. Equivale al «Fill holes»
  binario de Fiji del mismo trabajo.

### 7.2 Limpieza morfológica
Se repite `s` veces (parámetro «suavizado») una **apertura** (erosión y luego dilatación) para
quitar puntos sueltos. Después se repite `s` veces un **cierre** (dilatación y luego erosión)
para unir huecos pequeños. El elemento estructurante es un cuadrado de 3 × 3 píxeles, aplicado
de forma separable (horizontal y luego vertical). En los bordes de la imagen se repite el píxel
del borde.

### 7.3 Objetos
Se buscan **componentes conexas con conectividad 8** (recorrido en anchura) y se eliminan las de
menos de `A_min` píxeles. Cada componente es un objeto candidato.

### 7.4 Volver a detectar
Al repetir la detección:
1. Se borran solo los candidatos automáticos **sin clase asignada**.
2. Los nuevos candidatos solo ocupan píxeles libres: nunca sobrescriben objetos identificados o
   dibujados por el usuario.
3. Si un candidato queda por debajo de `A_min` tras ese recorte, se elimina.

Valores por defecto (`DEFAULT_DETECT`): adaptativo, trazas oscuras, `δ = 12`, `r = 40 px`,
`t = 80`, `A_min = 40 px`, `s = 1`.

**Para el revisor.** La detección propone candidatos; el usuario los revisa. No se presenta como
segmentación automática validada. Su calidad depende del contraste entre relleno y matriz, y no
está medida en fotografías reales (§14). Los parámetros elegidos se guardan en el proyecto. El
umbral adaptativo y la morfología son métodos clásicos (Serra, 1982; Gonzalez y Woods, 2018),
elegidos por ser rápidos, deterministas y fáciles de explicar. La segmentación aprendida está en
§7.5 (desde V0.15).

### 7.5 Segmentación aprendida: U-Net (desde V0.15)

Cuarto método de detección (`method: 'unet'`). Una red U-Net entrenada fuera de la aplicación
(paquete Python, `ichantool unet train`) da para cada píxel la probabilidad de bioturbación `P`.
La aplicación la ejecuta con ONNX Runtime Web (WebAssembly, un hilo, sin GPU); el paquete Python,
con ONNX Runtime. Ambos usan las mismas reglas (`app/js/unet.js` y `src/ichantool/unet/tiling.py`),
comprobadas con el mismo archivo de referencia (`tests/fixtures/unet_parity.json`).

1. **Entrada:** imagen **original** (sin realce) de la zona de análisis. El realce no se usa porque
   cambia con los ajustes del usuario y la red debe ver lo mismo que vio al entrenar.
2. **Escala:** si el modelo indica su resolución de entrenamiento `ρ_m` (px/cm) y la sección tiene
   `ρ_s = (y₁ − y₀) / (fondo − techo)` (en cm), se reescala por `f = ρ_m / ρ_s` cuando `|f − 1| > 0,02`.
   Tamaño nuevo: `W' = round(W·f)`, `H' = round(H·f)`. Interpolación bilineal con centros de píxel
   alineados: `x_s = clamp((x + 0,5)·(W/W') − 0,5, 0, W − 1)` (igual en `y`); en imágenes de 8 bits
   el resultado se redondea al entero más cercano (empates al par). La probabilidad se devuelve a la
   resolución de la sección con la misma interpolación.
3. **Teselas:** lado `T` y solape `o` del modelo (por defecto 512 y 64 px). Inicios en cada eje:
   `0, T − o, 2(T − o), …` mientras `inicio + T < L`, y una última tesela en `L − T`; si `L ≤ T`, una
   sola tesela. Fuera de la imagen se repite el borde.
4. **Normalización:** `x_c = (v_c / 255 − μ_c) / σ_c` con `μ = (0,485; 0,456; 0,406)` y
   `σ = (0,229; 0,224; 0,225)` (ImageNet), o los valores del JSON del modelo.
5. **Salida:** logits `z`. Con un canal, `P = 1 / (1 + e^(−z))`. Con `C > 1` canales (canal 0 = matriz),
   softmax `p_k = e^(z_k) / Σ e^(z_j)`, `P = 1 − p_0` y clase = `argmax_{k ≥ 1} p_k`.
6. **Unión de teselas:** media ponderada con peso `w(i) = min(1, (i + 0,5)/o, (T − i − 0,5)/o)` en cada
   eje y `w(x, y) = w(x)·w(y)`, que evita bordes visibles entre teselas.
7. **Máscara:** píxel candidato si `P ≥ p_min` (deslizador «Probabilidad mínima», por defecto 0,5),
   dentro de la zona y fuera de la exclusión; después, la misma limpieza (§7.2) y los mismos objetos
   (§7.3) que los otros métodos. Cambiar `p_min` no vuelve a ejecutar la red: la probabilidad se guarda
   en memoria hasta que cambian el modelo, la zona, el tamaño o la escala. No se guarda en el proyecto.
8. **Zonas dudosas:** opción para marcar en magenta los píxeles con `|P − 0,5| < 0,2`.
9. **Modelo:** el usuario carga `modelo.onnx` y `modelo.json` (lado de tesela, solape, normalización,
   px/cm, clases, tipo de salida). Sin JSON se usan los valores por defecto. El modelo no se guarda en el
   proyecto; el método elegido y `p_min`, sí.

Con un modelo multiclase, la aplicación usa por ahora solo `P` (bioturbación sí/no); la clase de la red
no se asigna a los objetos (lo hace el clasificador de §10).

**Entrenamiento (paquete Python, `ichantool unet`).**

- `prepare`: lee el ZIP exportado (§12), reescala cada imagen a una resolución común (por defecto la
  mediana de px/cm; las máscaras, por vecino más próximo con la misma regla de centros), corta teselas
  con las reglas de arriba y descarta las que tienen menos del 50 % de píxeles válidos. Las teselas que
  se salen de la imagen marcan esa parte como «ignorar». **División por sondeo**: todas las teselas de
  un sondeo van al mismo conjunto (entrenamiento, validación o prueba). Los sondeos se pueden elegir;
  si no, se reparten al azar con semilla (20 % prueba y 20 % validación, al menos uno de cada si hay
  3 o más sondeos). Por defecto, binario (todas las clases → 1).
- `train`: U-Net (Ronneberger et al., 2015) con codificador ResNet-34 preentrenado en ImageNet
  (`segmentation-models-pytorch`). Pérdida = entropía cruzada (binaria: BCE con logits) + Dice suave
  `1 − (2Σpt + 1)/(Σp + Σt + 1)` (multiclase: media de las clases ≥ 1), ignorando los píxeles 255.
  Aumentos: volteo horizontal y vertical, contraste ×U(0,85; 1,15), brillo +U(−0,08; 0,08) y gamma
  U(0,8; 1,25). **Sin giros de 90°**: la orientación respecto a la estratificación es diagnóstica.
  AdamW (lr 3·10⁻⁴, decaimiento 10⁻⁴), coseno, 60 épocas como máximo y parada temprana tras 12 sin
  mejorar el Dice de validación. Exporta ONNX (opset 17, entrada `image` 1×3×T×T, salida `logits`) y el JSON.
- `evaluate`: predice cada imagen **completa** de los sondeos de prueba (como la aplicación) y la
  compara con la máscara experta, ignorando los píxeles 255. Bioturbación = cualquier clase > 0.
  IoU = TP/(TP+FP+FN); Dice = 2TP/(2TP+FP+FN); precisión = TP/(TP+FP); exhaustividad = TP/(TP+FN).
  Por intervalos de `b` cm (`b·ρ` filas, mismos límites que §3.2): `%` = 100·positivos/válidos;
  error absoluto medio y sesgo en puntos porcentuales, y proporción de intervalos con el mismo BI e ii.
  Global: TP, FP y FN sumados en todas las imágenes antes de calcular IoU y Dice.
- `predict` y `mask_from_unet`: máscara de una imagen con el contrato de `segmentation.py`.

**Entrenamiento dentro del programa de escritorio (desde V0.17).** Botón «Entrenar en este ordenador…»
del método U-Net (`desktop/trainer.js`, `preload.js`, `main.js`). Solo en escritorio: el navegador no
puede ejecutar PyTorch ni acceder a la tarjeta gráfica.

1. **Módulo de entrenamiento:** entorno virtual propio en `<datos de usuario>/trainer/venv`, creado con el
   Python ≥ 3.10 del sistema (`py -3`, `python` o `python3`); instala PyTorch (en Windows con tarjeta NVIDIA,
   detectada con `nvidia-smi -L`, desde `https://download.pytorch.org/whl/cu128`, porque PyPI solo tiene la
   versión para procesador; en Linux y macOS, desde PyPI) e `ichantool[unet]` desde la copia del paquete que
   viaja con el programa (`resources/python`). Se instala una vez, a petición del usuario (2–3 GB).
2. **Hardware:** `ichantool unet device` → `cuda` (NVIDIA), `mps` (Apple) o `cpu`, en ese orden de preferencia.
3. **Datos:** el mismo ZIP que «Datos para entrenar U-Net» (§12), generado en memoria. El usuario marca cada
   sondeo como «Auto», «Validación» o «Prueba» (`--val`, `--test` de `prepare`); «Auto» sigue la regla de
   `prepare` (§7.5).
4. **Ejecución:** `prepare` → `train --progress-json` (una línea JSON por época: época, pérdida, Dice de
   validación, mejor Dice y su época, dispositivo) → `evaluate` sobre los sondeos de prueba si los hay. Todo en
   `<datos de usuario>/trainer/runs/<nombre>`; el modelo en `trainer/models/<nombre>.onnx` y `.json`.
5. **Detener y reanudar:** tras cada época se guarda `<nombre>.ckpt` (red, optimizador, planificador, época,
   mejor Dice, historial y paciencia). «Reanudar» continúa desde ahí con las mismas teselas (`train --resume`).
   El resultado no es idéntico bit a bit al de un entrenamiento sin interrupción (el orden aleatorio de los
   aumentos no se guarda); se registra en el historial del modelo.
6. **Al terminar:** el modelo se carga en Detección. La lista de modelos muestra el Dice de validación y, si
   hubo sondeos de prueba, el Dice de prueba.

Seguridad: la página solo accede a seis funciones (`status`, `install`, `train`, `cancel`, `readModel`,
`openFolder`) a través de `window.corantoolDesktop.trainer`, y el proceso principal solo las atiende si la
llamada viene de las páginas del propio programa (`app://`).

Dependencias opcionales: `pip install 'ichantool[unet]'` (ONNX Runtime; PyTorch, segmentation-models-pytorch
y onnx solo para entrenar). El ejecutable de escritorio incluye ONNX Runtime Web
(`desktop/scripts/prepare.js`); el navegador y el archivo único lo descargan de jsDelivr la primera vez.

---

## 8. Herramientas de edición y capa de exclusión (aplicación web)

Implementación: `imageproc.js::regionGrow, polygonPixels` y `app.js` (herramientas).

| Herramienta | Algoritmo |
|-------------|-----------|
| **Varita** | Relleno por inundación con 4 vecinos desde el píxel pulsado. Incluye los píxeles cuya distancia euclídea en RGB al color del píxel semilla es ≤ tolerancia. Usa la imagen que se está viendo (realzada u original), limitada a la zona de análisis y fuera de exclusiones. Tope: 4 millones de píxeles. |
| **Lazo** | El usuario dibuja un polígono. Se rellenan los píxeles cuyo centro queda dentro (regla par-impar, barrido por filas). |
| **Pincel** | Disco de radio `r` px. El trazo se interpola cada `r/3` px. Si empieza sobre un objeto, lo amplía; si empieza fuera, crea un objeto nuevo con la clase activa. Con Mayús añade al objeto seleccionado. |
| **Borrador** | Disco de radio `r` px que quita los píxeles de cualquier objeto. |
| **Excluir / Recuperar** | Pincel que marca o desmarca una capa aparte de **exclusión**. |

| **Tijeras** (desde V0.20) | El usuario dibuja una línea (3 px de ancho) a través de una traza: la seleccionada si la línea la cruza, si no la primera traza que encuentra la línea. Sin los píxeles de la línea, la traza se divide en piezas conexas (4 vecinos); los píxeles de la línea pasan a la pieza vecina. La pieza mayor conserva el número y las demás son objetos nuevos con la misma clase, sugerencia y origen. Si la línea no separa la traza, no cambia nada. |
| **Unir** (desde V0.20) | Con varias trazas seleccionadas, las une en una: se conserva la mayor con clase asignada a mano (si no hay, la mayor). Respeta los solapes. |

Modificadores: Mayús añade al objeto seleccionado y Alt resta (varita y lazo). Con el borrador, Mayús borra solo la
traza seleccionada (V0.20).

**Superponer** (desde V0.20, pincel, varita y lazo; activado por defecto desde V0.29, se recuerda en el navegador, tecla S). Activado, la traza nueva se añade encima
de las que ya hay en esos píxeles y todas cuentan (§3, trazas solapadas); con el pincel, empezar sobre una traza crea
una nueva en vez de ampliarla (Mayús amplía la seleccionada). Desactivado, la traza nueva sustituye a las de debajo, como
antes. Restar (Alt) quita solo la traza seleccionada. Hacer clic de nuevo sobre un solape selecciona la traza de debajo.

**Selección de varias trazas** (desde V12; arrastre desde V13). Con la herramienta de selección,
arrastrar dibuja un recuadro y selecciona las trazas cuyo centro del rectángulo envolvente cae dentro
(sustituye la selección; con Mayús o Ctrl, la amplía). Mayús o Ctrl + clic añade o quita una traza.
La vista se desplaza con la herramienta mano, la barra espaciadora o el botón central.

**Exclusión con rectángulo** (desde V13). Excluir y Recuperar admiten la forma «Rectángulo» (o Mayús +
arrastrar): marcan o desmarcan todos los píxeles del rectángulo en la capa de exclusión. También se pueden seleccionar todas las sugeridas como la clase activa o
todas las sin revisar. Las teclas 1–9 (y 0), «Asignar a todas», «Aceptar sus sugerencias» y
«Eliminar todas» actúan sobre toda la selección en una sola operación de deshacer. Sirve igual para
trazas detectadas automáticamente y para trazas dibujadas a mano. La vista no se mueve al asignar;
«Saltar a la siguiente al asignar» está desactivado por defecto (se recuerda por navegador) y, si se
activa, centra la traza siguiente sin cambiar el zoom.

**Capa de exclusión.** Los píxeles excluidos salen del numerador **y** del denominador del
porcentaje (§3). Sirve para grietas, huecos, zonas muestreadas, etiquetas o perturbación de
perforación. Así no se confunde «sin bioturbación» con «sin dato».

**Deshacer.** Cada operación guarda la lista de píxeles cambiados con su valor anterior, y una
copia de la lista de objetos. Se guardan las 30 últimas operaciones.

Tras cada edición se recalculan los descriptores (§9) solo de los objetos afectados, dentro del
rectángulo que los contiene.

---

## 9. Descriptores de cada objeto

Implementación: `imageproc.js::objectStats, features`. Se calculan sobre la **imagen original**
(sin realce) para que el aprendizaje no dependa de los ajustes de visualización.

Sea `n` el número de píxeles del objeto, `(x, y)` sus coordenadas, `ppcm` la resolución (§2.3) y
`(R, G, B)` el color original.

Momentos de segundo orden: `cxx = var(x) + 1/12`, `cyy = var(y) + 1/12`, `cxy = cov(x, y)`. El
término 1/12 es la varianza de un píxel cuadrado de lado 1 y evita valores nulos en objetos de
una sola fila o columna. Valores propios: `λ₁ ≥ λ₂`. Ángulo del eje mayor respecto a la
horizontal: `θ = ½ · atan2(2 cxy, cxx − cyy)`.

| Descriptor | Fórmula | Qué mide |
|------------|---------|----------|
| `logArea` | log₁₀(n / ppcm²), área en cm² | Tamaño |
| `logMajor` | log₁₀(4 √λ₁ / ppcm) | Longitud: eje mayor de la elipse con los mismos momentos, en cm |
| `logMinor` | log₁₀(4 √λ₂ / ppcm) | Anchura, en cm |
| `elong` | √(λ₁ / λ₂) | Alargamiento (1 = redondo) |
| `vert` | \|sen θ\| | Verticalidad (1 = eje mayor vertical, 0 = horizontal) |
| `compact` | min(1, 4π n / P²), P = píxeles de borde | Compacidad (1 = disco) |
| `fill` | n / área del rectángulo envolvente | Relleno del rectángulo |
| `meanL` | media de L (BT.601) | Brillo del relleno |
| `stdL` | desviación típica de L | Textura del relleno |
| `meanA` | media de (R − G) | Eje de color rojo–verde |
| `meanB` | media de ((R + G)/2 − B) | Eje de color amarillo–azul |
| `contrast` | meanL − media de L en un anillo exterior | Contraste con la matriz |

El anillo exterior se muestrea a 3 píxeles de cada píxel del borde, en las cuatro direcciones,
cuando ese punto no pertenece al objeto.

Las medidas de tamaño se expresan en **centímetros**, no en píxeles. Así, ejemplos de imágenes con
distinta resolución son comparables.

**Para el revisor.** Son descriptores clásicos de forma (momentos de imagen; Hu, 1962) y de
color. `meanA` y `meanB` son una aproximación rápida a los ejes oponentes del espacio CIELAB, no
una conversión colorimétrica. `compact` usa como perímetro el número de píxeles de borde, que
infravalora el perímetro real en contornos diagonales. Es una aproximación consistente entre
objetos, que es lo que importa para comparar. Los descriptores de color dependen de la cámara y
de la iluminación (§14).

---

## 10. Aprendizaje: identificación de icnotaxones (aplicación web)

Implementación: `learn.js::Classifier` y `app.js::learnNow`.

### 10.1 Ejemplos
Cada objeto con clase asignada por el usuario es un ejemplo `(x, y)`: `x` es el vector de los
12 descriptores de §9 e `y` el icnotaxón. Se usan los ejemplos de **todas las secciones del
proyecto** y los **importados** de modelos anteriores (archivo de modelo, §12).

### 10.2 Clasificador: k vecinos más cercanos ponderados (k-NN)
1. **Normalización:** cada descriptor se transforma en `z = (x − media) / desviación`, con la media
   y la desviación de los ejemplos. Si la desviación es 0, se usa 1.
2. **Distancia:** euclídea en el espacio normalizado.
3. **Votación:** los `k = 5` vecinos más cercanos votan con peso `w = 1 / (d + 0,05)`.
4. **Confianza:** peso de la clase ganadora / suma de pesos (de 0 a 1).

### 10.3 Rechazo de formas desconocidas (novedad)
Se calcula `m`, la mediana de la distancia de cada ejemplo a su vecino más cercano (dejándolo
fuera). Si la distancia de un objeto a su ejemplo más cercano es mayor que `ν · m`, el objeto
**no se etiqueta** y se marca como «no se parece a nada conocido». `ν` es la «tolerancia a formas
nuevas» (3 por defecto, ajustable entre 1 y 8).

### 10.4 Umbral de confianza
Una sugerencia se considera **identificación automática** solo si su confianza es ≥ 0,70
(«confianza mínima», ajustable entre 0,30 y 0,99). Por debajo, el objeto sigue siendo un
candidato sin revisar.

### 10.5 Acierto estimado
Con al menos dos clases se calcula el acierto por **validación cruzada dejando uno fuera**: cada
ejemplo se clasifica con los demás y se cuenta el porcentaje de aciertos.

### 10.6 Actualización
El modelo se recalcula automáticamente 60 ms después de cada cambio. k-NN no necesita
entrenamiento: el coste es proporcional a (ejemplos × objetos). El botón «Aceptar sugerencias» convierte las
identificaciones automáticas en etiquetas, que pasan a ser ejemplos.

### 10.6 bis Tres modelos: sondeo, proyecto y todos los proyectos (desde V17)
- **Sondeo:** ejemplos (objetos etiquetados) del sondeo abierto + biblioteca importada del proyecto.
- **Proyecto:** ejemplos de todos los sondeos del proyecto + biblioteca.
- **Todos los proyectos:** los del proyecto + biblioteca + los ejemplos de los demás proyectos (copia
  ligera `examples: [{name, x}]` que cada proyecto guarda en el índice `lite` al guardarse; se excluyen
  los proyectos multiproyecto para no duplicar).
- Las clases se identifican **por nombre** (los identificadores cambian entre proyectos).
- Los tres se ajustan a la vez con el mismo método (§10.2–10.5) en cada cambio. El acierto dejando uno
  fuera usa como máximo `LOO_MAX = 1500` ejemplos equiespaciados (el resto del cálculo usa todos).
- **Probabilidad de cada icnotaxón:** `p(clase) = Σ w de los vecinos de esa clase / Σ w de los k
  vecinos` (la «confianza» de §10.2 es la `p` de la clase ganadora). El panel del objeto muestra, para
  las 4 clases con mayor suma de `p`, la probabilidad según cada modelo, y avisa si algún modelo lo
  considera una forma nueva (§10.3).
- «Modelo que sugiere» (`settings.clfScope`, por defecto `project`) decide qué modelo pone la
  sugerencia, la confianza y las identificaciones automáticas.
- **Pesos guardados** (`Classifier.toJSON`): `k`, `ν`, media y desviación de cada descriptor, escala
  de novedad `m`, acierto, recuentos y los ejemplos (descriptores redondeados a 5 decimales). El archivo
  de proyecto guarda `models.project` y `models.cores[id]`; el modelo de todos los proyectos se guarda en
  las preferencias del navegador (`model.all`). `Classifier.fromJSON` lo reconstruye sin reajustar.

### 10.6 ter Métodos, parámetros, evaluación y ejemplos (desde V18)
Diálogo «Modelos y entrenamiento» (pestaña Aprendizaje): guía para no especialistas, método y
parámetros, evaluación, galería de ejemplos usados y ejemplos de otros proyectos.
- **Métodos** (`learn.js::TaxonModel`, ajustes en `settings.ml`, valores por defecto entre paréndatos privados):
  - k-NN (§10.2): `k` (5), peso del voto `distance` = `1/(d + 0,05)` o `uniform` = 1.
  - Random Forest (`geo.js::fitModel('rf')`, §21.4) sobre los descriptores estandarizados `z`:
    árboles (100), profundidad máxima (12), ejemplos mínimos por hoja (2), compensación de clases (sí);
    resto de parámetros como en §21.4; semilla 42.
  - Bayes ingenuo gaussiano (`fitModel('nb')`) sobre `z`: probabilidad de partida uniforme (por
    defecto) o empírica.
  - En los tres se ajusta también el k-NN, que da la estandarización (media y desviación de los
    ejemplos), la prueba de novedad (§10.3) y, para k-NN, el acierto dejando uno fuera. Con RF o NB la
    probabilidad de cada clase es la del método; la clase sugerida es la de mayor probabilidad salvo
    que el k-NN la marque como forma nueva. El «acierto estimado» de RF y NB es el acierto equilibrado
    de la última evaluación (no hay dejar-uno-fuera).
- **Evaluación** (`evaluateModels`): conjunto de prueba = trazas etiquetadas del sondeo abierto si hay
  ≥ 10 de ≥ 2 taxones; si no, las del proyecto. Desde V22 se reparten en 5 grupos **por imagen (sección)**
  (`groupedFolds`: todas las trazas de una sección van al mismo grupo; secciones barajadas con semilla 42 y
  asignadas al grupo con menos trazas de su taxón principal); con menos de 5 secciones, grupos estratificados
  por taxón (`stratifiedFolds`). Para cada grupo y cada modelo (sondeo, proyecto, todos)
  se entrena con su conjunto de ejemplos **sin las trazas de ese grupo** y se predicen (sin prueba de
  novedad). Así los 9 casos (3 métodos × 3 modelos) se juzgan con las mismas trazas. Se dan acierto
  total, acierto equilibrado (media de la sensibilidad de cada taxón) y matriz de confusión. Desde V22 las
  predicciones de un taxón que no está entre los de prueba cuentan como error (columna «otro»), los
  denominadores son todas las trazas de prueba de cada taxón y n = nº de trazas de prueba (antes esas
  predicciones se descartaban y el acierto salía inflado).
- **Dejar uno fuera de k-NN** (§10.5): desde V22, si los ejemplos vienen de ≥ 2 secciones, el acierto deja
  fuera toda la sección del ejemplo; la escala de novedad sigue usando el vecino más cercano de cualquier sección.
- **Recomendación:** la combinación con mayor acierto equilibrado; si otras quedan a ≤ 3 puntos, se
  elige la más sencilla (k-NN, después Bayes, después RF; y sondeo, después proyecto, después todos).
- **Ejemplos usados:** miniaturas (recorte del rectángulo envolvente con contorno, 64 px, JPEG 0,7)
  agrupadas por taxón. Desmarcar «usar» en una traza del proyecto pone `o.nt = true` (se guarda como
  `nt: 1`): sigue etiquetada y cuenta en la bioturbación, pero no es ejemplo de ningún modelo. En las
  de otros proyectos se guarda una lista de exclusión en el navegador (`ml.excluded`). Los ejemplos de
  la biblioteca se pueden quitar.
- **Ejemplos de otros proyectos:** el índice `lite` guarda de cada traza etiquetada `{key, name, x,
  core, thumb}` (`key = proyecto|sondeo|sección|objeto`). Se pueden añadir a la biblioteca del
  proyecto (`library: {key, name, x, thumb, from}`); si el taxón no existe, se crea con ese nombre.

### 10.6 quater Rasgos de un modelo de visión preentrenado (desde V0.17)

Alternativa a los 12 descriptores (§9) como entrada del clasificador (`S.settings.ml.features`:
`'shape'` o `'vision'`; diálogo «Modelos y entrenamiento», pestaña Entrenamiento).

1. **Modelo:** DINOv2 ViT-S/14 (Oquab et al., 2024), red de visión entrenada sin etiquetas con 142 millones
   de imágenes, en formato ONNX (`onnx-community/dinov2-small`, 88 MB). No se entrena en CorAnTool: solo
   convierte cada imagen en un vector. Se descarga una vez y se guarda en la caché del navegador o del programa
   (`caches`, clave = URL); también se puede cargar un `.onnx` propio con la misma interfaz.
2. **Ventana:** cuadrado centrado en el rectángulo de la traza `[x₀, y₀, x₁, y₁]`, de lado
   `L = max(16, round(max(ancho, alto)·(1 + 2·0,25)))`; centro `((x₀ + x₁ + 1)/2, (y₀ + y₁ + 1)/2)`. Incluye
   un 25 % de sedimento alrededor por cada lado (contexto). Fuera de la imagen se repite el borde.
3. **Entrada:** imagen **original** (sin realce), remuestreo bilineal a 224 × 224 px
   (`x_s = x_v + (x + 0,5)·L/224 − 0,5`), `(v/255 − μ_c)/σ_c` con la media y desviación de ImageNet (§7.5).
4. **Vector:** salida `pooler_output` (token de clase normalizado) o, si no existe, el primer token de la
   primera salida; 384 valores, normalizado a longitud 1 (`v/‖v‖`) y redondeado a 4 decimales. Se guarda en el
   objeto (`emb`; en el proyecto, `em`) y se borra si cambian el área o el rectángulo de la traza.
5. **Clasificador:** el mismo de §10.2–10.6 ter (k-NN, Random Forest o Bayes; estandarización por dimensión,
   rechazo de novedad, tres ámbitos, evaluación). La longitud del vector se toma de los ejemplos. El conjunto
   de rasgos se guarda con el modelo (`features`: `FEATURES` o `["vision:dinov2-small:384"]`) y **nunca se
   mezclan** vectores de conjuntos distintos: la biblioteca y los ejemplos de otros proyectos guardan ambos
   (`x` y `xv`) y se usa el del modo activo.
6. **Cálculo:** botón «Calcular rasgos» para todas las trazas pendientes; en modo visión, las trazas nuevas
   o editadas de la imagen abierta se calculan solas 0,7 s después del cambio.

**Para el revisor.** El modelo de visión se entrenó con fotos generales, no con testigos: sus vectores
describen forma y textura de forma genérica. Su ventaja frente a los 12 descriptores es una hipótesis que se
mide con la evaluación de §10.6 ter y, para publicar, en testigos independientes (artículo 2). Los vectores
no son interpretables uno a uno; la explicación de una sugerencia sigue siendo «se parece a estos ejemplos».

### 10.7 Por qué k-NN
- **Pocos ejemplos:** funciona desde el segundo ejemplo. Un usuario etiqueta unas decenas de
  objetos, no miles.
- **Incremental:** cada corrección se aplica al instante, sin reentrenar.
- **Transparente:** la sugerencia se explica por los ejemplos parecidos.
- **Rechazo explícito:** es fácil decir «no lo sé» por distancia.
- **Sin parámetros entrenados:** reproducible y determinista.

Alternativas descartadas por ahora: bosques aleatorios y redes neuronales. Necesitan más ejemplos
o un entrenamiento previo, y quedan para el artículo 2.

**Para el revisor.**
- El acierto dejando uno fuera es **optimista** si los ejemplos vienen del mismo testigo o de
  objetos vecinos, que se parecen entre sí (autocorrelación espacial). La validación seria
  necesita testigos de prueba no usados para etiquetar (artículo 2–3).
- Las clases desequilibradas (muchos *Chondrites*, pocos *Zoophycos*) sesgan el voto hacia la
  clase frecuente. El peso por distancia lo reduce, pero no lo elimina.
- «Aceptar sugerencias» es autoentrenamiento: si se aceptan errores, se refuerzan. Por eso existe
  el umbral de confianza y la revisión objeto a objeto.
- Un objeto detectado puede contener varias trazas unidas, o una traza cortada en varios objetos.
  La clasificación hereda los errores de la detección.

---

## 11. Qué se cuenta como bioturbación (aplicación web)

Implementación: `app.js::effClassId, effClassArray`. Para cada objeto se decide su **clase
efectiva** en este orden:

1. La clase asignada por el usuario, si existe.
2. Si no hay, la sugerencia automática, si «Contar identificaciones automáticas» está activado y
   la confianza ≥ umbral.
3. Si no hay, «Bioturbación indeterminada», si «Contar candidatos sin revisar» está activado.
4. Si no, el objeto no cuenta.

La clase **Artefacto** nunca cuenta (`counts: false`). Sirve para marcar falsos positivos
(conchas, clastos, grietas detectadas), que además enseñan al modelo qué no es bioturbación. Las
zonas excluidas tampoco cuentan.

Los ajustes activos se guardan en el proyecto, así que cualquier resultado se puede reproducir.

---

## 12. Exportación y formatos de archivo

| Archivo | Contenido |
|---------|-----------|
| `*_bioturbation.csv` | Una fila por intervalo y sección: `section, depth_top, depth_bottom, depth, units, age, age_units, valid_pixels, bioturbation_pct, <clase>_pct…, BI, ii, BI_manual, ii_manual` |
| `*_objects.csv` | Una fila por objeto: sección, id, clase, estado, sugerencia, confianza, profundidades, área (cm²), longitud y anchura (cm), alargamiento, verticalidad, compacidad, luminancia, contraste, si cuenta |
| `*_mask.png` | Máscara a tamaño completo: fondo negro y cada píxel contado con el color de su clase. Compatible con `ichantool analyze --palette` del paquete Python |
| `*_palette.json` | `{nombre de clase: "#rrggbb"}` |
| `*_segmentation_dataset.zip` (desde V0.15) | Datos para entrenar la U-Net (§7.5), de todas las imágenes del proyecto con al menos una traza revisada: `images/<sondeo>__<sección>.png` (zona de análisis original, resolución de trabajo), `masks/…png` (gris de 8 bits: 0 = matriz o clase que no cuenta, k = clase k que cuenta, 255 = ignorar: zona excluida o traza sin clase confirmada; las sugerencias del clasificador no cuentan como revisadas) y `manifest.json` (`kind: "segmentation-dataset"`, clases con índice, y por imagen sondeo, sección, techo, fondo, unidades, px/cm, tamaño, factor de reducción y número de objetos revisados y sin revisar) |
| Modelo de icnotaxones exportado (`ichantool_model.json`, desde V0.17) | Además de los 12 descriptores, puede ser de vectores del modelo de visión: `features: ["vision:dinov2-small:384"]` y ejemplos de 384 valores. Al importarlo, sus ejemplos van a la biblioteca como `xv` |
| `modelo.onnx` + `modelo.json` (desde V0.15) | U-Net entrenada con `ichantool unet train`: red ONNX y su descripción (`tile`, `overlap`, `mean`, `std`, `pxPerCm`, `classes`, `output`, historial de entrenamiento y sondeos de cada conjunto) |
| `ichantool_model.json` | Modelo de aprendizaje: lista de descriptores, clases y ejemplos `{name, x}` |
| `*_registro.svg` / `*_registro.csv` | Registro compuesto de la ventana elegida (§18) |
| `*_mapa_<a0>-<a1>.svg` / `.csv` | Mapa de una ventana de edad (§21.6) |
| `*_clasificacion_intervalos.csv` | Muestras con etiqueta y clase predicha (§21.7) |
| `*_intervalos.csv` | Intervalos de todas las capas (§21.7) |
| Preferencia `ichantool.theme` (localStorage) | Tema claro u oscuro elegido |
| `*.ichantool.json` | Proyecto completo (formato v2; también abre v1): clases, ajustes, modelo de edad, ejemplos importados y, por sección, la imagen original (base64), el giro, profundidades, zona, realce, detección, índices manuales, objetos y capas de etiquetas y exclusión comprimidas por RLE. La v2 añade `ds` (factor de reducción), `records` (registros externos), `logView` (vista del registro) y `notes`. Desde V9, `geo`: sondeos (nombre, lat, lon, profundidad, edad, variables), razones, capas de intervalos con su jerarquía y categorías (desde V10; en V9, lista de etiquetas), intervalos, reglas, ajustes de preparación y del método, mapa y nombres de grupos; el modelo entrenado no se guarda (se reentrena con su semilla) |

Desde V0.20 cada sección del proyecto puede llevar `stacks` (lista de pilas de objetos solapados, §3); `labels` admite
entonces valores negativos. Los proyectos sin `stacks` se abren igual.

**RLE (codificación por longitud de series):** `[valor, repeticiones, valor, repeticiones, …]`.
Reduce mucho el tamaño de las máscaras, que tienen grandes zonas iguales.

---

## 13. Validación realizada

### 13.1 Pruebas automáticas
- **Python (9 pruebas, `tests/test_core.py`):** tramos de índices, porcentajes e intervalos en
  casos calculados a mano, último intervalo incompleto, multiclase por colores, gris y RGB,
  profundidad y edad, imagen de ejemplo, línea de comandos y **regresión frente al CSV publicado
  de la V2** (coincidencia exacta en profundidad, porcentaje, BI e ii).
- **Web (13 pruebas, `tests/app/*.test.mjs`):** en `log.test.mjs`, lectura de tablas (coma, punto y coma con coma decimal, espacios, comentarios), elección de la columna de profundidad o edad, marcas de eje, cambio profundidad↔edad, filas compuestas, SVG y CSV con interpolación, y reducción por bloques. En `core.test.mjs`: los mismos casos de índices e intervalos que en
  Python, exclusiones, modelo de edad, RLE y CSV, detección de una madriguera vertical sintética
  (verticalidad > 0,9 y alargamiento > 3), varita, lazo, giro, realce, y un clasificador que
  aprende dos clases (acierto 100 %) y rechaza un objeto lejano.
- **Multiproxy (`geo.test.mjs`, 8 pruebas):** tabla larga y catálogo, conversión
  profundidad↔edad, remuestreo con huecos, razones, escalado por sondeo, reglas con z-score
  (precisión > 0,8 frente a la verdad sintética), prioridad intervalo > regla y conversión de
  intervalos entre ejes, Random Forest, k-NN y Bayes entrenados con 3 sondeos y probados en los
  otros 12 (acierto > 0,8), validación dejando un sondeo fuera, reproducibilidad con semilla,
  k-medias, resumen por ventana, IDW y SVG del mapa; desde V10, importación de intervalos en formato
ancho y largo, columnas 0/1 de capas (con conversión de eje), capa objetivo y comprobación de
intervalos fuera de la capa madre. Total de la web: 28 pruebas.
- Se ejecutan automáticamente en GitHub en cada cambio (`.github/workflows/tests.yml`).

### 13.2 Comparación de la aplicación web con la V2 publicada
- Imagen idealizada del artículo de 2020 (620 × 16 726 px, 0–500 cm), intervalos de 150 px,
  110 intervalos comparados.

| Medida | Resultado |
|--------|-----------|
| Profundidad | idéntica (diferencia < 10⁻¹³ cm) |
| BI | 100 % de intervalos iguales |
| ii | 100 % de intervalos iguales |
| Porcentaje | diferencia máxima 0,56 puntos, media 0,13 puntos |

La diferencia del porcentaje se explica en §3.4.

### 13.3 Lo que todavía no está validado
- Calidad de la detección automática en fotografías reales de testigos.
- U-Net (V0.15): el código está probado (paridad Python/JS, datos sintéticos, ONNX Runtime en Python y
  en la versión web), pero **no hay ningún modelo entrenado con testigos reales**; no hay resultados.
- Acierto del clasificador con icnotaxones reales y testigos independientes.
- Concordancia entre usuarios (dos personas analizando el mismo testigo).
- Concordancia entre índices automáticos y estimación visual de expertos.

Estos puntos son el objetivo de los artículos 2 y 3 (ver `publications/METODOS_Y_DEFENSA.md`).

---

## 14. Limitaciones conocidas

1. **2D:** se mide la superficie expuesta, no el volumen.
2. **Depende de la máscara:** el cálculo es exacto, pero la máscara la decide el usuario o la
   detección automática.
3. **Detección por umbral:** falla si relleno y matriz tienen brillo parecido, con iluminación muy
   desigual (en parte corregido por el umbral adaptativo) o con trazas de borde difuso.
4. **Color dependiente de la cámara:** los descriptores de color cambian con la iluminación y el
   equipo. Un modelo importado de otro laboratorio puede funcionar peor.
5. **Escala lineal por sección:** no corrige expansión o compresión del testigo dentro de una
   sección.
6. **Memoria:** la aplicación carga la imagen completa (unos 13 bytes por píxel entre capas). Más
   de unos 50 millones de píxeles puede ser lento.
7. **El paquete Python todavía no tiene capa de exclusión**; la aplicación web sí.
8. **Proyectos locales:** viven en el navegador de cada ordenador (§17). Borrar los datos del
   navegador los elimina; hay que exportar copias.
9. **Registro en edad:** la imagen y las series dependen del modelo de edad, que se supone
   monótono. No se propaga su incertidumbre.
10. **Multiproxy (§21):** los métodos no tienen en cuenta la autocorrelación de las series ni la
    incertidumbre de los modelos de edad de cada sondeo; la interpolación IDW de los mapas es
    exploratoria; el k-NN compara cada muestra con todas las de entrenamiento (lento con cientos de
    miles de muestras); todo el cálculo se hace en el navegador.

---

## 15. Reproducibilidad

- Todos los cálculos son **deterministas**: no hay números aleatorios en el análisis ni en el
  aprendizaje. Los únicos valores aleatorios son identificadores internos de sección y de clase.
- El archivo de proyecto guarda la imagen original y todos los parámetros. Al abrirlo se obtiene
  el mismo resultado.
- Ejecutar las pruebas:

```bash
pip install -e ".[dev]" && pytest      # Python
npm test                               # Aplicación web (Node 22)
```

- Archivo único sin servidor: `python tools/build_standalone.py` genera `dist/IchAnTool.html`
  con el mismo código de `app/js/` concatenado (sin cambios en el cálculo) y el ejemplo incrustado.
- Versiones: paquete 3.0.0.dev0, aplicación 3.0.0-dev (constante `VERSION` en `app.js`; se guarda
  en cada proyecto).

---

## 16. Resolución de trabajo al importar (aplicación web)

Implementación: `imageproc.js::downsampleRGBA` y `app.js::decodeBytes`.

Las imágenes de escáner de testigos pueden tener más de 40 millones de píxeles por sección, que no
caben bien en la memoria del navegador (unos 13 bytes por píxel, §14). Al importar, si
`ancho × alto > M` megapíxeles (M = «Resolución de trabajo», 8 MP por defecto), la imagen se reduce
por un factor entero:

    k = ⌈ √(ancho · alto / (M · 10⁶)) ⌉

Cada píxel nuevo es la **media aritmética** de un bloque `k × k` de píxeles originales (en R, G y
B). Se descartan las últimas `ancho mod k` columnas y `alto mod k` filas, es decir, menos de `k`
píxeles originales en el borde inferior y derecho. La lectura se hace por franjas de altura
múltiplo de `k`, sin cargar la imagen completa en memoria.

- El **archivo original** se guarda intacto (resolución completa) en el proyecto, junto con `k` (`ds`).
  Al reabrir el proyecto se aplica el mismo `k`, así que las máscaras coinciden píxel a píxel.
- **Recorte (V0.1):** se guarda como rectángulo `crop = [x0, x1) × [y0, y1)` en píxeles del archivo
  original sin girar; el archivo no se vuelve a codificar. La imagen de trabajo es
  `girar(promediar(recortar(original), k), rot)`. El recorte se hace en múltiplos de `k`, así que
  coincide exactamente con las máscaras recortadas.
- **Cambiar la resolución de una sección (V0.1)** (`app.js::changeResolution`): se recalcula la imagen
  con el nuevo factor `k₂` desde el original. Las máscaras (trazas y exclusiones) se pasan al nuevo
  tamaño por **vecino más próximo** en el marco sin girar: el píxel nuevo `(x, y)` toma el valor del
  píxel antiguo `(⌊(x+½)·k₂/k₁⌋, ⌊(y+½)·k₂/k₁⌋)`. La zona de análisis y las marcas se transforman
  con la misma escala (bordes redondeados al píxel). Las estadísticas de objetos se recalculan; al
  reducir pueden desaparecer trazas de menos de un píxel nuevo. Al aumentar, los bordes de las trazas
  ya dibujadas quedan escalonados (resolución de la máscara original). «Igualar todas las secciones»
  elige en cada sección `k = max(1, round(ppcm_original / ppcm_objetivo))`.
- La escala de profundidad (§2.3) se calcula sobre la imagen de trabajo, así que el porcentaje no
  depende de `k`. Lo que cambia es el tamaño mínimo de traza que se puede distinguir.

**Para el revisor.** La reducción por promedio de bloques es un filtro paso bajo seguido de
submuestreo. Evita el aliasing del submuestreo directo y es reproducible porque `k` queda
registrado. Se recomienda indicar en los métodos la resolución de trabajo (px/cm), que la
aplicación muestra junto a la zona de análisis.

---

## 17. Proyectos (carpetas) y guardado automático (aplicación web)

Implementación: `storage.js` y `app.js` (bloque *projects*).

- Cada proyecto es una «carpeta» con:
  - nombre;
  - secciones, cada una con su archivo de imagen original, factor `k`, giro, techo, muro, unidades,
    zona de análisis, realce, detección, objetos, máscaras e índices manuales;
  - modelo de edad;
  - clases;
  - ajustes;
  - ejemplos importados;
  - registros externos;
  - vista del registro.
- Se guarda en **IndexedDB** (en el programa de escritorio, en la carpeta de datos del usuario, en
  disco). Almacenes: `meta` (lista ligera), `data` (el proyecto sin imágenes), `lite`, `prefs` e
  `images` (V0.1).
- **Imágenes en disco (V0.1, formato de proyecto v4):** cada archivo original se escribe **una sola
  vez** en `images` y la sección guarda solo la referencia (`file.key`). El guardado automático ya no
  reescribe las imágenes. Los proyectos anteriores se migran solos al abrirlos y guardarse.
- **Memoria (V0.1):** al abrir un proyecto no se decodifica ninguna imagen. Los píxeles (original y
  realzada, 8 bytes/px) se leen del disco al trabajar con una sección y se liberan las menos recientes
  por encima de ~0,9 GB (siempre se conserva la sección activa). Las máscaras (5 bytes/px) se
  guardan comprimidas (RLE, §12) en las secciones que no se usan y se descomprimen al acceder a ellas
  (límite ~0,5 GB). Las estadísticas de objetos (`st`) y las miniaturas de ejemplos se guardan en el
  proyecto, así que la clasificación, los índices y la columna no necesitan las imágenes. La columna
  guarda una copia reducida (≤ 512 px) de cada sección; cambiar colores o umbrales solo usa las
  máscaras. Las figuras que necesitan píxeles leen las secciones de dos en dos.
- Al borrar un proyecto se borran sus imágenes; las de secciones eliminadas se limpian al arrancar
  (si tienen más de una hora).
- **Guardado automático** 1,5 s después de cualquier cambio. El estado se muestra junto al nombre
  del proyecto. Al abrir la aplicación se abre el último proyecto usado.
- **Desde V0.8** exportar crea un paquete `.corantool` (ZIP sin compresión: `project.json` con `file.path = images/<id de sección><ext>` y las imágenes originales). La copia automática escribe una carpeta por proyecto (`project.json`, `images/`, `historial/`). Los archivos JSON antiguos (imágenes en base64) se siguen importando.
- Exportar e importar usaba antes el mismo contenido en JSON, con las imágenes originales en base64 (§12).
  Al importar se asigna un identificador nuevo para no sobrescribir otro proyecto y las imágenes
  pasan al almacén `images`.
- Si el navegador no permite almacenamiento (ventana privada o datos bloqueados), la aplicación lo
  indica y hay que exportar el proyecto a mano.

---

## 18. Registro compuesto del sondeo (aplicación web)

Implementación: `log.js::compositeRows, buildLogSVG, windowCSV` y `app.js::renderLog, stripDataURL`.

### 18.1 Unión de secciones
- Las secciones se ordenan por profundidad de techo.
- Todas las profundidades se pasan a las unidades de la primera sección (mm, cm o m).
- Los intervalos de cada sección (§3) se unen en una sola serie. **No se recalculan:** cada
  intervalo conserva su porcentaje, BI, ii, porcentajes por clase e índices manuales.

### 18.2 Eje de profundidad o de edad
- **Profundidad:** cada intervalo ocupa `[techo, muro)`.
- **Edad:** techo y muro se convierten con el modelo de edad (§5). Si alguno cae fuera del modelo,
  el intervalo no se dibuja.
- Para pasar de edad a profundidad se usa el modelo invertido (pares edad→profundidad ordenados por
  edad), lo que **supone que la edad crece con la profundidad**.

### 18.3 Ventana de intervalo
El usuario elige desde–hasta en el eje activo. Se dibujan los intervalos que se solapan con la
ventana, y todo se recorta al rectángulo de la ventana.

### 18.4 Imagen adaptada al eje
La columna de imagen se genera fila a fila, con `2 × altura del gráfico` filas (máximo 4 000):
1. A cada fila de salida `r` le corresponde un valor del eje `v = desde + (r + 0,5)/N · (hasta − desde)`.
2. Si el eje es edad, `v` se pasa a profundidad con el modelo invertido.
3. Se busca la sección que contiene esa profundidad y su fila de imagen (§2.3).
4. Se copia esa fila, dentro de la zona de análisis y escalada al ancho de la columna.

Así la imagen se estira o comprime según el modelo de edad: los tramos de sedimentación lenta
ocupan más altura en edad. Se usa la imagen realzada u original y, si se elige, la bioturbación
contada superpuesta con el color de su clase. Es un **muestreo por la fila más cercana**, sin
interpolar entre filas.

### 18.5 Columnas y escalas

| Columna | Contenido | Escala horizontal |
|---------|-----------|-------------------|
| Bioturbación (%) | barra por intervalo y contorno escalonado | 0–100 % fija |
| Por icnotaxón (%) | barras apiladas por clase contada | 0 al máximo de la ventana redondeado («nice range») |
| BI / ii | barra por intervalo; índice manual como línea negra | 0–6 |
| Registro externo | línea que une los puntos en orden de profundidad o edad | mínimo–máximo de los puntos de la ventana, redondeado; invertible |

Las líneas discontinuas marcan el techo de cada sección.

### 18.6 Exportación
- **SVG:** el mismo SVG que se ve en pantalla (vectorial; la imagen va incrustada como JPEG).
- **CSV:** una fila por intervalo de la ventana, con sección, profundidades, edad, porcentajes,
  BI, ii, índices manuales y, por cada serie externa visible, su valor **interpolado linealmente**
  en el centro del intervalo. La interpolación se hace en el eje propio del registro (profundidad
  o edad), y queda vacía fuera de su rango.

**Para el revisor.** El registro compuesto no cambia ningún cálculo: es una representación de los
intervalos de §3 en un eje común. El CSV con los registros interpolados en los mismos intervalos
permite calcular correlaciones fuera de la aplicación. La interpolación lineal supone que el
registro externo varía suavemente entre dos medidas, así que conviene que su resolución sea igual
o mayor que la de los intervalos.

---

## 19. Registros externos (aplicación web)

Implementación: `log.js::parseTable, guessAxisColumn` y `app.js` (diálogo de registros).

- **Formatos:** CSV, TXT, TSV o DAT, y Excel (`.xlsx`, `.xls`, `.ods`, primera hoja, leída con la
  librería SheetJS 0.18.5).
- **Lectura** (`parseTable`):
  - separador detectado entre tabulador, punto y coma, coma o barra vertical (el primero presente en
    las 6 primeras líneas) o espacios;
  - coma decimal si el separador no es la coma y aparecen números del tipo `1,5`;
  - cabecera si la primera fila tiene algún texto no numérico;
  - se ignoran las líneas que empiezan por `#`;
  - las celdas no numéricas se tratan como vacías.
- **Columna de eje:** se propone la primera cabecera que parezca profundidad (depth, prof, mbsf,
  CSF, CCSF, mcd, m, cm) o, si no hay, edad (age, edad, ka, Ma, yr, cal). El usuario puede cambiarla
  e indicar si es profundidad o edad.
- **Series:** cada columna elegida es una serie, con los pares (eje, valor) sin vacíos y ordenados
  por el eje. Cada serie tiene color, visibilidad y opción de invertir el eje.
- **Unidades:** una columna de profundidad debe estar en las mismas unidades que el sondeo y una de
  edad en las del modelo de edad. La aplicación no convierte unidades de registros externos.

---

## 20. Ajustes del usuario y copias de seguridad (aplicación web)

### 20.1 Ajustes propios
«Guardar ajuste» guarda con nombre los parámetros de realce y de detección de la sección activa. Los
ajustes son comunes a todos los proyectos: se guardan en el almacén `prefs` de IndexedDB, con una copia
en `localStorage`, y se incluyen en las copias de seguridad. «Aplicar este ajuste a todas las
secciones» copia realce y detección de la sección activa a las demás. Cada sección guarda los valores
efectivos en el proyecto, así que un análisis sigue siendo reproducible aunque luego se borre el
ajuste.

### 20.2 Copias de seguridad: tres capas

| Capa | Dónde | Cuándo | Protege de |
|------|-------|--------|------------|
| 1. Biblioteca | IndexedDB del navegador, marcada como persistente si el navegador lo concede | 1,5 s después de cada cambio | cierres, recargas, cortes de luz |
| 2. Carpeta automática | carpeta elegida por el usuario, idealmente sincronizada con OneDrive, Google Drive o Dropbox (Chrome/Edge) | 20 s después de cada cambio y al cambiar de proyecto | avería o pérdida del ordenador, borrado de datos del navegador |
| 3. Copia completa | archivo descargado por el usuario | a demanda | todo lo anterior; archivo independiente para guardar aparte |

En la carpeta automática se escriben:
- `<proyecto>__<id>.ichantool.json`: estado actual de cada proyecto;
- `historial/<proyecto>__<id>__AAAA-MM-DD.ichantool.json`: última versión de cada día, para volver
  a un día anterior si algo se estropea;
- `ichantool_ajustes.json`: ajustes propios.

El identificador de la carpeta se guarda en IndexedDB. El navegador pide confirmar el permiso en cada
sesión, con el botón «Reactivar copia automática».

**Qué incluye cada copia de proyecto:**
- imágenes originales;
- profundidades y modelo de edad;
- máscaras, objetos y clases asignadas por el usuario (las interpretaciones);
- ejemplos de aprendizaje importados (el entrenamiento: los ejemplos son los objetos etiquetados);
- registros externos;
- vista del registro.

**Restauración:** «Importar archivo…» acepta varios archivos de proyecto, copias completas o archivos
de ajustes. Si un proyecto ya existe con el mismo identificador, se importa como copia
(«restaurado») sin sobrescribir.

---

## 21. Herramienta multiproxy: registros numéricos, capas de intervalos y clasificación automática de intervalos (aplicación web)

Tercer modo de la aplicación («Multiproxy»; hasta V9 se llamaba «Geoquímica»), separado de las
imágenes pero guardado en el mismo proyecto (campo `geo` del archivo de proyecto, nombre conservado
por compatibilidad). Combina **registros numéricos** de cualquier tipo (geoquímica, foraminíferos,
TOC, granulometría, color…) y **capas de intervalos descritos** (litología, turbiditas, zonas de
migración de metales, eventos…), que pueden subdividirse unas dentro de otras. Con todo ello
entrena un **clasificador automático de intervalos** que se aplica a todos los sondeos, y dibuja
mapas por ventana de edad. Código: `app/js/geo.js` (sin navegador, probado en
`tests/app/geo.test.mjs`) y el bloque «multiproxy tool» de `app/js/app.js` (interfaz).

Este clasificador es **independiente** del que sugiere icnotaxones en el modo Sección (§10): usa
otro código, otras variables y otro objetivo.

### 21.1 Entrada de datos
**Registros numéricos:**
- **Tabla larga:** una fila por muestra con columna de sondeo (`coresFromLongTable`). Lat/lon se
  toman de la primera fila del sondeo que las tenga.
- **Un archivo por sondeo:** el nombre del archivo (sin extensión) es el nombre del sondeo
  (`coreFromRows`).
- **Catálogo:** asigna lat, lon y profundidad de agua por nombre de sondeo, sin distinguir
  mayúsculas (`applyCatalogue`).
- Formatos: CSV/TXT (mismo lector que §19, `parseTable`) y Excel/ODS (SheetJS, primera hoja).
- El usuario elige qué columna es sondeo, lat, lon, profundidad, edad y qué variables importa. Hace
  falta profundidad o edad. Los valores no numéricos se ignoran. Si el sondeo ya existe, las
  variables nuevas se añaden a las que tenía.

**Intervalos descritos** (`intervalsFromTable`): una fila por intervalo con techo y base (en
profundidad o en edad, en las unidades de los registros del sondeo) y:
- **formato ancho:** cada columna de texto marcada es una capa (p. ej. `Litologia`, `Turbidita`) y
  el texto de la fila es la categoría; las celdas vacías no crean intervalo;
- **formato largo:** una columna dice la capa y otra la categoría.

El sondeo sale de una columna, del nombre del archivo o de la elección del usuario. Se crean las
capas, categorías y sondeos que no existan (comparación sin distinguir mayúsculas). Un intervalo
idéntico a uno existente (mismo sondeo, capa, eje, categoría, techo y base) no se duplica.
- Las filas de cada sondeo se ordenan por profundidad (o por edad si no hay profundidad).
- **Sondeo de las imágenes** (`mainCoreFromImages`): convierte el proyecto de imágenes en un sondeo
  más, con id `main`. Sus variables son, por intervalo del registro compuesto (§18): porcentaje de
  bioturbación, BI, ii, porcentaje de cada icnotaxón que cuenta y los registros externos (§19)
  interpolados linealmente a la profundidad (o edad) del intervalo. Su edad sale del modelo de edad
  del proyecto. Así la interpretación icnológica entra como dato en el análisis multiproxy.

### 21.2 Muestras: remuestreo, transformación y escalado
`buildSamples(cores, cfg)`:
1. **Eje** (`axis`): edad o profundidad. La edad de un sondeo es su columna de edad o, si no hay,
   su modelo de edad aplicado a la profundidad (`coreAges`).
2. **Malla común** por sondeo: desde `ceil(min/paso)·paso` hasta el máximo, cada `paso`
   (por defecto 1; 0,5 en la demostración).
3. **Remuestreo lineal** (`resample`): interpolación entre las dos muestras vecinas; nulo fuera
   del rango del sondeo (no se extrapola) o si las dos vecinas están separadas más que `maxGap`
   (por defecto, desde V22, `autoGap` = 3 × la mediana del espaciado de las muestras reales de esa serie;
   antes, sin límite).
4. **Razones** A/B creadas por el usuario: se calculan fila a fila sobre los datos originales
   (nulo si el divisor es 0 o falta) antes de remuestrear.
5. **Logaritmo** opcional por variable: `t = log10(v)` si `v > 0`; si no, nulo.
6. **Valores que faltan** (`cfg.missing`): con `drop` (por defecto) una muestra entra solo si
   **todas** las variables elegidas tienen valor; un sondeo sin alguna variable no aporta muestras.
   Con `mean` (desde V12) basta con una variable; las que faltan valen la media, es decir 0 en `zc`
   y en `f` con escalado global o por sondeo (la media global de `t` sin escalar). Media y desviación
   se calculan sin los valores que faltan (`colStats`). Las reglas no se cumplen sobre un valor que
   falta. Permite combinar sondeos con variables distintas, a costa de que el modelo vea un valor
   neutro donde no hay dato.
7. **z-score dentro del sondeo** (siempre calculado, usado por las reglas y los mapas):
   `zc_j = (t_j − μ_j,sondeo) / σ_j,sondeo`, con σ de población (divisor n; si σ = 0 se usa 1).
8. **Variables del modelo** (`scaling`):
   - `global` (por defecto): `f_j = (t_j − μ_j) / σ_j` con μ y σ de todas las muestras de todos
     los sondeos (σ de población). Conserva las diferencias de nivel entre sondeos.
   - `core`: `f = zc`. Elimina diferencias de nivel entre sondeos (útil si cambian la
     calibración o la litología de fondo).
   - `none`: `f = t`.
9. **Capas de intervalos como variables** (`cfg.layers`): por cada capa usada y cada una de sus
   categorías se añade una columna `«Capa: categoría»` que vale 1 si la muestra está dentro de un
   intervalo de esa categoría (`from ≤ x < to`, con el intervalo convertido al eje si hace falta)
   y 0 si no. Estas columnas van **después** de las numéricas y **no se transforman ni se
   escalan** (valen 0/1 en `raw`, `t`, `zc` y `f`). Una muestra sin intervalo de esa capa vale 0
   en todas sus categorías (también si el sondeo no tiene esa capa descrita). Los intervalos
   automáticos (§21.3) no se usan como variables.

### 21.3 Capas de intervalos, jerarquía y etiquetas
- **Capa:** `{id, name, parent, cats:[{id, name, color}]}`. Por defecto existe la capa «Eventos»
  con cuatro categorías. El usuario crea capas, las renombra, las borra y define categorías.
- **Jerarquía:** `parent` hace que una capa sea subdivisión de otra (p. ej. Turbidita dentro de
  Litología). Se impiden ciclos (no se puede elegir como madre una capa descendiente). Al dibujar un
  intervalo de una capa hija, se recorta al intervalo madre donde empieza el arrastre. Los
  intervalos hijos que no caben enteros en un intervalo madre del mismo sondeo se marcan con ⚠
  (`orphanIntervals`), pero se conservan.
- Al convertir un intervalo entre profundidad y edad, un extremo fuera del rango de datos del
  sondeo se ajusta al primer o último valor (`coreConvert(..., clamp)`); un intervalo entero fuera
  del rango se descarta. No se extrapola.
- **Intervalo:** `{id, core, layer, axis, from, to, cat, auto?}`. Se crean arrastrando sobre el
  registro, importándolos o aceptando la clasificación; se editan en la lista (categoría, techo,
  base) y se exportan en CSV.
- **Capa objetivo:** la capa que el clasificador aprende a asignar (`settings.target`). Las demás
  capas marcadas (`settings.useLayers`; por defecto todas) entran como variables 0/1. La capa
  objetivo **nunca** entra como variable.

`labelSamples` (solo intervalos y reglas de la capa objetivo):
- **Intervalos** `{core, axis, from, to, label}` dibujados arrastrando sobre el registro de un
  sondeo, en el eje activo. Si el eje cambia, se convierten con la relación profundidad–edad del
  sondeo (`coreConvert`, interpolación lineal). Una muestra está en el intervalo si
  `from ≤ x < to`.
- **Reglas** (asociaciones de variables): `{layer, cat, enabled, conds:[{feature, op, value}]}`.
  Las condiciones pueden usar variables numéricas o columnas 0/1 de otras capas. Se
  cumple si se cumplen **todas** las condiciones. `op`: `z>` / `z<` comparan `zc` (z-score dentro
  del sondeo); `>` / `<` comparan el valor original remuestreado (sin log).
- Prioridad: intervalo manual → primera regla activa que se cumpla (si «Usar reglas» está
  activo) → sin etiqueta.
- Los intervalos **automáticos** (`auto: true`) nunca son etiquetas de entrenamiento.
- Proyectos de V9: la lista de etiquetas se convierte en la capa «Eventos» y sus intervalos y
  reglas pasan a esa capa (`normalizeGeo`).

### 21.4 Métodos de aprendizaje
Todos usan un generador pseudoaleatorio con semilla (mulberry32, `seededRandom`; semilla por
defecto 42): el mismo proyecto da el mismo resultado. Parámetros por defecto en `METHODS`:

| Método | Parámetros por defecto | Descripción |
|--------|------------------------|-------------|
| Random Forest (`rf`, recomendado) | `trees` 100, `maxDepth` 12, `minLeaf` 3, `mtry` √d, `bins` 32, `bootstrap` sí, `balanced` sí | Árboles CART con impureza de Gini. Umbrales candidatos de cada variable: los cuantiles `b/bins` (b = 1…bins−1) de los datos de entrenamiento. En cada nodo se prueban `mtry` variables al azar. Con `balanced`, cada muestra pesa `n / (K · n_clase)`. Hoja: proporciones de clase ponderadas. Probabilidad = media de las hojas de todos los árboles. Importancia: reducción de Gini ponderada por el peso del nodo, sumada por variable y normalizada a 1 (MDI). |
| k vecinos (`knn`) | `k` 7, `weights` distance | Distancia euclídea en las variables escaladas. Voto `1/(d + 0,05)` (distance; desde V22, antes `1/(d + 10⁻⁹)`, que daba votos casi seguros junto a puntos remuestreados casi idénticos) o 1 (uniform), normalizado. |
| Bayes ingenuo gaussiano (`nb`) | `smoothing` 10⁻⁶, `priors` uniform | Media y varianza poblacional por clase y variable; a cada varianza se suma `max(smoothing, 10⁻⁹) · max_j var_j` (desde V22 sin el antiguo «o 1», que daba varianza 1 a una variable constante dentro de una clase). A priori uniforme o según la frecuencia. Log-verosimilitud normalizada con softmax. |
| Red neuronal, perceptrón multicapa (`mlp`, desde V26) | `hidden` '16', `activation` relu, `epochs` 200, `lr` 0,01, `l2` 10⁻⁴, `batch` 32, `balanced` sí, `patience` 25 | Ver §21.4 bis. |
| k-medias (`kmeans`, sin etiquetas) | `k` 4, `restarts` 5, `maxIter` 100 | Inicio k-means++, iteraciones de Lloyd hasta que no cambian las asignaciones o `maxIter`; se queda la repetición con menor inercia. Grupos `G1…Gk`, que el usuario puede nombrar. |

- **Variables del modelo:** las numéricas elegidas más las columnas 0/1 de las capas usadas
  (§21.2, paso 9).
- **Entrenamiento:** con las muestras etiquetadas (intervalos y reglas de la capa objetivo). k-medias usa todas las
  muestras. Hacen falta al menos dos etiquetas distintas (salvo k-medias).
- **Clasificación:** cada muestra recibe la clase de mayor probabilidad si esta es ≥ la
  probabilidad mínima (por defecto 0,5); si no, queda sin clasificar.
- **Sondeos nuevos:** el modelo se aplica a todas las muestras, también a las de sondeos añadidos
  después de entrenar (`geoPredictAll`). Con escalado global, se usan la media y la desviación de
  las variables numéricas **congeladas al entrenar**, para que añadir sondeos no cambie la escala
  del modelo. Si cambian las variables, el eje, el escalado o la capa objetivo, hay que volver a
  entrenar.
- **Aceptar como intervalos:** las muestras contiguas de la misma clase predicha en un sondeo se
  convierten en intervalos de la capa objetivo con `auto: true` (se muestran claros y en cursiva).
  Sustituyen a los automáticos anteriores de ese sondeo y capa. El botón ✓ los confirma (dejan de
  ser automáticos y cuentan para entrenar).
- El modelo no se guarda en el archivo de proyecto (solo la definición de cada clasificador y la fecha).
  Al abrir el proyecto se reentrena con la misma semilla, por lo que el resultado es el mismo si
  los datos no han cambiado.

### 21.4 bis Red neuronal (perceptrón multicapa, desde V26)
`mlpFit` / `mlpProba` en `geo.js`:
- **Entradas** estandarizadas dentro del modelo con la media y la desviación poblacional de cada columna del
  conjunto de entrenamiento (desviación 0 → 1).
- **Arquitectura:** d entradas → capas ocultas (`hidden`, p. ej. «32,16») → K salidas con softmax.
  Activación ReLU (max(0, z)) o tanh en las capas ocultas.
- **Inicialización:** pesos ~ N(0, σ²) con σ = √(2/a) (He, ReLU) o √(1/a) (Xavier, tanh y capa de salida), a = neuronas
  de la capa anterior; sesgos 0. Normales por Box–Muller con el generador con semilla.
- **Pérdida:** entropía cruzada −w_c · ln p_c por muestra, con w_c = n / (K · n_c) si `balanced` (si no, 1),
  más penalización L2 (`l2` · W) en el gradiente de los pesos (no en los sesgos).
- **Optimización:** Adam por minilotes (`batch`), β1 = 0,9, β2 = 0,999, ε = 10⁻⁸, tasa `lr`; el orden se baraja
  cada época con el generador con semilla.
- **Parada temprana:** si n ≥ 40 se reserva, por clase, el 15 % de las muestras (clases con ≥ 4) como validación;
  tras cada época se calcula su pérdida media y se guardan los pesos con la menor; se para tras `patience`
  épocas sin mejora o al llegar a `epochs`.
- Determinista para una semilla y un orden de clases dados.

### 21.4 ter Clasificadores definidos por el usuario (desde V26)
- `S.geo.classifiers = [{id, name, targets: [familias], features: null | [variables], layers: null | [familias de
  entrada], method, params: {método: {…}}, minProb, seed, useRules, trained}]`. `features` null = todas las variables del
  paso 2; `layers` null = todas las demás familias con intervalos descritos (las objetivo nunca son entrada).
- Las muestras se construyen una vez con todas las variables del paso 2 y una columna 0/1 por clase de **cada**
  familia con intervalos descritos (`featLayers`); cada clasificador usa el subconjunto de columnas que le
  corresponde (`clfCols`).
- **Entrenamiento** (`trainClassifier`): un modelo por familia objetivo, con las etiquetas de esa familia
  (intervalos descritos y, si `useRules`, reglas), y su validación cruzada (§21.5). Hacen falta al menos 2 clases
  (salvo k-medias).
- **Predicción** (`predictRun`): el modelo guarda los nombres de sus columnas (`colNames`) y, con escalado global,
  la media y la desviación de sus variables numéricas al entrenar; al predecir se buscan esas columnas por nombre,
  de modo que añadir variables, familias o sondeos no invalida el modelo. Si falta alguna columna o cambian el eje
  o el escalado, la columna automática se oculta hasta reentrenar.
- **Columnas automáticas:** una por clasificador y familia, a continuación de la columna de la familia, con la
  clase predicha de cada muestra; opacidad = 0,3 + 0,7 · probabilidad.
- **Archivos anteriores a V26:** el primer clasificador se crea a partir de los ajustes del modelo único
  (`target`, `useLayers`, `method`, `params`, `minProb`, `seed`, `useRules`).
- **Clasificación manual:** cada familia es una columna en todos los sondeos (también vacía); arrastrar en ella crea un
  intervalo (una subdivisión se recorta al intervalo madre donde empieza) con la última clase usada en esa familia;
  clic edita la clase o lo borra. Copiar desde una columna automática: un tramo → intervalo confirmado; la columna
  entera → intervalos `auto: true` (pendientes de revisar, no entran en el entrenamiento hasta confirmarlos).

### 21.4 quater Progreso del entrenamiento y número de versión (desde V27)
- El entrenamiento avanza por pasos: por cada clasificador y familia, 1 ajuste del modelo + 1 paso por pliegue de la
  validación (`crossValidateSteps`, generador que cede antes de cada pliegue); la red neuronal cede además tras cada
  época (`fitModelSteps` / `mlpFitSteps`). `crossValidate` y `fitModel` siguen existiendo y dan el mismo resultado.
- Progreso = (pasos terminados + fracción de épocas del paso actual) / pasos totales; tiempo restante ≈
  transcurrido / progreso × (1 − progreso), mostrado a partir de 1,5 s. La página recibe el control como mucho cada
  60 ms. «Cancelar» detiene el entrenamiento y conserva los modelos anteriores del clasificador interrumpido.
- **Número de entrega** (`DELIVERY` en `app.js`, p. ej. «V27»): visible junto al nombre del programa (cabecera y
  pantalla inicial), en la ayuda, en el título de la ventana, en los archivos de proyecto (`delivery`) y en el nombre
  del archivo sin conexión (`dist/CorAnTool_V27.html`, leído por `tools/build_standalone.py`).

### 21.5 Validación cruzada
`crossValidate`:
- Con muestras etiquetadas en **dos o más sondeos: dejando un sondeo fuera** (cada sondeo se
  predice con un modelo entrenado sin él).
- Con un solo sondeo: **5 bloques contiguos** a lo largo del eje.
- Ambos esquemas evitan que muestras vecinas (autocorrelacionadas) estén a la vez en
  entrenamiento y prueba, lo que inflaría el acierto.
- Se informa: matriz de confusión, acierto, **acierto equilibrado** (media de la sensibilidad de
  cada clase, que no se deja engañar por una clase mayoritaria como el fondo), precisión,
  sensibilidad y F1 por clase. En validación se usa probabilidad mínima 0.
- Desde V22: **solo se puntúan las muestras etiquetadas por intervalos descritos**; las etiquetas por reglas
  (umbrales de z sobre las mismas variables) se usan para entrenar pero no para evaluar (si no, la evaluación es
  circular). Se informa además el acierto equilibrado por sondeo dejado fuera (media ± desviación) y, con la
  probabilidad mínima en uso, la cobertura (fracción clasificada) y su acierto.

### 21.5 bis Prueba de la autoclasificación en un sondeo
`geoTestCore` (botón «Probar la autoclasificación en este sondeo»), con el método y los parámetros
elegidos (k-medias se sustituye por Random Forest):
- si las muestras etiquetadas de **otros sondeos** cubren al menos dos clases, se entrena con ellas
  y se predice el sondeo actual;
- si no, el sondeo se divide en **5 bloques contiguos** a lo largo del eje y cada bloque se
  predice con un modelo entrenado con todas las etiquetas menos las de ese bloque.

Se muestran las bandas «Prueba» y «Acierto» (verde si la predicción coincide con la etiqueta,
rojo si no) y el porcentaje de coincidencia sobre las muestras etiquetadas del sondeo. Es una
comprobación visual de la validación cruzada (§21.5) en un sondeo concreto; no cambia el modelo
entrenado. «Colorear registros por clase» rellena el fondo de cada columna de registro (opacidad
0,22) con la clase de la prueba, si existe; si no, de la clasificación; si no, de las etiquetas.

### 21.6 Mapas por edad
- **Ventana de edad** `[a0, a1)` (por defecto 6–10 ka); los botones ◀ ▶ la desplazan su propia
  anchura.
- **Clase dominante** (`mapSummary`, modo `class`): por sondeo, fracción de muestras de cada
  clase predicha (o de las etiquetas si no hay modelo) en la ventana; el punto toma el color de la
  dominante y su radio es `5 + 5 · fracción` px.
- **Valor de un proxy** (modo `value`): media de `zc` de la variable en la ventana; opcionalmente
  menos su media en una ventana de referencia (anomalía). Escala divergente azul–beige–rojo
  saturada en ±2.
- **Interpolación IDW** (`idwGrid`, solo modo valor, ≥ 3 sondeos con dato): malla de 90 columnas;
  `v = Σ w_i v_i / Σ w_i`, `w_i = 1 / d_i^p` (p por defecto 2), con `d` en grados y la longitud
  multiplicada por `cos(latitud central)`. Es exploratoria: no estima incertidumbre ni respeta
  barreras de tierra.
- **Proyección** equirectangular con la longitud escalada por `cos(latitud central)`. Costa:
  Natural Earth 1:50 m (dominio público), 1223 anillos en `examples/data/land-50m.json`.
- Exportación SVG y CSV (`core, lat, lon, n_samples, dominant_class, fraction, value`).

### 21.6 bis Personalización, fondos y zoom (desde V15)
- **Estilo** (`MAP_STYLE`, valores por defecto): `bg='vector'`, `bgOpacity=1`, `coast=true`,
  `symbol='circle'`, `size=1`, `sizeByFraction=true`, `labels=true`, `labelSize=11`,
  `labelColor='#1c2422'`, `halo=true`, `labelValue=true`, `pointColor='#ffffff'`, `stroke='#1c2422'`,
  `land='#e6e6dc'`, `sea='#f4f8f9'`, `graticule=true`, `scaleBar=true`, `north=false`.
- **Radio del símbolo:** clase `r = (sizeByFraction ? 5 + 5·fracción : 7) · size`; valor `6 · size`;
  sin datos `4 · size`. Símbolos: círculo, cuadrado (lado 1,78 r), triángulo, rombo, estrella (10
  vértices, interior 0,45), hexágono y cruz.
- **Fondos** (`MAP_BG`): una imagen por mapa pedida en EPSG:4326 para la extensión exacta, con píxeles
  cuadrados en grados (ancho 1600 px, alto `1600·Δlat/Δlon`, máx. 3000) y estirada sobre el área del
  mapa; como el mapa es equirectangular con la longitud escalada por una constante, la correspondencia
  es exacta. Servicios: Esri ArcGIS `MapServer/export` (World_Physical_Map, World_Shaded_Relief,
  World_Topo_Map, Ocean/World_Ocean_Base, World_Imagery) y WMS 1.1.1 de GEBCO (capa `GEBCO_LATEST`).
  «Foto aérea + batimetría» = GEBCO debajo y World_Imagery recortada con los polígonos de tierra de
  Natural Earth. Con fondo de imagen la tierra vectorial se dibuja solo como línea de costa y la IDW
  con opacidad 0,55. Las imágenes se guardan como data URL (el SVG exportado es autónomo). Si falla la
  descarga se dibuja el mapa simple.
- **Barra de escala:** km por píxel = `Δlon · 111,32 · cos(lat central) / 900`; se elige el mayor
  valor 1, 2 o 5 × 10ⁿ km que quepa en 160 px.
- **Zoom** (`zoomBBox(bbox, f, lon, lat, dlon, dlat)`): `x0' = lon − (lon − x0)/f + dlon`, ídem para
  `x1`, `y0`, `y1`; anchura máxima 360°, latitudes limitadas a ±85°. Rueda: f = 1,2 por paso; doble
  clic: f = 2; botones: f = 1,5. Arrastre: `dlon = −dx/(k·900)·Δlon`, `dlat = dy/(k·H)·Δlat`, con
  `k` la escala de pantalla del SVG.
- La extensión elegida se guarda en `geo.map.view` (`null` = ajustada a los sondeos con margen de 3°
  y 3° más al este para las etiquetas); el estilo en `geo.map.style`.

### 21.6 ter Interpolación, escala de color, proyecciones y exportación (desde V20)
Módulo `interp.js` (sin DOM). Desde V22 las distancias son **km** en una proyección azimutal de Lambert de
áreas iguales centrada en el mapa (`makeProjection('laea')` × 6371 km); antes, grados con la longitud × cos φ₀.
Los sondeos a menos de 10 m se promedian antes de interpolar (evita sistemas singulares).
La malla tiene `res` celdas a lo ancho (90 por defecto, 10–400) y `ny = res · H / W` filas; cada celda vale lo
interpolado en su centro.
- **Inverso de la distancia:** `v = Σ wᵢvᵢ / Σ wᵢ`, `wᵢ = 1/dᵢ^p` (p = 2); radio de búsqueda opcional y número
  máximo de sondeos (los más cercanos).
- **Vecino más cercano:** valor del sondeo más próximo (dentro del radio, si se da).
- **Triangulación lineal:** Delaunay (Bowyer–Watson) e interpolación baricéntrica; fuera de los triángulos, vacío.
- **Curvatura mínima:** spline de placa delgada `φ(r) = r² ln r` con término lineal `a + b·x + c·y` (es la
  superficie de mínima energía de flexión que pasa por los datos, el mismo criterio que la curvatura mínima de
  Surfer, resuelto de forma exacta en lugar de iterativa); «suavizado» λ se suma a la diagonal.
- **Funciones de base radial:** multicuádrica `√(r² + c²)`, gaussiana `exp(−(r/c)²)` o placa delgada; `c` = forma
  (1 por defecto); mismo sistema `[Φ + λI, P; Pᵀ, 0]`.
- **Kriging ordinario:** sistema `[Γ, 1; 1ᵀ, 0]` con `Γᵢⱼ = γ(dᵢⱼ)`; su inversa se calcula una vez y los pesos
  de cada celda son `A⁻¹·[γ(dᵢ), 1]`. Variogramas esférico, exponencial (`1 − e^(−3h/a)`), gaussiano
  (`1 − e^(−3(h/a)²)`) y lineal con pepita y meseta. Ajuste automático: semivariograma empírico en 8 clases de
  distancia hasta la mitad de la distancia máxima; meseta = varianza de los valores; alcance (30 valores hasta la
  distancia máxima) y pepita (0–50 % de la meseta) por mínimos cuadrados ponderados por `n_h / h²` (Cressie, 1985; desde V22, antes `n_h`). Con menos de 15 sondeos se avisa de que el
  variograma es poco fiable. El pivote mínimo de la eliminación gaussiana es relativo: `10⁻¹² · max|A|`.
- **Media móvil:** media de los sondeos a menos del radio (500 km si no se indica).
- **Valores por defecto desde V22:** solo dentro del contorno de los sondeos (`hull`) y solo mar (`mask: 'sea'`), para
  no extrapolar; forma de las RBF 200 km; alcance manual 500 km.
- Si un sistema no se puede resolver se usa el inverso de la distancia (se avisa).
- **Opciones:** solo dentro del contorno convexo de los sondeos; rellenar mar y tierra, solo mar o solo tierra
  (centro de la celda dentro o fuera de los polígonos de Natural Earth); opacidad; isolíneas por cuadrados
  marchantes en `n` niveles «redondos» entre el mínimo y el máximo del color, con etiquetas.
- **Color:** 8 escalas (divergente suave, azul–rojo, viridis, magma, terreno, océano, grises, arcoíris), invertible;
  rango −2…2 (z), mínimo–máximo, simétrico ±máx o manual; continuo o en `n` clases. Barra de color bajo el mapa.
  Los puntos del modo «valor» usan la misma escala.
- **Sondeos del mapa:** lista con casilla por sondeo; los desmarcados no se dibujan ni entran en la interpolación
  (`geo.map.off`).
- **Proyecciones:** equirrectangular con escala cos φ₀ (por defecto), Mercator (`y = ln tan(π/4 + φ/2)`) y Lambert
  azimutal de áreas iguales centrada en el mapa. El marco se calcula muestreando los bordes de la extensión; la
  retícula se dibuja como curvas; las celdas son rectángulos (equirrectangular, Mercator) o cuadriláteros
  proyectados. Los fondos raster solo se usan en equirrectangular (EPSG:4326) y Mercator (EPSG:3857; en GEBCO la
  extensión se pasa en metros, R = 6 378 137 m); en Lambert se dibuja el mapa vectorial. La barra de escala se mide
  en el centro del mapa.
- **Tamaño y exportación:** el mapa ocupa todo el ancho; «⤢» oculta el panel y «⛶» lo pone a pantalla completa.
  PNG de 1800 a 7200 px de ancho; el fondo raster se vuelve a descargar a ese ancho (máximo 4096 px por los
  servicios) antes de rasterizar.

### 21.6 quater Valores del mapa (desde V22)
- En el modo «valor», la media de cada sondeo usa **solo las muestras con dato real** de la variable (con «rellenar
  con la media» las muestras sin dato valen z = 0 y antes entraban en la media y en la interpolación). Un sondeo sin
  datos reales en la ventana se dibuja como «sin datos».
- Los modelos de edad con **inversiones** (edad que disminuye hacia abajo) se señalan en la interfaz; la conversión
  edad → profundidad es ambigua en ese caso.

### 21.7 Superposición con el registro del sondeo
- En el modo «Multiproxy», el registro de cada sondeo muestra sus variables numéricas y una banda
  por capa de intervalos en orden jerárquico (las hijas con «↳»), dibujada desde los intervalos;
  en la capa objetivo se añaden, en claro, las muestras etiquetadas por reglas. Al final, la banda
  **«Clasif. auto»** (predicción).
- Si el sondeo de las imágenes está incluido, el registro compuesto (§18) añade sus bandas de
  intervalos y de clasificación junto a la imagen y la bioturbación, en profundidad o en edad.
- Exportación de la clasificación (`*_clasificacion_intervalos.csv`): sondeo, eje, profundidad,
  edad, variables, etiqueta, origen de la etiqueta, clase predicha y probabilidad.
- Exportación de intervalos (`*_intervalos.csv`): sondeo, capa, capa madre, categoría, eje, techo,
  base, automático y fuera de la capa madre. Se puede volver a importar.

### 21.7 bis Lectura con el cursor, columnas redimensionables y ayuda emergente (desde V25)
- **Cursor de lectura** (Columna y Multiproxy › Curvas): al pasar el ratón por el gráfico se dibuja una
  línea a esa altura; a = desde + (y − arriba) / alto × (hasta − desde). El valor de cada registro en a
  (`recordAt`) es la interpolación lineal entre los dos puntos no vacíos más cercanos por encima y por
  debajo; se muestra «—» si no hay punto a ambos lados o si están separados más de 3 × la mediana del
  espaciado del registro (`medianGap`). Las bandas muestran la clase del tramo que contiene a. En
  Multiproxy se añade la muestra remuestreada más próxima (si |x − a| ≤ paso): etiqueta descrita o por
  regla y clase predicha con su probabilidad; en Columna, % de bioturbación, BI, ii y los 4 icnotaxones
  con más porcentaje del tramo.
- **Nombres de columna:** `wrapTitle(texto, ancho)` reparte el nombre en hasta 2 líneas de
  ⌊(ancho − 4) / 5,6⌋ caracteres (letra de 10 px); si no cabe, la segunda termina en «…». El nombre completo
  aparece al pasar el ratón por la cabecera.
- **Anchos:** `buildLogSVG` acepta `colWidths` (`{'rec:<nombre>' | 'band:<capa>' | 'total' | 'species': px}`,
  límites 30–600 px) y `recWidth` (ancho por defecto de las variables, 120 px). Se cambian arrastrando el
  borde derecho de la cabecera; doble clic restaura. Se guardan en el proyecto (`S.logView.colW`,
  `S.geo.view.colW`, `S.geo.view.trackW`). El gráfico se desplaza dentro de su marco
  (máx. alto de la ventana − 170 px) en horizontal y vertical.
- **Clic en las curvas** (sin «Marcar intervalos»): selecciona en la lista el intervalo de esa altura (de la
  capa de la banda pulsada o, si no, de la capa activa).
- **Mapas:** cada sondeo lleva `data-tip` (nombre, proyecto, clase dominante con % o valor, número de
  muestras y coordenadas) mediante la opción `tipFn` de `buildMapSVG`.
- **Ayuda emergente:** todo elemento con `title` o `data-tip` muestra una ayuda propia a los 350 ms (también
  con el teclado); el `title` se pasa a `data-tip` para no duplicar la ayuda del navegador.

### 21.8 Datos de demostración (sintéticos)
`tools/make_geochem_demo.py` (semilla 397) genera 15 sondeos **ficticios** en el Mediterráneo
(0–150 ka cada 0,5 ka, 4515 muestras) con eventos conocidos (columna `event_true`): baja
oxigenación en 6–10, 79–86, 100–105 y 122–128 ka solo al este de ~11° E (Ba/Al y TOC altos, Mn/Al
bajo, más intensos hacia el este); aporte detrítico en 14–29, 57–71 y 130–150 ka (Ti/Al alto,
Ca bajo); pulsos de corriente al oeste de 10° E (Zr/Rb alto). Ruido AR(1) multiplicativo. Además, `intervals.csv` (generador aleatorio aparte, semilla 398,
para no cambiar los registros numéricos): capa **Litologia** («Arcilla limosa» en las ventanas
detríticas con los límites desplazados ±1 ka; «Marga nanofosilifera» el resto) y capa
**Turbidita**, de 0 a 3 capas finas (0,3–1,2 ka) por sondeo, siempre dentro de arcilla limosa
(subdivisión). Archivos: `examples/geochem_demo/` (tabla larga, catálogo, un archivo por sondeo e
intervalos en profundidad).

El botón «Datos de demostración» etiqueta intervalos a partir de la verdad sintética en dos sondeos
por evento (DEMO-02 y DEMO-12 detrítico; DEMO-09 y DEMO-14 baja oxigenación; DEMO-01 y DEMO-04
corriente) más el fondo de esos sondeos, importa `intervals.csv` (Turbidita como subdivisión de
Litologia), añade una regla de ejemplo (Ba/Al z > 1,5 y Mn/Al z < −0,5 → baja oxigenación) y
entrena un Random Forest con capa objetivo «Eventos» y 9 variables (6 numéricas y 3 de capas).

**Para el revisor.** Los resultados con estos datos (V10: acierto 98,4 %, acierto equilibrado
96,7 %, dejando un sondeo fuera, 1730 muestras etiquetadas; en V9, sin capas de intervalos, 98,6 %
y 97,7 %) **solo comprueban que la
implementación funciona**: los eventos sintéticos están muy separados y no representan la
dificultad de datos reales. La validez para interpretar eventos reales debe medirse con sondeos
con interpretación publicada e independiente, dejando sondeos enteros fuera. Las etiquetas por
reglas hacen que el modelo reaprenda las reglas: su acierto mide coherencia, no verdad. La
importancia MDI reparte el mérito de forma desigual entre proxies correlacionados (p. ej. Ba/Al y
TOC); para un artículo conviene añadir importancia por permutación. En la demostración la
litología se construyó a partir de las ventanas detríticas, así que está muy ligada a la etiqueta
«aporte detrítico»: con datos reales, una capa descrita así de cerca del objetivo puede hacer que
el modelo dependa de la descripción y no de los registros.

---

## 22. Organización del programa: proyectos, sondeos, datos, ventanas y figuras (aplicación web, desde V14)

### 22.1 Estructura
- **Pantalla inicial (⌂ Proyectos):** lista de proyectos (abrir, renombrar, borrar, crear, importar,
  copias de seguridad) y «Todos los proyectos»: tabla de los sondeos de todos los proyectos y mapa
  multiproyecto.
- **Proyecto → sondeos.** Cada sondeo (`makeCore`) tiene: nombre, lat, lon, profundidad de agua,
  unidades de profundidad, notas, secciones de imagen con su bioturbación, registros externos,
  datos importados (`imp`), columnas manuales (`user`), modelo de edad y vista del registro. Los
  intervalos, capas, reglas, ajustes multiproxy, columnas calculadas, hoja libre y figuras son del
  proyecto y se refieren a los sondeos por su identificador.
- **Sondeo activo.** Las herramientas de imagen y el registro del sondeo trabajan sobre el sondeo
  elegido en la cabecera: `S.sections`, `S.records`, `S.age` y `S.logView` apuntan a los del sondeo
  (`activateCore`).
- **Datos derivados de un sondeo** (`refreshCoreData`): se unen en una sola tabla, ordenada por
  profundidad, (1) la bioturbación de las imágenes por intervalo (%, BI, ii, % por icnotaxón; en las
  unidades del sondeo), (2) los registros externos (los que están en edad se pasan a profundidad con el
  modelo de edad invertido), (3) los datos importados y (4) las columnas manuales; después se
  aplican las columnas calculadas. Cada fila lleva la profundidad de su dato; la edad es la del dato
  importado si la tiene y, si no, la del modelo de edad. Un sondeo sin ninguna profundidad (solo
  edad) se guarda solo por edad. Cada columna recuerda su origen (`src`: importado, registro, creado
  desde imágenes, manual, calculado), que la pestaña Datos muestra.

### 22.2 Archivo de proyecto v3 y almacenamiento
- Formato v3: `{version: 3, id, name, notes, classes, settings, library, geo (sin sondeos), sheet,
  fig, curCore, cores: [{id, name, lat, lon, waterDepth, units, source, notes, imp, user, records,
  logView, age: {text, units}, sections: [...]}]}`. Los archivos v1/v2 se convierten al abrirlos
  (`upgradeProject`): las imágenes forman un sondeo (id `main`, para conservar sus intervalos) y cada
  sondeo multiproxy pasa a ser otro sondeo con sus datos como importados.
- IndexedDB versión 3: almacén nuevo `lite` con una copia ligera de cada proyecto (datos numéricos
  derivados de cada sondeo, capas, intervalos y ajustes multiproxy), escrita en cada guardado. La usan
  la pantalla inicial y las ventanas secundarias para no tener que decodificar imágenes. Los proyectos
  restaurados desde archivo aparecen en la tabla multiproyecto cuando se abren y guardan una vez.

### 22.3 Pestaña Datos
- **Tabla:** sondeo activo o todos; profundidad, edad, columnas ordenadas por origen y, si se pide,
  la categoría de cada capa de intervalos en esa fila; exportación CSV; las columnas manuales se
  editan en la tabla.
- **Columnas calculadas** (`sheet.js::evalColumn`): una fórmula por columna, evaluada fila a fila
  sobre el sondeo. Operadores `+ − * / ^` y comparaciones (`< > <= >= == !=`, dan 1/0); nombres sin
  espacios o entre corchetes (`[XRF Ba/Ti]`), `depth`, `age`. Funciones: `log10, ln, exp, sqrt, abs,
  round, pow, min, max` (elemento a elemento con dos columnas), `mean, std` (desviación muestral,
  n − 1), `median, sum, count, zscore` ((x − media) / desviación muestral), `norm01`, `movavg(x, n)`
  (media centrada de n filas), `diff, cumsum, if(c, a, b)`, `corr`. Un valor que falta da un
  resultado que falta; la división por 0 también. Se pueden aplicar a todos los sondeos o a uno; se
  recalculan solas y son variables más en Multiproxy.
- **Hoja libre** (`sheet.js::evalCells`): celdas A1… con número, texto o fórmula `=`; referencias,
  rangos `A1:B5`, las mismas funciones y `COL("columna", "sondeo")`, que devuelve una columna de un
  sondeo (por defecto el activo); una celda que recibe una columna muestra su media. Las referencias
  circulares dan error.

### 22.3 bis Gráficos de la pestaña Datos (desde V21)
Vista «Gráficos (tipo Grapher)» de la pestaña Datos, módulo `plot.js` (sin DOM). Cada proyecto guarda una
lista de gráficos (`plots`, `plotCur`).
- **Registro estratigráfico:** un panel por variable con eje vertical común (profundidad o edad, hacia abajo
  salvo que se marque lo contrario); varios sondeos = una línea de color por sondeo; cada panel con escala
  logarítmica o invertida opcional.
- **XY:** cualquier columna (o profundidad/edad) en X frente a una o varias en Y; eje Y secundario; ejes
  logarítmicos (marcas 1-2-5) o invertidos; mínimos y máximos manuales; si no, rango de los datos ± 4 %.
- **Tipos de serie:** línea (se corta cuando el salto entre muestras supera 5 veces el espaciado mediano),
  puntos, línea y puntos, escalón, área (hasta 0) y barras.
- **Ajustes** (mínimos cuadrados): lineal y polinómico de grado 2–6 (ecuaciones normales), exponencial
  `y = a·e^(bx)` (sobre ln y, y > 0), potencial `y = a·x^b` (sobre ln x y ln y), logarítmico `y = a + b·ln x`, y
  media móvil centrada de `w` puntos; `R² = 1 − SS_res / SS_tot` en la escala original. Tabla con ecuación, R² y n.
- **Estadística por serie:** n, media, desviación típica (n − 1), mínimo, mediana, máximo y, en XY, r de Pearson.
- Exportación en SVG, PNG (×3) y CSV (sondeo, eje, variable, valor).

### 22.4 Ventanas y panel flotante
- «Abrir en ventana nueva» abre la misma aplicación con `#win=map|geologs|corelog&project=…&core=…`.
  Esa ventana es de **solo lectura** (no guarda) y se recarga cuando la principal guarda: mensaje
  `BroadcastChannel('ichantool')` y, como respaldo, comprobación cada 4 s de la fecha de guardado
  del proyecto. Mapa y registros multiproxy se construyen desde la copia ligera; el registro del
  sondeo carga el proyecto completo.
- Con el archivo local (`file://`) algunos navegadores aíslan las pestañas; por eso existe también
  el **panel flotante**, dentro de la misma ventana, que se redibuja 0,5 s después de cada cambio.

### 22.5 Figuras
- **Trazas representativas:** para cada icnotaxón del sondeo activo, el usuario marca qué trazas
  usar (miniaturas) o pide una elección automática de N por icnotaxón: las de mayor área; las «más
  típicas» (menor distancia euclídea, en descriptores estandarizados por la desviación de la clase, a
  la mediana de la clase, §9); o repartidas en profundidad (N trazas equiespaciadas en el orden de
  profundidad). Cada ejemplo es un recorte del rectángulo envolvente con un margen del 15 %, escalado a
  un tamaño fijo, con contorno opcional en el color de la clase, barra de escala (0,05–10 cm, la mayor
  que cabe en el 45 % del recuadro) y sección y profundidad.
- **Sondeo entero interpretado:** registro compuesto de techo a muro con imagen, trazas, pistas
  elegidas, registros y bandas de intervalos y de clasificación del sondeo.
- **Registro del sondeo, registro multiproxy y mapa:** las vistas actuales de esos modos.
- Todas llevan título y pie opcionales y se exportan en SVG (imágenes incrustadas) y PNG (×2).

### 22.6 Pantalla inicial con pestañas y análisis multiproyecto (desde V17)
- La pantalla inicial tiene dos pestañas: **Proyectos** y **Todos los proyectos** (tabla de los sondeos
  de todos los proyectos, mapa multiproyecto y análisis multiproyecto).
- **Análisis multiproyecto:** se marcan sondeos de proyectos distintos y se crea un proyecto de tipo
  `multi` (`projectKind: 'multi'`, `multiSource.keys = ['proyecto|sondeo', …]`). Cada sondeo es una
  copia de sus datos ya combinados (profundidad, edad y columnas del índice `lite`, como tabla
  importada; sin imágenes) con `origin = {project, core}`. Capas y categorías se unen **por nombre**
  (la capa madre también); los intervalos se copian con los nuevos identificadores. Si dos sondeos se
  llaman igual se añade el nombre del proyecto.
- Variables por defecto: las columnas presentes en al menos dos sondeos (hasta 12, las más
  frecuentes); si había «descartar», los huecos pasan a rellenarse con la media. Capa objetivo: la
  misma si existe; si no, la primera con intervalos.
- Ahí funcionan Multiproxy, Datos y Figuras. «Actualizar desde los proyectos» (lista de proyectos)
  vuelve a copiar los datos conservando ajustes, figuras y hoja de cálculo. Crear un análisis con un
  nombre ya usado lo actualiza.
- Desde V24 los proyectos `multi` («análisis entre proyectos») no aparecen en la lista de proyectos:
  se listan, abren, actualizan, renombran y eliminan en la pestaña «Entre proyectos»; con uno abierto
  la cabecera dice «Análisis».
- Los proyectos `multi` no aparecen en la tabla ni en el mapa de todos los proyectos ni aportan
  ejemplos al modelo de todos los proyectos. Desde V23 un mismo sondeo de varios proyectos se une
  (§22.6 bis).

### 22.6 bis Pantalla inicial genérica, sondeos compartidos, paneles y marcos de mapa (desde V23)
- **Pantalla inicial:** todos los proyectos guardados (también los de ejemplo) como tarjetas; los datos privados no tiene acceso propio. Pestañas «Proyectos» y «Todos los sondeos»; buscador
  sobre nombres de proyecto y de sondeo (`coreKey`).
- **Clave de sondeo:** `coreKey(nombre)` = minúsculas, sin acentos (NFD) y solo letras a–z y cifras
  (se quita cualquier otro carácter). `sharedCores(lites)` → `Map(coreKey → Map(idProyecto → nombreProyecto))`
  sobre proyectos que no son `multi`. Compartido = presente en ≥ 2 proyectos.
- **Mapa de todos los sondeos:** los puntos con la misma clave se unen; modo valor: media aritmética
  de los valores de los proyectos con datos en la ventana, `n` = suma de muestras.
- **Análisis multiproyecto:** sondeos marcados con la misma clave → un solo sondeo
  (`origin` = lista de `{project, core}`). Tablas unidas con `mergeImp`: filas ordenadas por
  profundidad si todas la tienen; si no, por edad si todas la tienen; si no, una serie tras otra.
  Filas con |Δ| < 1e-6 en el eje de orden se fusionan (por columna, primer valor no vacío). Intervalos
  repetidos (mismo sondeo, capa, clase, eje y límites con |Δ| < 1e-9) se eliminan.
- **Modelo de icnotaxones «todos los proyectos»:** un ejemplo de otro proyecto se descarta si su vector
  de descriptores redondeado a 3 decimales coincide con uno propio, de la biblioteca o ya añadido.
- **Paneles:** columnas de `.work` = `var(--lw, 280px) minmax(0,1fr) var(--rw, 320px)`; divisores con
  ancho entre 170 px y el 60 % del área de trabajo; ocultar = clase `lcollapsed` / `rcollapsed`. Preferencias en
  `localStorage['ichantool.panels']`.
- **Marcos de mapa:** `--fw` (ancho, mínimo 320 px) y `--fh` (alto, mínimo 240 px), en
  `localStorage['ichantool.mapFrames']`. Con alto fijado, razón alto/ancho del área del mapa
  r = (fh / s − 44 − 110) / 900, con s = ancho del marco / 900 (mínimo 0,2); la extensión se amplía con
  `fitBBoxAspect(bbox, r, proyección)`: hasta 12 iteraciones que ensanchan la latitud (si el mapa es
  más ancho de lo pedido) o la longitud (si es más alto), alrededor del centro, deteniéndose cuando el
  error |ln(H/W ÷ r)| < 0,01 o deja de mejorar (Lambert muy ancho). Nunca recorta la extensión.

### 22.8 Recorte de imágenes, marcadores Start/End, zonas excluidas en la columna y programa de escritorio (desde V31)
- **Recorte** (sección › ✂ Recortar; se ofrece al importar una sola imagen): dos líneas «Crop top» y «Crop bottom»
  (filas y0 < y1, al menos 10 px). Se eliminan las filas fuera de [y0, y1) de la imagen, las trazas y la capa de
  exclusión; los objetos se recalculan y se vacía el historial de deshacer. Profundidades:
  - «recalcularlas» (por defecto, las profundidades eran de la imagen completa): con r0 = máx(roi.y0, y0) y
    r1 = mín(roi.y1, y1), techo′ = prof(r0), muro′ = prof(r1) (prof = interpolación lineal actual entre roi.y0 → techo y
    roi.y1 → muro) y roi′ = [r0 − y0, r1 − y0] en vertical; si el área de análisis estaba dentro del recorte, no cambia nada;
  - «mantenerlas» (las profundidades ya eran las del sondeo): techo y muro iguales, roi′ = toda la imagen recortada.
  La imagen recortada se guarda de nuevo en el proyecto (JPEG calidad 0,95 si el original era JPEG; si no, PNG) con
  rotación 0 y reducción 1, para que el archivo coincida con lo analizado.
- **Start / End:** triángulos a la izquierda de la imagen en roi.y0 y roi.y1; al arrastrarlos cambia el área de análisis
  (mínimo 4 px) y techo y muro pasan a corresponder a las nuevas filas.
- **Columna › Ocultar zonas excluidas:** los píxeles con exclusión salen en blanco en la imagen de la columna
  (`S.logView.hideExcl`). La copia de cada sección para la columna se reduce a ≤ 512 px de ancho (antes, resolución
  completa) para ahorrar memoria.
- **Arranque limpio:** ningún proyecto precargado; nada se guarda hasta crear, importar o abrir un proyecto. El proyecto de
  los datos privados solo se abre con su botón y solo donde existen sus datos privados; el archivo sin conexión ya no los incluye
  salvo con una opción retirada.
- **Programa de escritorio** (`desktop/`, Electron 33): sirve `app/` y los ejemplos públicos por el esquema `app://`
  (sin datos privados (retirados)); límite de memoria de JavaScript = 75 % de la RAM entre 2 y 32 GB
  (`--max-old-space-size`), aunque Electron limita cada ventana a unos 4 GB de objetos JavaScript (compresión de punteros);
  las imágenes (ArrayBuffer) quedan fuera de ese límite y, por encima de la RAM, el sistema pagina a disco. Los proyectos se
  guardan en IndexedDB dentro de la carpeta de datos del programa, con almacenamiento persistente. Versión del ejecutable =
  número de entrega (V31 → 31.0.0); archivos `CorAnTool-V31-<sistema>-<arquitectura>`. GitHub Actions
  (`.github/workflows/desktop.yml`) compila Windows (instalador NSIS y portable), macOS (dmg universal) y Linux
  (AppImage y deb) al subir una etiqueta `V*` y los publica en Releases. Sin firma de código.

### 22.9 Modo identificación, leyendas y nuevas figuras (desde V32)

**Opciones comunes (V0.2).** Ventana de profundidad (unidades del sondeo; vacía = todo) para todas las figuras; en
edad se convierte con el modelo de edad. Con «Mantener proporción», alto = ancho · L / A (L = longitud de la ventana en
cm, A = mediana de la anchura en cm de las zonas de análisis de las secciones de la ventana); máximo 6000 px en la
columna y 4000 px en los paneles de secciones (si se supera, se reduce el ancho). Ocultar icnotaxones (botón 👁) solo
cambia lo que se ve en la imagen de trabajo.

- **Modo identificación** (`S.settings.idMode`, casilla en la barra de la sección): para sondeos donde no se puede
  cuantificar la bioturbación. Herramienta **Marcar** (tecla M): clic = marca `{id, x, y, cls}` del icnotaxón activo en
  `s.marks` (coordenadas de la imagen; se guardan con la sección y se recortan y giran con ella); clic a ≤ 9 px de pantalla de
  una marca o Alt+clic = quitarla. En la columna (y en la figura «Sondeo completo») se ocultan bioturbación, icnotaxones (%),
  BI, ii e índices manuales; cada marca dentro del área de análisis se dibuja como triángulo sobre la imagen en su
  profundidad (o edad) y posición horizontal relativa, y una columna «Icnotaxones identificados» lista, por intervalo de
  análisis, los icnotaxones con marcas (intervalos consecutivos con el mismo conjunto se unen; nombres completos o
  abreviaturas si no caben). Fuera del modo, las marcas también aparecen si existen.
- **Abreviaturas** (`abbrevs`): 2 primeras letras (Ch, Pl, Th, Zo…); si coinciden, 1.ª + 3.ª letra, luego 3 y 4 letras.
- **Leyenda de icnotaxones** en la columna y en las figuras de sondeo: icnotaxones con trazas en la ventana (si la imagen
  muestra la bioturbación superpuesta o la columna de icnotaxones) y los marcados.
- **Figura «Secciones del sondeo»:** el mismo tramo [desde, hasta) en profundidad en varias versiones lado a lado:
  original, tratada, trazas coloreadas (opacas), trazas con transparencia (opacidad elegible), contornos, solo trazas en
  color sobre blanco, trazas en negro y flechas con abreviaturas (centroide de cada traza clasificada de área ≥ mínimo y
  marcas). Cada sección se dibuja en el estilo pedido reducida a ≤ 900 px de ancho y se remuestrea fila a fila (resolución
  ×2 del panel); paneles con letra (a, b, c…), eje de profundidad, nota del tramo y leyenda con abreviaturas. Opción de
  ocultar zonas excluidas.
- **Figura «Distribución de icnotaxones»** (`buildRangeSVG`): una columna por icnotaxón presente; barra de ancho
  proporcional a su porcentaje en cada intervalo dividido por su máximo en la ventana; en modo identificación,
  triángulos en los intervalos con marcas. Columna opcional de bioturbación (%).

### 22.7 Proyecto de entrenamiento, carteles de ayuda y recorrido guiado (desde V19)
- **Datos sintéticos** (`tools/make_tutorial.py`, semilla 2026; `examples/tutorial/`): 7 sondeos ficticios
  colocados al azar (±0,8°) alrededor de 7 zonas marinas del Mediterráneo; se rechazan posiciones en tierra con
  los polígonos de Natural Earth (prueba de punto en polígono). Tasa de sedimentación 12–30 cm/ka; modelo de
  edad de 6 puntos con tasa ±25 %; longitud = min(900, 40 · tasa) cm; muestreo cada 2 cm (TOC, CaCO3, SST,
  δ18O y bentónicos de bajo O2 cada 10 cm).
- **Señal común:** índice frío `c` (0 cálido – 1 frío): Holoceno 0,05; YD 0,75; B-A 0,3; HS1 0,95; LGM 0,85;
  HS2 1,0; HS3 0,95; resto 0,55. Capa orgánica `o` = 1 (este, lon > 15°, 6–10 ka) o 0,6 (oeste, 8–14 ka).
  Turbiditas (2–4 capas de 4–20 cm, `u`) y tefras (3,6 y 39 ka en Tirreno, Jónico y Egeo, 3 cm, `f`). Ruido
  normal ε. Ejemplos: Ti/Ca = 0,08 + 0,10c + 0,25u + 0,15f + ε(0,012); Ba/Ti = 0,6 + 2,2o − 0,2u + ε(0,08);
  TOC = 0,4 + (3,0 este | 1,5 oeste)·o·U(0,8–1,1) + ε(0,08); SST = (21 | 18) − 7c + ε(0,5); bioturbación =
  70 − 50o + ε(6). (Fórmulas completas en el script.)
- **Intervalos:** capa orgánica descrita solo en ENT-01, -03, -04 y -07 (el clasificador debe encontrarla en los
  otros tres); periodos climáticos; turbiditas y tefras en profundidad.
- **Imagen sintética** de ENT-03 (0–150 cm, 25 px/cm, 200 × 3750 px): matriz con ruido suavizado, banda oscura
  60–78 cm y 122 trazas oscuras dibujadas: *Thalassinoides* (tubos en Y), *Zoophycos* (lentes alargadas),
  *Planolites* (elipses pequeñas) y *Chondrites* (puntos, sobre todo en 50–90 cm). Detección: umbral global
  105, trazas oscuras, área mínima 12 px. Al crear el proyecto se etiqueta **una de cada dos** trazas
  verdaderas (el objeto que contiene su centro); el resto queda para las sugerencias.
- **Carteles de ayuda:** tarjeta fija abajo a la izquierda con el consejo de la pestaña actual (Bioturbación por
  subpestaña, Registro, Datos, Multiproxy por subpestaña, Figuras). Activos por defecto en el proyecto de
  entrenamiento (`settings.tips`); se activan o desactivan en Ayuda.
- **Recorrido guiado:** 25 pasos; cada uno cambia de pestaña si hace falta, resalta un elemento (marco y fondo
  oscurecido) y muestra una explicación con Anterior/Siguiente/Salir (también ← → Esc). Se inicia al abrir el
  proyecto de entrenamiento, desde Ayuda o desde un cartel (empieza en la parte correspondiente).

---

## 23. Referencias

- Casanova-Arenillas, S., Rodríguez-Tovar, F.J., Martínez-Ruiz, F. (2020). Applied ichnology in
  sedimentary geology: Python scripts as a method to automatize ichnofabric analysis in marine core
  images. *Computers & Geosciences* 136, 104407. https://doi.org/10.1016/j.cageo.2020.104407
- Dorador, J., Rodríguez-Tovar, F.J. (2014). Quantitative estimation of bioturbation based on
  digital image analysis. *Marine Geology* 349, 55–60.
- Dorador, J., Rodríguez-Tovar, F.J. (2018). High-resolution image treatment in ichnological core
  analysis: Initial steps, advances and prospects. *Earth-Science Reviews* 177, 226–237.
- Dorador, J., Rodríguez-Tovar, F.J., IODP Expedition 339 Scientists (2014). Digital image treatment
  applied to ichnological analysis of marine core sediments. *Facies* 60, 39–44.
  https://doi.org/10.1007/s10347-013-0383-z
- Droser, M.L., Bottjer, D.J. (1986). A semiquantitative field classification of ichnofabric.
  *Journal of Sedimentary Petrology* 56, 558–559.
- Gonzalez, R.C., Woods, R.E. (2018). *Digital Image Processing*, 4.ª ed. Pearson.
- Kikuchi, K., Naruse, H. (2024). Abundance of trace fossil *Phycosiphon incertum* in core sections
  measured using a convolutional neural network. *Sedimentary Geology* 461, 106570.
  https://doi.org/10.1016/j.sedgeo.2023.106570
- Hu, M.-K. (1962). Visual pattern recognition by moment invariants. *IRE Transactions on
  Information Theory* 8, 179–187.
- Martrat, B., et al. (2004). Abrupt temperature changes in the Western Mediterranean over the past
  250,000 years. *Science* 306, 1762–1765.
- Miguez-Salas, O., Dorador, J., Rodríguez-Tovar, F.J. (2019). Introducing Fiji and ICY image
  processing techniques in ichnological research as a tool for sedimentary basin analysis.
  *Marine Geology* 413, 1–9. https://doi.org/10.1016/j.margeo.2019.03.013
- Reineck, H.-E. (1963). Sedimentgefüge im Bereich der südlichen Nordsee. *Abhandlungen der
  Senckenbergischen Naturforschenden Gesellschaft* 505, 1–138.
- Rodríguez-Tovar, F.J., Miguez-Salas, O., Dorador, J. (2020). Image processing techniques to improve
  characterization of composite ichnofabrics. *Ichnos*. https://doi.org/10.1080/10420940.2020.1744579
- Serra, J. (1982). *Image Analysis and Mathematical Morphology*. Academic Press.
- Di Martino, A., Carlini, G., Castellani, G., Remondini, D., Amorosi, A. (2023). Sediment core
  analysis using artificial intelligence. *Scientific Reports* 13, 20409.
- Otsu, N. (1979). A threshold selection method from gray-level histograms. *IEEE Transactions on
  Systems, Man, and Cybernetics* 9, 62–66.
- Rodríguez-Tovar, F.J., Dorador, J. (2015). Ichnofabric characterization in cores: a method of
  digital image treatment. *Annales Societatis Geologorum Poloniae* 85. https://doi.org/10.14241/asgp.2015.010
- Zuiderveld, K. (1994). Contrast limited adaptive histogram equalization. En: Heckbert, P. (ed.),
  *Graphics Gems IV*, Academic Press, 474–485.
- Taylor, A.M., Goldring, R. (1993). Description and analysis of bioturbation and ichnofabric.
  *Journal of the Geological Society* 150, 141–148.

> Antes de enviar cualquier artículo, comprobar cada referencia con la publicación original.


### Edición de escalas y etiquetas (V0.11)

`log.js::verticalTicks` comparte las marcas verticales entre columna, secciones y distribución.
Las coordenadas de datos permanecen en la unidad original: la etiqueta muestra `v · yFactor`,
con `yFactor = UNIT_TO_CM[unidad original] / UNIT_TO_CM[unidad mostrada]` para profundidad.
`yStep` expresa la distancia entre marcas en la unidad mostrada y tiene prioridad sobre `yDiv`.
Desde V0.23: estilo de los intervalos SIN DATOS (`ndShow`, `ndFill` = rayado/liso/ninguno, `ndColor`, `ndLine`,
`ndLabel`, `ndText`, `ndImage` = también sobre las imágenes; `log.js::ND_STYLE, noDataGaps, noDataRect`), aplicado en
Columna, Rango y paneles de Secciones; tamaño y borde de los símbolos de trazas (`markSize`, `markStroke`,
`markStrokeW`). Columna: paneles de imagen como en Secciones (`logView.imgPanels`), con ancho en proporción real de la
foto por defecto (`style.imgAspect = 'keep'`: ancho = alto del gráfico / (alto/ancho del testigo), mediana de las
secciones; × `imgStretch`) o fijo (`imgW`). Flechas (`fig.arrowSrc` = todas / solo marcas a mano / solo trazas,
`arrowExcl` grupos excluidos, `objScale` tamaño de las de cada traza, `markScale`, `markStroke(W)`, `labelSize`,
`labelColor`, `labelHalo`), compartidas por Secciones y la Columna.
Desde V0.22, `yStep` son las marcas con número; `yMajor` añade marcas largas sin número y `yMinor` marcas cortas, en
la unidad mostrada (`log.js::extraTicks`; no se repiten donde ya hay una marca con número o larga). `yLabelLen` y
`yMinorLen` fijan la longitud en px (6 y 3 por defecto; las largas usan `yMajorLen`, 6). Multiproxy › Registros tiene
sus propias escalas (`geo.view.style`, `geo.view.colW`): ejes verticales y mínimo, máximo, divisiones, decimales,
invertir y logarítmica de cada registro.
El paso explícito se limita a 400 marcas para evitar bloquear el navegador.

`logView.style.axes[id]` admite `min`, `max`, `div`, `dec`, `rev`, `log` y `step`.
`step` tiene prioridad sobre `div` en ejes lineales. En logaritmos se dibujan potencias de diez;
los límites deben ser positivos y el máximo mayor que el mínimo. Si el mínimo automático no
es positivo, se propone máximo/1000. El trazado usa log10 y se recorta con un clipPath por pista;
los valores no positivos interrumpen las curvas de registros, sin conectarlas a través del hueco.
Estos ajustes solo afectan a la representación, no a las tablas de resultados ni a los índices.

El editor de etiquetas usa `logView.textEdits` para Columna y `fig.textEdits[tipo]` para Figuras.
Cada clave combina texto SVG original y número de aparición; el valor contiene texto opcional
y desplazamientos `x`, `y` en coordenadas SVG del padre. Se aplica una traslación antes de la
transformación original (incluidas rotaciones). El arrastre convierte coordenadas de pantalla
con la matriz inversa del padre. El proyecto conserva los ajustes y los SVG/PNG se exportan
con las modificaciones. Cambiar el contenido o el orden de las etiquetas puede requerir recolocarlas;
se recomienda ajustar escalas y contenido antes de la composición manual final.

Validación V0.11: 52 pruebas JavaScript y 10 Python superadas; comprobación con el ejemplo público
en navegador de unidades en metros, marcas cada 1 m, rango logarítmico 1–20 y edición de texto/posición.


### Símbolos de distribución e identificación (V0.12)

`fig.rangeDisplay` controla la distribución: `symbols` (predeterminado), `bars` o `both`.
En símbolos se representa una presencia por intervalo con `classPct[index] > 0` o con marcas
identificadas; si coinciden ambas fuentes en el mismo intervalo no se duplica el símbolo.
El símbolo se sitúa en el centro del tramo visible del intervalo. Solo se incluyen icnotaxones
presentes en la ventana. El modo barras conserva la abundancia relativa; cambiar la representación
no modifica los resultados ni los datos guardados.

Cada clase admite `symbol`: `triDown` (predeterminado compatible con proyectos anteriores),
`tri`, `circle`, `square`, `diamond`, `star` o `cross`. `log.js::traceSymbolPath` comparte la geometría
entre SVG y el lienzo de marcas de identificación. La selección se guarda en `classes` y se aplica
a distribución, marcas identificadas de la imagen/columna y leyendas de la columna. Los indicadores
de la figura de secciones conservan su selector de estilo propio.

Validación V0.12: 54 pruebas JavaScript y 10 Python superadas; comprobación de distribución
solo con símbolos y cambio de triángulos a círculos en navegador con el ejemplo público.
