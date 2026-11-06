# Métodos y defensa ante revisores

Estado al 01-11-2026 (software en la entrega **V28**, aplicación web 2.0.1). Cartera completa en
[README.md](README.md).

## Lo que hay que saber del software antes de escribir cualquier artículo
- **Nombre:** desde V16 el programa se llama **CorAnTool** (antes IchAnTool). En los artículos: «CorAnTool (formerly
  IchAnTool; Casanova-Arenillas et al., 2020)». Citar la entrega usada (p. ej. «V28») y, al enviar, la release con DOI.
- **Icnotaxones (imágenes):** tres modelos (sondeo, proyecto, todos los proyectos; §10.6 bis) y tres métodos (k-NN,
  bosque aleatorio, Bayes ingenuo; §10.6 ter). Desde V22 la evaluación agrupa por imagen (sección) y cuenta como error
  cualquier predicción de un taxón ausente del conjunto de prueba. Hay que decir qué modelo y método se usó y su acierto
  equilibrado. Las «probabilidades» de RF, NB y k-NN son proporciones de voto o verosimilitudes normalizadas, no
  probabilidades calibradas.
- **Multiproxy (V26–V27):** familias de intervalos (p. ej. periodo frío/cálido; baja oxigenación con sapropel/ORL)
  que se clasifican a mano en cualquier sondeo, y **clasificadores definidos por el usuario** (qué familias, con qué
  variables y familias de entrada, qué modelo: bosque aleatorio, red neuronal MLP, k-NN, Bayes, k-medias), validados
  dejando un sondeo fuera (§21.4–§21.5). Solo se puntúan intervalos descritos, no los etiquetados por reglas. Desde
  V0.37 las familias madre e hijas de la familia objetivo se excluyen de las entradas y el escalado global se ajusta
  en cada pliegue con el entrenamiento.
- **Icnotaxones (V0.37):** la evaluación deja fuera secciones (o sondeos, a elegir) enteras: pliegues agrupados con
  ≥ 5 grupos, un grupo cada vez con 2–4 y, con uno solo, trazas sueltas con aviso de acierto muy optimista. El acierto
  mostrado es el de la evaluación que elige el método, así que es optimista hasta medirlo en un sondeo reservado.
- **Prueba final (V0.49):** los sondeos marcados como reservados no entrenan ni intervienen al elegir el modelo (en
  icnotaxones ni en multiproxy) y se usan una sola vez para el acierto final; cada repetición queda registrada con
  fecha y modelo, de modo que el artículo puede declarar cuántas veces se miró el conjunto reservado.
- **Selección de modelo:** comparar varios clasificadores con la misma validación y quedarse con el mejor **sesga el
  acierto al alza**. Un artículo debe informar de todos los modelos probados o reservar sondeos para una prueba final
  independiente (pendiente de implementar en la interfaz).
- **Sondeos compartidos entre proyectos (V23):** cuentan una sola vez en mapas y análisis entre proyectos, y los
  ejemplos de icnotaxones repetidos se descartan. La coincidencia es por nombre: revisar los marcados «en N proyectos».
- **Mapas:** los valores usan solo datos reales; la interpolación (IDW, kriging, TIN, RBF…; §21.6 ter) mide distancias
  en km y es exploratoria. Los mapas de z por sondeo eliminan el gradiente absoluto entre sondeos: úsense para patrones
  relativos. Los fondos (Esri, GEBCO) son contexto visual y se citan en el pie.
- **Modo identificación (V32):** registra presencia de icnotaxones (marcas puntuales), no abundancia: con él no se pueden
  dar porcentajes, BI ni ii, solo distribución de presencias por intervalo. Indicar en los métodos qué tramos se
  analizaron en este modo.
- **Figuras de secciones (V32):** paneles original / tratada / trazas resaltadas / flechas, al estilo de Dorador y
  Rodríguez-Tovar; las trazas resaltadas son las clasificadas en el programa (incluidas las predicciones aceptadas si así
  está configurado), lo que debe constar en el pie.
- **Datos editados a mano (V0.35):** los valores cambiados en la hoja de Datos se guardan con el original y la fecha y
  se listan en el CSV; hay que declararlos si se usan. Las columnas calculadas interpolan linealmente las columnas
  usadas a cada profundidad cuando se midieron a profundidades distintas.
