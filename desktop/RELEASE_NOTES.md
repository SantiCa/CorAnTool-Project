## SedCoreTool V0.54

SedCoreTool quantifies bioturbation and ichnotaxa in sediment-core images and combines them with other down-core
records and described intervals. Version 0.x, in active development. The downloads contain no sample data: the
program starts empty and you open your own images and tables.

### Highlights
- New name: **SedCoreTool** (formerly CorAnTool and IchAnTool). Projects saved with earlier versions and `.corantool`
  packages still open.
- Projects saved section by section, robust table import, accessibility and performance improvements.
- Core location map figure (WGS 84, Web Mercator, UTM) with grid, scale bar, north arrow and optional Esri backgrounds.
- Ichnotaxa distribution as symmetric curves; horizontal orientation for figures.
- Final test on cores reserved from training.

The full list of changes is in [CHANGELOG.md](https://github.com/SantiCa/SedCoreTool-Project/blob/master/CHANGELOG.md).

### Downloads

| System | File |
|---|---|
| Windows 10/11, x64 | `SedCoreTool-V0.54-windows-setup.exe` or `SedCoreTool-V0.54-windows-portable.exe` |
| macOS 13 or later, Intel and Apple Silicon | `SedCoreTool-V0.54-mac-universal.dmg` |
| Linux, x64 | `SedCoreTool-V0.54-linux-x86_64.AppImage` or `SedCoreTool-V0.54-linux-amd64.deb` |
| Any system, in a browser | `SedCoreTool_V0.54.html` (single file, works offline) |
| Verification | `SHA256SUMS.txt` and `RELEASE_MANIFEST.json` |

Windows: run the installer or open the portable version. macOS: drag the application to Applications. Linux: make
the AppImage executable or install the DEB package. The HTML file opens with a double click. The installers are not
code-signed, so the operating system may ask for confirmation the first time.

To verify a file: `Get-FileHash <file> -Algorithm SHA256` in PowerShell, `shasum -a 256 <file>` on macOS or
`sha256sum -c SHA256SUMS.txt` on Linux. The manifest identifies the source commit and the size and hash of each file.

### Before you update
Export a copy of your projects. The program does not update itself; install the new version over the old one.

### Known limitations
- U-Net models must be trained by the user; no model trained on real cores is distributed yet.
- The first download of the vision model and map backgrounds need an internet connection.
- Training a U-Net needs Python 3.10 or later on the computer and installs a 2–3 GB module once.

Documentation: [technical documentation](https://github.com/SantiCa/SedCoreTool-Project/blob/master/docs/TECHNICAL_DOCUMENTATION.md).
