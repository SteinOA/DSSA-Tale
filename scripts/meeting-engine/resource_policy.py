"""Local CPU/RAM policy. Standard library only; no identifiers or networking."""
import ctypes
import os

GIB = 1024 ** 3


def memory_status():
    if os.name == "nt":
        class Memory(ctypes.Structure):
            _fields_ = [("length", ctypes.c_uint32), ("load", ctypes.c_uint32)] + [
                (name, ctypes.c_uint64) for name in ("total", "available", "page_total", "page_available", "virtual_total", "virtual_available", "extended")]
        value = Memory()
        value.length = ctypes.sizeof(value)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(value)):
            return value.total, value.available
    else:
        try:
            page = os.sysconf("SC_PAGE_SIZE")
            return page * os.sysconf("SC_PHYS_PAGES"), page * os.sysconf("SC_AVPHYS_PAGES")
        except (ValueError, OSError, AttributeError):
            pass
    return None, None


def policy(total=None, available=None, cpus=None):
    logical = max(1, cpus or os.cpu_count() or 1)
    if total is None or available is None:
        return {"tier": "unknown", "cpuThreads": min(2, logical), "windowSeconds": 10,
                "reserveBytes": GIB, "budgetBytes": None}
    reserve = max(GIB, min(4 * GIB, total * .15))
    budget = max(0, min(total, available) - reserve)
    tier = "compact" if total < 12 * GIB or budget < 4 * GIB else "balanced" if total < 24 * GIB or budget < 8 * GIB else "powerful"
    return {"tier": tier, "cpuThreads": max(1, min({"compact": 2, "balanced": 4, "powerful": 8}[tier], logical // 2 or 1)),
            "windowSeconds": {"compact": 10, "balanced": 20, "powerful": 30}[tier],
            "reserveBytes": reserve, "budgetBytes": budget}


def snapshot():
    return policy(*memory_status())


def model_ram_requirement(weight_bytes, device):
    # Conservative estimates; CPU needs resident weights and intermediate data.
    return int(weight_bytes * (0.35 if device == "cuda" else 2) + 1.5 * GIB)


def diarization_batch(tier, free_vram=None):
    batch = {"compact": 2, "balanced": 4, "powerful": 8}.get(tier, 2)
    if free_vram is not None:
        batch = min(batch, 1 if free_vram < GIB else 2 if free_vram < 2 * GIB else 4 if free_vram < 3 * GIB else 8)
    return batch


class MemoryBudgetError(RuntimeError):
    pass


def check_model_ram(weight_bytes, device):
    current = snapshot()
    if current["budgetBytes"] is not None and model_ram_requirement(weight_bytes, device) > current["budgetBytes"]:
        raise MemoryBudgetError("Insufficient available RAM for optional alignment")
    return current