- **Modelo de edad (V0.28):** se puede importar un modelo de Bacon (mediana o media e intervalo del 95 %); el
  programa no ejecuta Bacon ni propaga las iteraciones del MCMC. Las edades por intervalo se interpolan linealmente
  sobre la tabla de Bacon; citar Bacon (Blaauw y Christen, 2011) y la curva de calibración usada.
- **Elección del realce (V0.28):** con trazas identificadas, el criterio es la separación (2·AUC − 1) entre esas trazas
  y la matriz; si las mismas trazas se usan después para evaluar la detección, la evaluación es optimista: elegir el
  ajuste con unas secciones y evaluar con otras. Sin trazas identificadas (V0.37) la puntuación es el cociente de
  Fisher en el umbral de Otsu multiplicado por la coherencia espacial κ de la separación, de modo que el ruido sin
  estructura puntúa ≈ 0 con cualquier realce; no es un método publicado y se presenta como propuesta inicial.
- **Trazas solapadas (V0.20):** una traza puede estar dentro de otra. La bioturbación total cuenta el solape una vez
  (≤ 100 %), pero cada icnotaxón cuenta su superficie completa, así que la suma de los porcentajes por icnotaxón puede
  superar al total (y a 100 %). Hay que decirlo en los métodos y no presentar los porcentajes por icnotaxón como
  partes de un todo. Antes de V0.20 cada píxel tenía una sola traza (la última dibujada).
- **Datos privados del autor:** LC06, LC14 y LC20 tienen profundidad supuesta (secciones apiladas, §21.8 ter): no usarlos en
  una figura publicada sin verificarla. Las cifras obtenidas con versiones anteriores a V22 deben recalcularse.

Para cada artículo previsto: qué partes de IchAnTool usa, qué se puede afirmar con lo que ya está
hecho, qué falta comprobar antes de enviarlo y las preguntas que probablemente hará un revisor,
con una respuesta preparada.

Los detalles de cada algoritmo (fórmulas, parámetros, archivos de código) están en
[`docs/DOCUMENTACION_TECNICA.md`](../docs/DOCUMENTACION_TECNICA.md). Aquí se cita la sección (§).
El historial de cambios está en [`docs/HISTORIAL_VERSIONES.md`](../docs/HISTORIAL_VERSIONES.md).

Regla general: **solo se afirma lo que está medido**. Lo que no está validado se presenta como
limitación o trabajo futuro.

---

## Artículo 1 — Software: CorAnTool (JOSS)

### Qué describe
El paquete Python y la aplicación web como herramienta abierta de análisis de sondeos: series continuas de
bioturbación a partir de imágenes, junto con registros multiproxy, intervalos descritos, clasificación automática de
intervalos, mapas por edad y figuras, organizado en proyectos.

### Métodos que usa
| Método | § |
|--------|---|
| Escala de profundidad y zona de análisis | §2 |
| Porcentaje por intervalos, multiclase y exclusiones | §3, §8 |
| BI e ii (tramos de la V2, configurables) | §4 |
| Modelo de edad (interpolación lineal) | §5 |
| Realce, detección y edición (aplicación web) | §6–§8 |
| Identificación asistida k-NN (aplicación web) | §10 |
| Formatos de exportación | §12 |
| Resolución de trabajo, proyectos | §16–§17 |
| Registro compuesto y registros externos | §18–§19 |
| Herramienta multiproxy: familias, clasificadores (RF, MLP, k-NN, NB), validación | §21–§21.5 |
| Mapas: proyecciones, interpolación (IDW, kriging, TIN, RBF…), exportación | §21.6–§21.6 quater |
| Gráficos de datos (tipo Grapher) y hoja de cálculo | §22.3 bis |
| Organización por proyectos y sondeos, análisis entre proyectos, figuras | §22 |
| Proyecto de entrenamiento y recorrido guiado | §22.7 |

### Qué se puede afirmar hoy
- Integra en una sola herramienta las imágenes, la bioturbación y otros registros del mismo sondeo, en profundidad o en edad, con exportación vectorial (§18). Demostrado con datos públicos del IODP (sondeo de prueba U1385I-1H).
- Reproduce exactamente los resultados publicados en 2020 (prueba de regresión, §13.1).
- La aplicación web da los mismos BI e ii que la versión publicada en la imagen de ejemplo
  (100 %). Con la misma máscara la reproduce exactamente; con el decodificador JPEG del navegador el porcentaje
  difiere ≤ 0,56 puntos (media 0,13) por cómo se reconstruyen los bordes de las manchas, no por los pesos de gris
  (corregido en V0.49, §3.4, §13.2). Desde V0.49 las dos comparaciones son pruebas automáticas.
