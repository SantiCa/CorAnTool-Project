# Auditoría del programa (V0.14, 05-11-2026)

Revisión completa de CorAnTool: pruebas, recorrido de todas las pantallas, seguridad, código muerto, dependencias y
riesgos. Lo corregido se hizo en la V0.14; lo demás queda como recomendación.

## Cómo se comprobó
- Pruebas automáticas: 54 de JavaScript (`npm test`) y 10 de Python (`pytest`), todas correctas.
- Recorrido sin pantalla en Chromium con los tres proyectos de ejemplo (testigo idealizado, sondeo de prueba IODP y
  proyecto de entrenamiento): detección y modos Sección, Columna, Figuras (columna, distribución, trazas, secciones),
  Datos y Multiproxy; tema claro/oscuro e idioma; exportación e importación de proyectos con imágenes. Sin errores en
  la consola.
- Revisión del código: textos del usuario insertados en la página, ajustes de seguridad del programa de escritorio,
  funciones sin uso y librerías externas.

## Corregido en la V0.14
| Hallazgo | Corrección |
|---|---|
| TIFF y Excel necesitaban internet (librerías descargadas de CDN) | Las librerías van con el programa (`app/vendor/`: UTIF, pako, SheetJS, con sus licencias); internet solo como respaldo en el archivo único sin conexión |
| Código sin uso (`b64encode`, `geoPredictAll`) | Eliminado |
| Referencias a datos y textos privados del autor en código, ejemplos, herramientas y documentación | Eliminadas (botón y carga de datos privados, carpeta de ejemplo y script de preparación, textos de la interfaz y de la documentación) |
| README sin explicación de uso | README nuevo: utilidad, descarga, uso paso a paso, paquete Python, cita |

## Correcto (sin cambios)
- Los textos que escribe el usuario (nombres, comentarios, registros) se escapan al insertarlos en la página; los
  avisos usan texto plano.
- Programa de escritorio: aislamiento de contexto y sandbox activados; las ventanas nuevas solo se abren dentro del
  propio programa.
- Errores al dibujar columna y figuras se muestran con su mensaje y no bloquean el programa.
- Guardado: automático, con imágenes originales a resolución completa almacenadas una vez; copias en carpeta y
  paquetes `.corantool` legibles con cualquier descompresor ZIP.

## Riesgos y recomendaciones (por prioridad)
1. **Historial de git:** los commits antiguos siguen conteniendo los textos y archivos retirados. Para borrarlos del
   todo hay que reescribir el historial (acción irreversible que requiere decisión del autor).
2. **`app.js` tiene ~5 600 líneas.** Dividirlo en módulos (sección, columna, figuras, multiproxy, proyectos) facilita
   el mantenimiento y abarata cada cambio.
3. **Trabajo en equipo sin bloqueo:** si dos personas editan a la vez, la última versión abierta sustituye a la otra
   (solo los comentarios se unen). Siguiente paso propuesto: un archivo por sección y bloqueo por sección.
4. **Paridad Python/JS:** el paquete Python no tiene capa de exclusión ni mínimo de píxeles válidos; los resultados
   coinciden solo sin exclusiones.
5. **Cachés de rendimiento:** dependen de que todo cambio de máscaras pase por `beginOp`/`afterChange` o por asignar
   el array. Mantener esa regla en código nuevo.
6. **Límites de memoria fijos** (~0,9 GB imágenes, ~0,5 GB máscaras): podrían adaptarse a la RAM de cada equipo.
7. **Instaladores sin firmar y sin actualización automática:** avisos de Windows/macOS y actualización manual.
8. **Dependabot:** los avisos de seguridad de `glob`/`minimatch` vienen de la herramienta de compilación
   (electron-builder), no del programa; se resuelven actualizándola.
9. **Identificadores de recorte en SVG** (`track-…`, `range-…`) se repiten entre figuras; no causa fallos mientras solo
   se muestre una figura a la vez, pero conviene hacerlos únicos.
