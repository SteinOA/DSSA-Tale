"""Windows current-user DPAPI storage; credentials never enter command arguments."""
import ctypes
from ctypes import wintypes
import getpass
from pathlib import Path
import argparse
import sys


class Blob(ctypes.Structure):
    _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]


def transform(data, decrypt=False):
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    output = Blob()
    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    method = crypt32.CryptUnprotectData if decrypt else crypt32.CryptProtectData
    method.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p,
                       ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    method.restype = wintypes.BOOL
    if not method(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(output.data, output.size)
    finally:
        kernel32.LocalFree(output.data)


def read_token(path):
    return transform(Path(path).read_bytes(), decrypt=True).decode("utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument('--stdin', action='store_true')
    args = parser.parse_args()
    token = (sys.stdin.readline(512) if args.stdin else getpass.getpass("Hugging Face token (hidden): ")).strip()
    if not token.startswith("hf_") or any(c.isspace() for c in token):
        raise ValueError("Invalid token format")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(transform(token.encode("utf-8")))
    print("Credential encrypted for the current Windows user.")
