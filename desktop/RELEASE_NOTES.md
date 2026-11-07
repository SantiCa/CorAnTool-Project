## SedCoreTool V0.52

Aplicación para identificar y cuantificar trazas en imágenes de sondeos, integrar registros multiproxy
y exportar figuras. Versión 0.x en desarrollo. Incluye ejemplos públicos; arranca sin proyectos privados.

### Cambios recientes

- Nuevo nombre: **SedCoreTool** (antes CorAnTool e IchAnTool). Los proyectos `.corantool` y los guardados con la versión anterior se siguen abriendo.
- Guardado por secciones, edición con deshacer, mejoras de rendimiento y accesibilidad, e importación CSV robusta.
- Figura de localización de sondeos con proyecciones geográficas, Web Mercator y UTM, retícula y fondos Esri.
- SheetJS 0.20.3 y pesos DINOv2 fijados a un commit y SHA-256 verificable.
- Electron 45.2.1 y electron-builder 26.18.0. Prueba automática de cierre y reapertura del escritorio
  antes de construir los instaladores de cada sistema.
- HTML sin conexión, manifiesto del commit y sumas SHA-256 incluidos con las descargas.

### Descargas

| Sistema | Archivo |
|---|---|
| Windows 10/11, x64 | `SedCoreTool-V0.52-windows-setup.exe` o `SedCoreTool-V0.52-windows-portable.exe` |
| macOS 13+, Intel y Apple Silicon | `SedCoreTool-V0.52-mac-universal.dmg` |
| Linux, x64 | `SedCoreTool-V0.52-linux-x86_64.AppImage` o `SedCoreTool-V0.52-linux-amd64.deb` |
| Navegador, archivo único | `SedCoreTool_V0.52.html` |
| Verificación de las descargas | `SHA256SUMS.txt` y `RELEASE_MANIFEST.json` |

Windows: ejecutar el instalador o abrir el portable. macOS: arrastrar la aplicación a Aplicaciones.
Linux: dar permiso de ejecución al AppImage o instalar el DEB. El HTML se abre con doble clic.
Los ejecutables no están firmados: el sistema puede pedir confirmación de apertura.

Para verificar un archivo: `Get-FileHash archivo -Algorithm SHA256` en PowerShell,
`shasum -a 256 archivo` en macOS o `sha256sum -c SHA256SUMS.txt` en Linux.
El manifiesto identifica exactamente el commit fuente y los tamaños y hashes de los seis archivos de programa.

### Comprobaciones y límites

Se comprobó en Electron el guardado de una edición pendiente al cerrar y reiniciar, la detección del
ejemplo público, el puente de estado del entrenador y la carga local de ONNX Runtime Web.
El DINOv2 real produjo un vector válido de 384 valores con una entrada sintética y los seis fondos Esri
se descargaron correctamente. Estas pruebas técnicas no miden precisión con testigos reales.

Antes de actualizar, exportar una copia de los proyectos. Quedan por comprobar el uso humano de los
instaladores en cada equipo, el lector de pantalla y el entrenamiento con el hardware del usuario.
Los modelos U-Net necesitan entrenamiento propio; la primera descarga de DINOv2 y los fondos de mapa
requieren internet. El programa no se actualiza solo.

Este borrador queda preparado para revisión antes de publicar. Zenodo y DOI están aplazados.
Detalles y métodos: `CHANGELOG.md`, `docs/HISTORIAL_VERSIONES.md` y `docs/TECHNICAL_DOCUMENTATION.md`.
