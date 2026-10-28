"""Embed the local, dependency-free web UI in the DLL; run from any directory.

MSVC rejects a single string literal above ~16 KB, so the page is written as adjacent
raw-string chunks (split at line ends), which the compiler concatenates.
"""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
page = (root / 'web/panel.html').read_text(encoding='utf-8')
CHUNK = 6000  # bytes, far below the MSVC limit

chunks, cur = [], ''
for line in page.splitlines(True):
    if cur and len((cur + line).encode('utf-8')) > CHUNK:
        chunks.append(cur)
        cur = ''
    cur += line
if cur:
    chunks.append(cur)
for c in chunks:
    assert ')SOUZWEB"' not in c
    assert len(c.encode('utf-8')) < 14000, 'a single line is too long to embed; split it'

body = '\n'.join('R"SOUZWEB(' + c + ')SOUZWEB"' for c in chunks)
(root / 'src/PanelPage.h').write_text(
    '#pragma once\nnamespace souz {\ninline constexpr char PanelPage[] =\n' + body + ';\n}\n',
    encoding='utf-8', newline='\n')
print('embedded %d bytes in %d chunks' % (len(page.encode('utf-8')), len(chunks)))