- Es determinista y el archivo de proyecto permite reproducir cualquier análisis (§15).
- Tiene pruebas automáticas en integración continua (§13.1).
- Integra en el mismo proyecto la interpretación icnológica, registros numéricos de cualquier tipo,
  intervalos descritos jerárquicos y una clasificación automática de intervalos (§21). Sobre esta parte solo puede afirmarse que funciona
  como herramienta; su capacidad de detectar eventos reales no está validada (ver artículo 4).

### Qué falta antes de enviarlo
- [ ] Publicar en PyPI y crear la release con DOI en Zenodo.
- [ ] Documentación de uso (tutorial con un testigo real) y notebook de ejemplo.
- [ ] Capa de exclusión también en el paquete Python, para igualar las dos implementaciones.
- [ ] Alojar la aplicación en GitHub Pages.
- [ ] Decidir la licencia definitiva.
- [ ] Revisar la bibliografía.
- [ ] Dividir `app.js` en módulos (los revisores de JOSS miran la calidad del código).
- [ ] Decidir el alcance: un único artículo de software con todo, o dejar la parte multiproxy para el artículo 4.

### Preguntas probables de revisores (JOSS revisa también el código)
**¿Qué aporta frente a ImageJ/Fiji, que ya cuenta píxeles?**
ImageJ da un área total. IchAnTool da una **serie continua por profundidad o edad** con BI, ii y
porcentaje por icnotaxón, lista para correlacionar con datos geoquímicos. Gestiona varias secciones,
zonas excluidas y modelo de edad en un solo flujo. Ese flujo en ImageJ requiere macros propias.

**¿Cómo sé que los resultados son correctos?**
Pruebas con casos calculados a mano y prueba de regresión frente a los resultados publicados
(§13.1). Ambas se ejecutan automáticamente en cada cambio.

**¿Cómo se eligen los parámetros de realce?**
Con los ajustes publicados (Dorador et al., 2014; Miguez-Salas et al., 2019) o con la propuesta
automática (§6: separación de las trazas identificadas o, sin ellas, Fisher × coherencia espacial; antes de V0.28,
separabilidad de Otsu), que es propia y se presenta como punto de partida. No hay
en la bibliografía un método publicado de preselección automática (revisión V12).

**¿Los ajustes «de artículo» reproducen fielmente los protocolos publicados?**
Reproducen la secuencia y los parámetros publicados donde existen (§6). Las diferencias están
documentadas: los niveles se calculan por percentiles porque el artículo los elige en cada imagen; la
gamma es automática dentro del rango publicado; el contraste y el brillo de Photoshop solo tienen
equivalentes aproximados; y el CLAHE es por mosaicos (Zuiderveld, 1994) frente a la ventana deslizante
de Fiji. Los parámetros efectivos de cada sección se guardan en el proyecto.

**¿Por qué dos implementaciones (Python y JavaScript)?**
Python para análisis por lotes y reproducibilidad en scripts. Web para el trabajo interactivo sin
instalar nada. Comparten las mismas definiciones y las pruebas comprueban los mismos casos en las
dos (§1, §13.1).

**¿Por qué BI e ii salen solo del porcentaje?**
Es la componente cuantificable de esas escalas. Se documenta que no sustituye la descripción
completa del icnofábrica, y la aplicación guarda el índice manual del usuario (§4.3).

---

## Artículo 2 — Conjunto de datos anotado y segmentación automática

### Qué describirá
Un conjunto abierto de imágenes de testigos con máscaras de bioturbación (y de icnotaxones),
anotado con la aplicación web, y la evaluación de métodos automáticos de detección e
identificación.

### Métodos que usa
| Método | § |
|--------|---|
| Herramientas de anotación (varita, pincel, lazo, exclusión) | §8 |
| Detección clásica: umbral adaptativo + morfología (método base) | §7 |
| Descriptores de objeto | §9 |
| k-NN con rechazo de novedad (método base de identificación) | §10 |
| Rasgos de un modelo de visión preentrenado (DINOv2) como entrada del clasificador (**V0.17, sin evaluar con datos reales**) | §10.6 quater |
| Entrenamiento de la U-Net en el programa de escritorio (mismo código que `ichantool unet`) | §7.5 |
| Segmentación aprendida U-Net: exportación de datos, entrenamiento, evaluación y uso en la aplicación (**implementada en V0.15, sin entrenar con datos reales**) | §7.5 |
| Formato de máscara y paleta | §12 |

