#!/usr/bin/env python3
"""Verify a built FFGL plugin: 64-bit x86 PE, exports plugMain. Usage: check_dll.py <file.dll>"""
import sys
import pefile

path = sys.argv[1]
pe = pefile.PE(path)
machine_ok = pe.FILE_HEADER.Machine == 0x8664
exports = [e.name.decode() for e in pe.DIRECTORY_ENTRY_EXPORT.symbols if e.name]
print("file     :", path)
print("machine  :", hex(pe.FILE_HEADER.Machine), "(x64)" if machine_ok else "(NOT x64!)")
print("exports  :", exports)
if not machine_ok or "plugMain" not in exports:
    sys.exit("FAILED: Resolume needs a 64-bit DLL that exports plugMain")
print("OK")
