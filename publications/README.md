# Publicaciones previstas — CorAnTool (antes IchAnTool)

Borradores, revistas candidatas y estado de cada trabajo. Estado al **01-11-2026** (software en la entrega V28).
Todo lo marcado `[TODO]` está pendiente; ningún resultado de estos borradores es definitivo.

> Aviso: si el repositorio es **público**, no subir aquí datos ni resultados inéditos privados hasta que el
> manuscrito esté enviado o publicado como preprint (o pasar los borradores a un repositorio privado).

## Cartera de publicaciones

| # | Trabajo y aporte | Revista principal (alternativas) | Depende de | Estado |
|--|------------------------------|------------------------------|----------------|------------|
| 1 | **Software: CorAnTool.** Herramienta abierta y reproducible | JOSS (Applied Computing and Geosciences; Computers & Geosciences) | Release con DOI | Borrador en inglés |
| 2 | **Dataset anotado y segmentación automática.** Datos abiertos y método | Earth System Science Data (Scientific Data; AI in Geosciences; Computers & Geosciences) | 1 e imágenes con permiso | Esquema |
| 3 | **Validación frente a índices visuales y aplicación paleoambiental.** Interpretación geológica | Palaeogeography, Palaeoclimatology, Palaeoecology (Ichnos; Marine Geology; Sedimentary Geology) | 1 (y 2) | Esquema |
| 4 | **Clasificación automática de intervalos con datos multiproxy.** Método de aprendizaje automático | Computers & Geosciences (AI in Geosciences; Applied Computing and Geosciences; Marine Geology) | 1 y sondeos con eventos descritos | Esquema y primeras pruebas |
| 5 | **Nota breve en español.** Difusión en España | Geogaceta (Spanish Journal of Palaeontology) | 1 | Idea |

**Orden recomendado:** 1 → 5 → 4 → 2 → 3.

- El 1 da el DOI que citan los demás; el 5 se puede escribir a la vez con el mismo material.
- El 4 es el más avanzado en software (V26–V27: familias, clasificadores, red neuronal, validación) y solo necesita
  datos con eventos descritos de forma independiente.
- El 2 y el 3 dependen de trabajo con otras personas (anotadores, observadores a ciegas) y llevan más tiempo.

## Qué puede afirmar hoy cada uno (resumen)
| # | Se puede afirmar | No se puede afirmar todavía |
|--|------------------------------------|------------------------------------|
| 1 | Reproduce exactamente los resultados de 2020; es determinista; integra imágenes, registros, intervalos, clasificación, mapas y figuras | Rendimiento de la detección automática en datos reales |
| 2 | Las herramientas de anotación existen y producen máscaras abiertas | Precisión de la segmentación (faltan datos anotados) |
| 3 | La app registra BI/ii manuales junto a los automáticos | Concordancia con observadores (falta el experimento) |
| 4 | La cadena funciona con verdad conocida (sintético: RF ≈ 91 %, red ≈ 80 %) | Capacidad predictiva real: con los datos privados del autor, 18 % de acierto equilibrado dejando un sondeo fuera (7 clases) |
| 5 | Funcionalidad y ejemplo con datos públicos | — |

## Documentación de métodos
Qué algoritmos usa cada artículo, qué se puede afirmar, qué falta validar y respuestas preparadas a revisores:
[METODOS_Y_DEFENSA.md](METODOS_Y_DEFENSA.md). Detalle técnico con fórmulas:
[../docs/DOCUMENTACION_TECNICA.md](../docs/DOCUMENTACION_TECNICA.md). Revistas: [journals.md](journals.md).

## Descargas
Versión completa de este dossier (índice, métodos y defensa, borradores y revistas) en
[Word](export/Publicaciones_CorAnTool.docx) y [LaTeX](export/Publicaciones_CorAnTool.tex). Se regeneran con
`python tools/export_publications.py` (necesita pandoc).

## Estructura
```
publications/
  README.md                          este índice
  METODOS_Y_DEFENSA.md               métodos, afirmaciones y defensa por artículo
  journals.md                        revistas candidatas y criterios
  01_software_JOSS/                  paper.md + paper.bib (formato JOSS)
  02_dataset_segmentation/draft.md
  03_validation_application/draft.md
  04_multiproxy_classification/draft.md
  05_nota_geogaceta/draft.md
  export/                            versiones en Word y LaTeX
```

## Antes de enviar
- Confirmar coautorías (F.J. Rodríguez-Tovar, F. Martínez-Ruiz, J. Dorador u otros según aporten datos o validación).
- ORCID de todos los autores.
- Release con DOI de Zenodo del código citado (indicar la entrega, p. ej. V28).
- Comprobar en la web de cada revista: alcance, formato, APC y política de preprints.
- Preprint opcional en EarthArXiv.