### Qué se puede afirmar hoy
Nada sobre la precisión en datos reales: todavía no hay datos anotados. Solo que las herramientas
existen y producen máscaras en un formato abierto.

- Desde V0.15 el flujo U-Net completo existe y está probado con datos sintéticos: exportación de
  imágenes y máscaras con píxeles «ignorar» (zonas excluidas y trazas sin revisar), teselado y
  división por sondeo, entrenamiento, evaluación sobre imágenes completas de sondeos independientes
  y ejecución en la aplicación. Las reglas de teselado, normalización, unión y reescalado son
  idénticas en Python y en la aplicación (prueba de paridad). **No hay ningún resultado de
  segmentación con testigos reales**: no se puede citar ningún Dice ni IoU hasta entrenar y evaluar.
- Desde V0.17 el clasificador de icnotaxones puede usar, en vez de los 12 descriptores, el vector de 384
  valores de un modelo de visión preentrenado (DINOv2). Se puede afirmar que la opción existe y cómo se
  calcula; **no** que mejore la identificación hasta compararla en testigos independientes.
  Desde V0.45 la descarga predeterminada fija el commit de DINOv2 y el SHA-256 de sus pesos ONNX
  (documentación técnica §10.6 quater); esto identifica los pesos para reproducibilidad, sin aportar
  una evaluación de su precisión.
  En V0.48 se comprobó la inferencia del modelo real con ONNX Runtime Web dentro de Electron y una entrada
  sintética: 384 valores finitos, norma del vector redondeado ≈ 0,999998555, SHA-256 coincidente.
  Es una comprobación técnica de ejecución, sin medida de precisión ni comparación con testigos reales.
- Desde V0.17 la U-Net se puede entrenar desde el programa de escritorio. Es el mismo código que la línea de
  órdenes (mismas teselas, pérdida, aumentos y evaluación), así que los resultados son comparables; los
  modelos guardan sondeos de cada conjunto, semilla e historial.
- Decisiones defendibles ya fijadas en el código: entrada sin realce, resolución común en px/cm,
  sin giros de 90° en los aumentos, trazas sin revisar ignoradas (no tratadas como matriz),
  métricas sobre imágenes completas y no sobre teselas.

- La identificación asistida de icnotaxones ya tiene evaluación por imagen (V22); falta medirla en testigos
  independientes anotados por expertos.

### Experimentos necesarios
1. **Datos:** testigos con imágenes de licencia clara (IODP/ODP son públicas; las imágenes tratadas
   del grupo de la UGR, con permiso). Anotar la resolución y el equipo de cada imagen.
2. **Protocolo de anotación escrito**, con criterios de qué es traza, qué es artefacto y qué se
   excluye.
3. **Concordancia entre anotadores:** al menos dos expertos anotan el mismo subconjunto. Se mide
   IoU (intersección sobre unión) y la diferencia de porcentaje por intervalo.
4. **División por testigo**, no por recortes: los testigos de prueba no se usan para entrenar ni
   para ajustar parámetros. Evita resultados inflados por autocorrelación espacial.
5. **Métricas:**
   - IoU y F1 por píxel.
   - Error absoluto del porcentaje por intervalo.
   - Coincidencia de BI e ii.
   - Para la identificación: matriz de confusión y F1 por clase.
6. **Comparaciones:**
   - umbral adaptativo (método base);
   - flujo Fiji/ICY de Miguez-Salas et al. (2019): CLAHE + umbral o K-medias + rellenar huecos, ya implementado;
   - tratamiento de Dorador et al. (2014), ya implementado;
   - U-Net, comparable con Kikuchi y Naruse (2024, Dice 0,892 para *Phycosiphon*);
   - concordancia entre humanos, que es el techo razonable.

### Preguntas probables de revisores
**¿Por qué un umbral adaptativo como base y no directamente deep learning?**
Porque es reproducible, no necesita datos de entrenamiento y marca el nivel mínimo que un método
aprendido debe superar. Se compara con U-Net en el mismo conjunto de prueba.

