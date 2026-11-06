# Guía: qué hace el aprendizaje automático en SedCoreTool (V0.17)

Explicación en lenguaje sencillo, para el autor y para quien lea los artículos. Los detalles con fórmulas
están en `docs/DOCUMENTACION_TECNICA.md` (§7.5, §10 y §10.6 quater). Qué se puede afirmar en cada artículo
está en `METODOS_Y_DEFENSA.md`.

## 1. Las dos preguntas que responde el programa

Ante una foto de un testigo hay dos tareas distintas:

1. **¿Dónde hay trazas?** → *segmentación*: marcar, píxel a píxel, qué es bioturbación y qué es matriz.
   De aquí salen el % de bioturbación, el BI y el ii.
2. **¿Qué traza es cada una?** → *clasificación*: poner nombre (icnotaxón) a cada traza ya marcada.

Hasta la V0.14 solo la segunda tarea aprendía de ejemplos. La primera usaba reglas fijas de brillo
(umbral), que fallan cuando la traza y la matriz tienen un tono parecido.

## 2. Encontrar las trazas: la U-Net

**Qué es.** Una red neuronal con forma de «U». En la bajada reduce la imagen para entender *qué* hay
(texturas, formas). En la subida la vuelve a ampliar para decidir *dónde* está, píxel a píxel. Para cada
píxel da una probabilidad de ser traza, entre 0 y 1.

**Cómo aprende (entrenamiento).**
1. Le damos ejemplos: la foto y la máscara que pinta el experto en SedCoreTool.
2. Las fotos se pasan a la misma escala (píxeles por centímetro) y se cortan en cuadrados de 512 px.
3. La red dibuja su máscara, se compara con la del experto y se corrige un poco. Cada vuelta completa a
   todos los cuadrados es una *época*.
4. En cada vuelta los cuadrados se voltean y se cambia algo el brillo y el contraste, para que la red no
   memorice las fotos. **No se giran 90°**: la orientación de la traza respecto a la estratificación ayuda
   a identificarla.
5. La red no parte de cero: empieza desde una que ya sabe ver bordes y texturas (ResNet-34, entrenada con
   ImageNet). Por eso basta con pocos testigos.
6. Tras cada época se mide el acierto en testigos de *validación*. Cuando deja de mejorar, se para.

**Qué significa «ignorar» (valor 255).** Las zonas excluidas (grietas, huecos) y las trazas que el experto
no ha revisado no se usan ni como traza ni como matriz. Una traza sin revisar no es un ejemplo fiable de
«matriz»; usarla así enseñaría a la red a no verla.

**Dónde se entrena.**
- *Programa de escritorio (V0.17):* botón «Entrenar en este ordenador…» en Detección → U-Net. Usa la
  tarjeta gráfica del ordenador (NVIDIA o Apple; si no hay, el procesador, mucho más despacio). La primera
  vez instala un módulo de 2–3 GB. Se puede detener y reanudar.
- *Fuera del programa:* exportar «Datos para entrenar U-Net (ZIP)» y usar `sedcoretool unet train`.

**Cómo se usa.** Detección → método «U-Net» → la red propone; el experto corrige lo que falle. Las zonas
dudosas (probabilidad entre 0,3 y 0,7) se pueden ver en magenta para revisar solo eso.

## 3. Nombrar las trazas: el clasificador de icnotaxones

**Cómo funciona.** El experto clasifica algunas trazas; el programa sugiere el nombre de las demás según
a cuáles se parecen más (k vecinos más cercanos, k-NN; también Random Forest o Bayes). Si una traza no se
parece a nada conocido, no sugiere nada (filtro de novedad).

**Qué mira para decidir el parecido — dos opciones (V0.17):**
- **Forma y color (12 rasgos):** área, largo, ancho, alargamiento, verticalidad, compacidad, color y
  contraste. Rápido y fácil de explicar, pero no ve la textura interna ni el borde.
- **Modelo de visión (DINOv2):** una red ya entrenada con 142 millones de imágenes mira el recorte de cada
  traza (con un poco de sedimento alrededor) y lo resume en 384 números. El k-NN aprende de esos números.
  **Esta red no se entrena en SedCoreTool**: solo se usa como «ojo» que describe la imagen; lo que aprende
  de tus ejemplos sigue siendo el k-NN. Por eso funciona con pocos ejemplos y sin tarjeta gráfica.

Las dos opciones no se mezclan: un modelo hecho con un tipo de rasgos no se aplica al otro.

## 4. Cómo sabemos si funciona (validación)

- **Sondeos independientes.** Algunos sondeos se apartan como *prueba* antes de entrenar y no se tocan hasta
  el final. Medir el acierto en trozos del mismo sondeo que se usó para aprender da resultados inflados,
  porque las zonas vecinas se parecen.
- **Medidas de la segmentación:** Dice e IoU (0 = nada coincide, 1 = igual que el experto), error en el %
  de bioturbación por intervalo y coincidencia de BI e ii.
- **Medidas de la clasificación:** acierto equilibrado (media del acierto de cada icnotaxón) y matriz de
  confusión.
- **Comparaciones:** con los métodos clásicos (umbral, flujo Fiji/ICY, Dorador et al., 2014) y con la
  concordancia entre dos expertos, que es el techo razonable.

## 5. Qué está hecho y qué falta (05-11-2026)

| | Hecho | Falta |
|---|---|---|
| U-Net | Exportar datos, entrenar (programa de escritorio o Python), evaluar, usar en el programa | Anotar testigos reales y entrenar; ningún resultado todavía |
| Icnotaxones | 12 rasgos o modelo de visión; k-NN, RF, Bayes; evaluación por imagen | Comparar ambos rasgos en testigos independientes |
| Validación | Código de métricas y división por sondeo | Protocolo de anotación, segundo experto, métodos clásicos en Python |

## 6. Palabras clave

- **Época:** una vuelta completa por todos los ejemplos de entrenamiento.
- **Validación / prueba:** testigos para decidir cuándo parar / para medir el resultado final.
- **Dice:** coincidencia entre dos máscaras (0–1).
- **Preentrenado:** red que ya aprendió con otras imágenes y se reutiliza.
- **Vector o *embedding*:** lista de números con que una red resume una imagen.
- **ONNX:** formato de archivo para guardar redes y ejecutarlas en cualquier programa.
