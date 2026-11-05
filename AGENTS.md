# CorAnTool — instrucciones para Codex

Comunicar en español. Leer `CLAUDE.md`: sus reglas de entregas, Git, código y privacidad
también se aplican a Codex. No mantener una segunda copia de esas reglas.

## Contexto mínimo por tarea

1. Leer este archivo y `docs/COORDINACION_IA.md`.
2. Comprobar `git status --short --branch` y el turno de edición antes de escribir.
3. Buscar con `rg` y leer solo los archivos y rangos necesarios. Consultar el traspaso
   histórico, el historial completo y conversaciones anteriores solo si la tarea lo exige.

| Trabajo | Punto de entrada |
|---|---|
| Código y pruebas | `app/js/`, `src/ichantool/`, `tests/`, `package.json`, `pyproject.toml` |
| Revisión científica | Función concreta y su sección en `docs/DOCUMENTACION_TECNICA.md`; regresión v2.1 |
| Documentación y publicaciones | Documento solicitado; `publications/METODOS_Y_DEFENSA.md` si afecta a afirmaciones científicas |
| Integración | Diff de la entrega, tabla y secciones recientes de `docs/HISTORIAL_VERSIONES.md`, `CLAUDE.md` |

## Trabajo compartido y economía

- Una tarea concreta por turno. El repositorio compartido tiene un solo editor activo;
  los demás chats pueden revisar en lectura. Seguir el protocolo de coordinación.
- No iniciar refactorizaciones, auditorías generales ni pendientes antiguos al abrir un chat.
- No cambiar de rama, hacer stash, limpiar ni descartar cambios de otro chat o de Claude.
- No usar subagentes, nuevas conversaciones ni automatizaciones sin petición del usuario.
- Ejecutar las pruebas exigidas por `CLAUDE.md` antes de cada commit. No repetirlas sobre
  el mismo estado ya verificado si no cambió nada ni surgió una duda nueva.
- No añadir pruebas para cambios documentales ni para replicar la implementación.
- Responder brevemente: resultado, comprobación, entrega V y pendiente real. Registrar
  decisiones duraderas en el documento correspondiente, sin duplicar diarios.