**¿Por qué se ignoran las trazas no revisadas en vez de contarlas como matriz?**
Porque una traza que el experto no ha confirmado no es un negativo fiable. Tratarla como matriz
enseñaría a la red a no detectar trazas reales; ignorarla solo reduce los píxeles de entrenamiento.
Las clases que no cuentan (artefactos) sí son matriz: el experto las ha revisado.

**¿Por qué no se gira la imagen 90° para aumentar datos?**
La orientación de las trazas respecto a la estratificación (vertical, horizontal, oblicua) es un
criterio de identificación. Solo se voltea (horizontal y vertical) y se varían brillo, contraste y gamma.

**¿Por qué usar un modelo de visión entrenado con fotos generales y no uno propio?**
Porque con pocos ejemplos por icnotaxón no se puede entrenar una red de clasificación fiable. Los modelos
autosupervisados como DINOv2 dan descriptores genéricos de forma y textura que funcionan bien con k-NN y
pocos ejemplos. La red no se ajusta a nuestros datos (no hay riesgo de sobreajuste en ella); solo el k-NN
aprende. Se compara con los 12 descriptores en el mismo conjunto de prueba; si no mejora, se dice.

**¿Un modelo reanudado tras una interrupción es equivalente?**
Continúa desde el último punto guardado (red, optimizador, época, mejor resultado). No es idéntico bit a bit
a uno sin interrupción (el orden aleatorio de los aumentos no se guarda). Para el artículo se entrenan los
modelos de una vez y con tres semillas.

**¿El acierto del k-NN no está inflado?**
El acierto dejando uno fuera que muestra la aplicación sí puede estarlo (§10, nota al revisor).
En el artículo solo se dará el acierto en **testigos independientes**.

**¿Qué pasa con la dependencia del color y de la cámara?**
Se documentan el equipo y la iluminación de cada imagen y se evalúa el rendimiento entre fuentes
distintas (entrenar con unas, probar con otras). Los descriptores de tamaño van en unidades
físicas (§9).

**¿Hay trabajos previos con deep learning en bioturbación?**
Sí. Hay que revisarlos y citarlos: el artículo de *Applied Sciences* 11(16):7736 (2021) sobre deep
learning en análisis icnológico y la patente US12142024. La aportación propia es el **conjunto de
datos abierto**, la herramienta de anotación libre y la comparación con concordancia humana.

---

## Artículo 3 — Validación y aplicación paleoambiental

### Qué describirá
1. Cuánto difieren los índices automáticos de la estimación visual de varios icnólogos.
2. Registros continuos de bioturbación y de icnotaxones en testigos largos, correlacionados con
   indicadores geoquímicos y de temperatura (amplía el ejemplo de ODP 977 de 2020).

### Métodos que usa
| Método | § |
|--------|---|
| Porcentaje, BI e ii automáticos | §3–§4 |
| BI e ii manuales en la aplicación | §4.3 |
| Porcentaje por icnotaxón e identificación asistida | §3, §10–§11 |
| Modelo de edad | §5 |
| Registro compuesto, registros externos y CSV interpolado | §18–§19 |

### Experimentos necesarios
0. **Modelo de edad publicado:** el del sondeo de prueba es ilustrativo y no vale para interpretar.
1. **Experimento a ciegas:** de 3 a 5 icnólogos asignan BI e ii visuales a los mismos intervalos,
   sin ver el resultado automático. La aplicación ya permite registrarlo (columnas `BI_manual` e
   `ii_manual`).
2. **Estadística:**
   - Concordancia entre observadores (kappa de Cohen ponderado o coeficiente de correlación
     intraclase).
   - Sesgo de cada observador frente al valor automático.
   - Diagrama de Bland-Altman para el porcentaje.
3. **Aplicación:**
   - Elegir testigos con buenas imágenes y datos de indicadores ya publicados (material de la
     datos privados).
   - Correlación con desfase y prueba de significación que tenga en cuenta la autocorrelación de
     las series.

### Preguntas probables de revisores
**Si los observadores no coinciden entre sí, ¿con qué se valida el método?**
No se trata de que la máquina «acierte» a un experto. Se mide cuánta variabilidad hay entre
expertos y si el método automático cae dentro de ella, con la ventaja de ser reproducible.

**¿Una medida 2D de la cara del testigo representa la bioturbación?**
Es la misma limitación de las estimaciones visuales, que también se hacen sobre la cara expuesta.
Se indica como limitación (§14) y se mantiene la comparación en las mismas condiciones.

