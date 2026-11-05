## Novedades de V33

- **Proyectos grandes sin agotar la memoria.** Las imágenes originales se guardan una sola vez en el disco y solo se cargan en memoria las de la sección con la que trabajas. Los proyectos con muchas secciones abren mucho más rápido.
- **Resolución completa siempre guardada.** Cada sección tiene un selector «Resolución de trabajo» (completa, 1/2, 1/3…, con px/cm y megapíxeles). Puedes cambiarla cuando quieras: la imagen se recalcula desde el original y las trazas, las exclusiones, la zona de análisis y las marcas se adaptan. Un botón iguala todas las secciones a los mismos px/cm.
- **Recortar ya no reduce la imagen.** El recorte se guarda sobre el original a resolución completa.
- **Intervalo de análisis en centímetros** (por defecto 1 cm), igual para todas las secciones, en lugar de píxeles. Los proyectos anteriores se convierten solos y conservan sus intervalos.
- **Proyectos de versiones anteriores:** se abren y se convierten automáticamente. La primera apertura tarda algo más. Antes de actualizar, conviene exportar una copia de seguridad.

Limitaciones conocidas: al subir la resolución, las trazas ya dibujadas conservan el escalonado de la resolución anterior; al bajarla pueden desaparecer trazas muy pequeñas. Las figuras de trazas y de secciones tardan más la primera vez, porque leen las imágenes del disco.

## Descargar CorAnTool

| Sistema | Archivo | Cómo abrirlo |
|---|---|---|
| Windows 10/11 | `CorAnTool-V…-windows-setup.exe` (instalador) o `…-windows-portable.exe` (sin instalar) | Si Windows avisa «Windows protegió su PC», pulsa **Más información → Ejecutar de todas formas** (el programa no está firmado con un certificado de pago). |
| macOS (Intel y Apple Silicon) | `CorAnTool-V…-mac-universal.dmg` | Arrastra CorAnTool a Aplicaciones. La primera vez: clic derecho sobre la app → **Abrir** → Abrir (o Ajustes del Sistema → Privacidad y seguridad → «Abrir igualmente»). |
| Linux | `CorAnTool-V…-linux-x86_64.AppImage` o `…-linux-amd64.deb` | AppImage: hazlo ejecutable (`chmod +x`) y ábrelo. Debian/Ubuntu: `sudo apt install ./CorAnTool-…deb`. |

- El programa arranca vacío. Los ejemplos (proyecto de entrenamiento con recorrido guiado, sondeo IODP U1385I) están en «Ejemplos y aprendizaje».
- Los proyectos se guardan en el disco de tu ordenador, dentro de la carpeta de datos del programa. Usa «Copias de seguridad» para tener una copia en una carpeta sincronizada (OneDrive, Google Drive…).
- Proyectos de la versión web: expórtalos desde el navegador (`.corantool.json`) e impórtalos aquí con «Importar archivo…».

Cambios de esta entrega: ver `docs/HISTORIAL_VERSIONES.md` y `CHANGELOG.md`.
