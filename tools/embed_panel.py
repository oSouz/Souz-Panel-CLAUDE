"""Embed the local, dependency-free web UI in the DLL; run from any directory."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
page = (root / 'web/panel.html').read_text(encoding='utf-8')
assert ')SOUZWEB"' not in page
(root / 'src/PanelPage.h').write_text('#pragma once\nnamespace souz {\ninline constexpr char PanelPage[] = R"SOUZWEB(' + page + ')SOUZWEB";\n}\n', encoding='utf-8')
