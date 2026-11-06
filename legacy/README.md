# Legacy code (v2.1, 2019)

Unchanged original code, kept as the reference the current analysis is checked against.

- `v2.1_console/IchAnTool.py` — original console script (Python 3.7, numpy, Pillow).
  `example_output.csv` is its output for `examples/data/idealized_core_0-500cm.jpg` (150 px bins).
- `v2.1_gui/` — tkinter interface with auxiliary tools (Excel export, age converter, data
  equaliser, Excel merger). `Datos/martrat2004_AgeSST.xlsx`: age/SST data from Martrat et al. (2004).

New development happens in `src/ichantool/`.