**¿Cómo afecta la incertidumbre del modelo de edad a las correlaciones?**
Se discute aparte. Si hace falta, se repite el análisis con modelos de edad alternativos. El
programa no propaga esa incertidumbre (§5).

---

## Artículo 4 — Clasificación automática de intervalos con registros multiproxy, descripciones e icnología

### Qué describirá
Un método reproducible para etiquetar intervalos (eventos como baja oxigenación, aporte detrítico o
corrientes de fondo, pero también litologías o facies) en muchos sondeos a partir de registros
numéricos (geoquímica, foraminíferos, TOC, sedimentología…) y de intervalos descritos (litología,
turbiditas…), combinando el criterio experto
(intervalos y reglas) con aprendizaje supervisado, y su cartografía por ventanas de edad. Incluye
la icnología (bioturbación, BI, ii, icnotaxones) como variables.

### Métodos que usa
| Método | § |
|--------|---|
| Importación, remuestreo, razones, log y escalado | §21.1–§21.2 |
| Capas de intervalos jerárquicas como variables (0/1) | §21.2–§21.3 |
| Etiquetas por intervalos y reglas | §21.3 |
| Clasificadores definidos por el usuario (familias objetivo, entradas, modelo) | §21.4 ter |
| Bosque aleatorio, red neuronal (MLP), k-NN, Bayes ingenuo, k-medias | §21.4, §21.4 bis |
| Clasificación manual en columnas y copia desde columnas automáticas | §21.4 ter |
| Validación dejando un sondeo fuera | §21.5 |
| Mapas por edad e IDW | §21.6 |
| Bioturbación e índices como variables | §3–§4, §18, §21.1 |

### Qué se puede afirmar hoy
- La implementación funciona y es reproducible (semilla) con datos sintéticos de verdad conocida
  (§21.8).
- Primera prueba con datos reales (§21.8 bis): con registros públicos de ODP 977A, los tipos de ORL
  privados se reconocen mal (acierto equilibrado 36 % por bloques). No se puede afirmar
  capacidad predictiva; faltan los datos geoquímicos propios (XRF) y más sondeos etiquetados.
- Con los datos propios (V12, §21.8 ter): acierto equilibrado 17,7 % dejando un sondeo fuera con 7
  clases. La transferencia entre sondeos con variables y escáneres distintos es el problema principal
  que un artículo tendría que resolver (armonizar variables, más sondeos por tipo de variable).
- V26 (misma datos privados): el clasificador creado desde los ajustes guardados da 18 % de acierto equilibrado, coherente con
  la cifra anterior. En el proyecto sintético de entrenamiento, bosque aleatorio ≈ 91 % y red neuronal ≈ 80 %
  (verdad conocida; solo demuestra que la cadena funciona).

### Experimentos necesarios
1. **Datos reales con interpretación independiente:** sondeos con eventos publicados (p. ej.
   sapropeles datados, contornitas, niveles detríticos) que no hayan servido para definir las
   reglas.
2. **Etiquetas solo por intervalos** para entrenar y evaluar. Las reglas se evalúan aparte, como
   «modelo experto», frente a la misma verdad.
3. **Validación dejando sondeos enteros fuera** y, si hay suficientes, por regiones (bloques
   espaciales), para medir la transferencia a sondeos lejanos.
4. **Métricas:** acierto equilibrado, F1 por clase y matriz de confusión; incertidumbre por
   remuestreo de sondeos (bootstrap por sondeo).
5. **Comparaciones:** reglas expertas solas; bosque aleatorio; red neuronal; k-NN; Bayes; y el efecto de añadir
   la icnología (con y sin bioturbación/índices) y las capas descritas (con y sin litología) como
   variables. Vigilar que una capa descrita no sea casi la misma información que el objetivo
   (fuga de información), y declarar qué capas se usaron.
6. **Importancia por permutación** (por implementar) además de MDI.
7. **Sensibilidad** al paso de remuestreo, al escalado (global frente a por sondeo) y a la
   probabilidad mínima.
8. **Modelos de edad:** repetir los mapas con modelos alternativos o con la incertidumbre
   publicada de cada sondeo.
9. **Prueba final independiente:** reservar 2–3 sondeos que no se usan para elegir modelo ni ajustes, y dar en el
   artículo el acierto en ellos.

