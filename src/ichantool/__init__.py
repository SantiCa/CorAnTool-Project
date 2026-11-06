"""Compatibility alias (V0.52): the package is now ``sedcoretool``.

``import ichantool`` and ``import ichantool.<module>`` keep working for code and notebooks written
before the rename (IchAnTool / CorAnTool); new code should use ``import sedcoretool``.
"""

import sys
import warnings

import sedcoretool as _pkg

warnings.warn("'ichantool' was renamed to 'sedcoretool'; use 'import sedcoretool'", DeprecationWarning, stacklevel=2)
sys.modules[__name__] = _pkg   # submodules (ichantool.cli, ichantool.unet, …) resolve through sedcoretool's path
