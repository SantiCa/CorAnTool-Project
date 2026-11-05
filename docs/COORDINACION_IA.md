# Coordinación entre Santiago, Claude y Codex

Las reglas comunes están en `CLAUDE.md`; Codex empieza por `AGENTS.md`.
Este documento sirve de traspaso entre herramientas: los chats no comparten memoria.

## Reparto de trabajo

Claude puede continuar el desarrollo que Santiago le encargue. Los chats de Codex tienen
estos ámbitos; abrirlos no autoriza a ejecutar automáticamente tareas pendientes:

| Chat | Modelo inicial y esfuerzo | Ámbito y resultado |
|---|---|---|
| CorAn 01 · Código y pruebas | GPT-6.1 Terra, medium | App web, paquete Python, correcciones y pruebas concretas; cambio acotado y verificado |
| CorAn 02 · Revisión científica | GPT-6.1 Terra, high | Fórmulas, paridad Python/JS, evaluación de modelos y métodos; revisión sustentada en lectura por defecto |
| CorAn 03 · Documentación y publicaciones | GPT-6 Luna, high | Guías, textos y borradores fieles al comportamiento y evidencia disponibles |
| CorAn 04 · Integración y entregas | GPT-6 Luna, high | Diffs acotados, documentación V, comprobaciones y sincronización; entrega coherente y traspaso breve |

Asignación inicial elegida por Santiago el 05-11-2026. Para revisión compleja en el chat
de integración, pasar el análisis al chat de código o al científico antes de editar.

## Un solo editor en la copia compartida

Se conserva `master`, como establece `CLAUDE.md`. No iniciar ediciones simultáneas en
esta carpeta, ni siquiera en archivos distintos: historial, changelog y número V son comunes.

1. Antes de escribir, leer el turno de abajo y comprobar el estado de Git. Un árbol sucio
   no significa que sus cambios sean propios. Si hay un editor activo, continuar solo en lectura.
2. Si está libre y la tarea está encargada, anotar editor, objetivo, commit base y archivos.
   La reserva solo coordina agentes que leen este archivo; no es un bloqueo automático.
3. Si Claude trabaja en otra copia, actualizar primero una copia limpia con `git fetch origin`
   y `git pull --ff-only`. No hacerlo encima de cambios ajenos. Si divergen, revisar antes de integrar.
4. Antes del commit, volver a comprobar el remoto y la siguiente V. Si hubo otra entrega,
   reconciliarla antes de numerar. No usar push forzado ni sobrescribir trabajo ajeno.
5. Completar entrega, documentación y pruebas según `CLAUDE.md`, incluyendo el turno libre
   y el traspaso en el mismo commit. Seleccionar archivos explícitos al preparar el commit.
6. Cuando la tarea incluya sincronizar GitHub, usar push normal; si falla, conservar el commit
   local e informar. El siguiente agente debe partir del commit realmente compartido.

### Turno de edición

- Estado: libre.
- Editor: ninguno.
- Objetivo: sin tarea de implementación activa.
- Commit base y archivos: se anotarán al tomar el turno.

### Último traspaso

- **Numeración, 05-11-2026:** desde ahora las entregas son **V0.<n>**; la V33 es la **V0.1** (primera release). La
  siguiente es V0.2. V1 cuando Santiago dé el programa por completo.
- **V0.1 (antes V33), 05-11-2026 (Claude):** imágenes originales en un almacén aparte en disco y píxeles en memoria solo para las
  secciones en uso; resolución de trabajo cambiable por sección desde el original; recorte sin recodificar; intervalo de
  análisis en cm (`binCm`, Python `bin_cm`). Formato de proyecto v4. Sin pruebas en navegador (las hace Santiago).
- **V32, 05-11-2026 (Claude):** modo identificación (marcas de trazas, columna con triángulos y lista por tramo),
  leyenda de icnotaxones en columna y figuras, figura de secciones lado a lado y gráfico de distribución de icnotaxones.
  Las descargas de escritorio se publican creando la release `V32` en GitHub (o subiendo la etiqueta).
- **V31, 05-11-2026 (Claude):** recorte de imágenes al importar con ajuste de techo y muro, triángulos Start/End del
  área de análisis, ocultar zonas excluidas en la columna, arranque limpio sin proyectos precargados y programa de
  escritorio (Electron, `desktop/`) con compilación para Windows/macOS/Linux en GitHub Actions al subir la etiqueta
  `V<n>` (publica en Releases). Se integró sin conflictos con la V30 de coordinación (renumerado de V30 a V31).
- **V30, 05-11-2026:** preparación para colaborar entre Claude y Codex; instrucciones
  compartidas y cuatro ámbitos de chat. La app solo cambia su etiqueta de entrega.
- Pendientes de producto: siguen en `docs/TRASPASO_CLAUDE_CODE.md`; ninguno se inicia
  por el mero hecho de crear los chats.
- Validación: secciones V30 y V31 de `docs/HISTORIAL_VERSIONES.md`.

## Créditos y elección de modelo

Empezar con una petición pequeña y verificable. Usar Luna para extracción, resúmenes,
documentación y correcciones repetibles; reservar modelos de mayor capacidad para problemas
que exijan más juicio. Recomendación de trabajo, no enrutamiento automático ni ahorro garantizado.

No lanzar cuatro auditorías iniciales ni cargar el repositorio entero en cada chat. Pasar
objetivo, archivos, commit base y criterio de aceptación. Subir el esfuerzo o cambiar de
modelo cuando un problema concreto lo requiera; evitar Max/Ultra por rutina.

Los modelos efectivos se eligen en la app, no mediante este Markdown. Los nombres, tarifas
y disponibilidad pueden cambiar. Referencias oficiales consultadas el 05-11-2026:
[modelos](https://learn.chatgpt.com/docs/models) y
[consumo y tarifas](https://learn.chatgpt.com/docs/pricing).

## Entorno local Windows

Existe un entorno `.venv/` ignorado por Git, creado con `python -m venv .venv` e
instalado con `.\.venv\Scripts\python.exe -m pip install -e ".[dev]"`.
Para las pruebas Python, usar `.\.venv\Scripts\python.exe -m pytest -q`.
No reinstalar dependencias si el entorno ya funciona.

`npm test` ejecuta `node --test tests/app/*.test.mjs`. En esta sesión Node está
disponible y npm no está en PATH: el comando directo es equivalente y no necesita
instalar paquetes JavaScript. El archivo offline se genera con
`.\.venv\Scripts\python.exe tools/build_standalone.py` y queda en `dist/` (ignorado).

## Mensaje para retomar en Claude Code

> Lee CLAUDE.md y docs/COORDINACION_IA.md. Comprueba Git y el turno de edición antes
> de escribir. Continúa únicamente la tarea que Santiago te encargue; los otros chats
> pueden estar revisando en lectura. Respeta las entregas V, la paridad Python/JS,
> los datos privados y legacy/. Al terminar, deja pruebas, pendientes y turno libre
> en el traspaso y en el mismo commit de la entrega.