### Preguntas probables de revisores
**¿El acierto no está inflado por la autocorrelación de las series?**
Lo limita: la validación deja sondeos enteros fuera o, si solo hay uno, bloques contiguos con un margen (desde V0.37,
el 5 % del intervalo etiquetado a cada lado del bloque de prueba se quita del entrenamiento). Desde V0.37 el escalado
global se recalcula en cada pliegue solo con el entrenamiento y una familia objetivo nunca usa como entrada a sus
familias madre ni hijas (p. ej. «sapropel» no usa «baja oxigenación»). Con un único sondeo la autocorrelación más
allá del margen sigue pudiendo inflar el acierto; con el escalado por sondeo, cada sondeo de prueba se tipifica con
sus propias medias (sin usar etiquetas). Lo fiable es el acierto en sondeos reservados (§21.5).

**Si las etiquetas salen de reglas, ¿el modelo no aprende solo las reglas?**
Sí, y así se declara (§21.8). Para la evaluación se usan intervalos con interpretación
independiente; las reglas solo sirven para proponer etiquetas o como referencia experta.

**¿Por qué no deep learning?**
El programa incluye una red neuronal (perceptrón multicapa con parada temprana, §21.4 bis) y se compara con el bosque
aleatorio, k-NN y Bayes en el mismo esquema de validación. Con pocas decenas o cientos de intervalos etiquetados, los
árboles suelen ser más robustos y dan una medida de importancia; redes más profundas (recurrentes, convolucionales
sobre la serie) necesitarían muchos más sondeos etiquetados de los disponibles.

**Probasteis varios modelos: ¿no estáis eligiendo el que mejor sale por azar?**
Se informa de todos los modelos probados con la misma validación y el acierto final se da en sondeos reservados que no
intervinieron en la elección (experimento 9).

**¿La interpolación del mapa es fiable?**
La interpolación es visual y exploratoria (§21.6, §21.6 ter): ningún método estima la incertidumbre
de forma útil con pocos sondeos (el kriging da una varianza, pero su variograma con ~10 sondeos es muy incierto) y
ninguno tiene en cuenta barreras geográficas. Las conclusiones se basan en los valores de cada sondeo, que también se exportan.
Los fondos de los mapas (Esri, GEBCO; §21.6 bis) son solo contexto visual: no entran en ningún
cálculo, y su fuente debe citarse en el pie de la figura (el programa la escribe en el mapa).

**¿Cómo entran datos categóricos como la litología en un modelo numérico?**
Como columnas 0/1 por categoría, sin escalar (§21.2). La ausencia de descripción vale 0, igual que
«no presente»; se declara como limitación y conviene usar solo sondeos con la capa descrita entera.

**¿Cómo se combinan proxies medidos con técnicas o calibraciones distintas?**
Con el z-score por sondeo (§21.2) se eliminan diferencias de nivel; se documenta qué escalado se
usó y se muestra su efecto (experimento 7).

---

## Artículo 5 — Nota breve en español (Geogaceta)

### Qué describirá
Presentación de CorAnTool a la comunidad geológica española: qué hace, para quién es y un ejemplo con un testigo de
datos públicos (IODP U1385I-1H, margen ibérico) y el proyecto de entrenamiento. Sin resultados inéditos.

### Qué se puede afirmar hoy
Lo mismo que en el artículo 1 (funcionalidad y reproducibilidad), sin cifras de validación nuevas.

### Qué falta
- [ ] Release con DOI y aplicación accesible en línea (GitHub Pages).
- [ ] Figura: imagen tratada + columna compuesta + mapa de ejemplo.
- [ ] Comprobar formato y extensión en las normas de la revista.

### Preguntas probables de revisores
**¿Qué aporta frente a hacerlo a mano en Photoshop/ImageJ y una hoja de cálculo?**
Un flujo único, reproducible y gratuito desde la imagen hasta series, mapas y figuras, con el proyecto guardado para
repetir el análisis.

---

## Lista de comprobación antes de enviar cualquier artículo
- [ ] Cada método citado en el texto tiene su sección en `DOCUMENTACION_TECNICA.md`, y coincide con
      el código de la versión citada.
- [ ] Versión del software citada con DOI de Zenodo.
- [ ] Parámetros usados guardados (archivo de proyecto) y publicados como material suplementario.
- [ ] Datos y máscaras depositados (Zenodo o PANGAEA) con licencia.
- [ ] Limitaciones declaradas (§14).
- [ ] Referencias comprobadas contra los originales.
- [ ] Coautorías y agradecimientos acordados.
