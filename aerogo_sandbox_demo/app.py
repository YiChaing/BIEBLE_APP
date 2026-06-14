"""
AERO GO — AI Sandbox / GiMATE 動態調度代理程式 Demo Server
============================================================
範疇與限制（請見 README.md）：
  - 本程式為「概念性技術 Demo」，對應 PRD 第4節 / 第7節 API 設計表。
  - 所有資料皆為記憶體內 mock 狀態，重啟即重置，與真實硬體 / Futurenest
    後端無任何連線。
  - PRD 第4節已標註「Roadmap — 尚未經 AI Team 驗證」，本 Demo 僅用於
    展示提案中所描述的互動流程與資料結構，不代表已驗證之產品行為。

僅使用 Python 標準函式庫（無外部依賴），以 http.server 實作。
"""

import json
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STATIC_DIR = Path(__file__).parent / "static"

# ---------------------------------------------------------------------------
# In-memory mock state
# ---------------------------------------------------------------------------

VRAM_TOTAL_GB = 128

state = {
    "vram": {
        "processes": [
            {
                "pid": 4101,
                "name": "Local LLM (120B, GiMATE Runtime)",
                "category": "ai",
                "allocated_gb": 46,
                "min_gb": 32,
                "max_gb": 64,
                "priority": "high",
            },
            {
                "pid": 5210,
                "name": "Adobe Premiere Pro",
                "category": "creator",
                "allocated_gb": 22,
                "min_gb": 8,
                "max_gb": 48,
                "priority": "normal",
            },
            {
                "pid": 6320,
                "name": "Blender (3D Rendering)",
                "category": "creator",
                "allocated_gb": 14,
                "min_gb": 4,
                "max_gb": 32,
                "priority": "normal",
            },
        ]
    },
    "cooling": {
        "mode": "balanced",
    },
    "sandbox": {
        "active": False,
        "session_token": None,
        "hwid": None,
        "verified_at": None,
        "network_isolated": False,
        "model_integrity_verified": False,
        "tpm_hwid_bound": False,
        "ndis_isolation_active": False,
        "protected_enclave_gb": 0,
    },
}

# 沙盒啟用時，從 128GB UMA 中保留給「受保護記憶體區」的容量
# （概念示意數值 — 對應使用者描述之 VRAM/RAM Fencing，PRD/提案單未列出
#  具體數字，未經 AI Team / 資安團隊驗證）
PROTECTED_ENCLAVE_GB = 16

# Cooling mode presets — illustrative numbers only, not validated thermal data
COOLING_PRESETS = {
    "silent": {"tgp_w": 35, "fan_rpm": 2200, "cpu_temp_c": 62, "gpu_temp_c": 58},
    "balanced": {"tgp_w": 55, "fan_rpm": 3400, "cpu_temp_c": 72, "gpu_temp_c": 70},
    "performance_80w": {"tgp_w": 80, "fan_rpm": 5200, "cpu_temp_c": 84, "gpu_temp_c": 82},
}

LICENSE_RE = re.compile(r"^FN-[A-Z0-9]{4}-[A-Z0-9]{4}$")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def effective_vram_total():
    """目前可分配的 UMA 容量 = 128GB 減去沙盒啟用時保留的受保護記憶體區。"""
    return VRAM_TOTAL_GB - state["sandbox"]["protected_enclave_gb"]


def vram_summary():
    procs = state["vram"]["processes"]
    allocated = sum(p["allocated_gb"] for p in procs)
    total = effective_vram_total()
    return {
        "total_gb": total,
        "physical_total_gb": VRAM_TOTAL_GB,
        "reserved_for_sandbox_gb": state["sandbox"]["protected_enclave_gb"],
        "allocated_gb": allocated,
        "free_gb": total - allocated,
        "processes": procs,
        "timestamp": int(time.time()),
    }


def cooling_summary():
    mode = state["cooling"]["mode"]
    preset = COOLING_PRESETS[mode]
    return {"mode": mode, **preset, "timestamp": int(time.time())}


def sandbox_summary():
    return {**state["sandbox"], "timestamp": int(time.time())}


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "AeroGoSandboxDemo/0.1"

    def _send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_static(self, rel_path):
        if rel_path == "/" or rel_path == "":
            rel_path = "/index.html"
        file_path = (STATIC_DIR / rel_path.lstrip("/")).resolve()
        if STATIC_DIR.resolve() not in file_path.parents and file_path != STATIC_DIR.resolve():
            self._send_json({"error": "forbidden"}, 403)
            return
        if not file_path.exists() or not file_path.is_file():
            self._send_json({"error": "not found", "path": rel_path}, 404)
            return
        content_type = "text/html; charset=utf-8"
        if file_path.suffix == ".js":
            content_type = "application/javascript; charset=utf-8"
        elif file_path.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return None

    # -- routing -----------------------------------------------------------

    def do_GET(self):
        if self.path == "/api/gimate/vram/status":
            self._send_json({"ok": True, "data": vram_summary()})
        elif self.path == "/api/hardware/cooling/mode":
            self._send_json({"ok": True, "data": cooling_summary()})
        elif self.path == "/api/futurenest/sandbox/status":
            self._send_json({"ok": True, "data": sandbox_summary()})
        else:
            self._send_static(self.path)

    def do_POST(self):
        if self.path == "/api/gimate/vram/allocate":
            self._handle_vram_allocate()
        elif self.path == "/api/hardware/cooling/mode":
            self._handle_cooling_mode()
        elif self.path == "/api/futurenest/sandbox/verify":
            self._handle_sandbox_verify()
        else:
            self._send_json({"ok": False, "error": "unknown endpoint"}, 404)

    # -- endpoint implementations -------------------------------------------

    def _handle_vram_allocate(self):
        """POST /api/gimate/vram/allocate
        body: { pid: int, allocated_gb: number }

        對應 PRD: 「根據應用程式 PID 動態設定 VRAM 鎖定上限與下限，
        強制釋放或保留資源」。

        Demo 簡化規則：
          - 拒絕超出 min/max 範圍的請求
          - 拒絕會讓總分配超過 128GB 的請求（對應 PRD 8. VRAM 資源完全耗盡
            邊界條件 — 本 Demo 僅回傳錯誤，不實作「強制暫停低優先序任務」的
            自動降級邏輯，該行為仍屬 Roadmap 未驗證範圍）
        """
        body = self._read_json_body()
        if body is None:
            self._send_json({"ok": False, "error": "invalid json"}, 400)
            return

        pid = body.get("pid")
        new_alloc = body.get("allocated_gb")
        if pid is None or new_alloc is None:
            self._send_json({"ok": False, "error": "pid and allocated_gb are required"}, 400)
            return

        procs = state["vram"]["processes"]
        target = next((p for p in procs if p["pid"] == pid), None)
        if target is None:
            self._send_json({"ok": False, "error": f"unknown pid {pid}"}, 404)
            return

        if not (target["min_gb"] <= new_alloc <= target["max_gb"]):
            self._send_json({
                "ok": False,
                "error": (
                    f"allocated_gb {new_alloc} 超出 {target['name']} 的 "
                    f"min/max 範圍 ({target['min_gb']}-{target['max_gb']} GB)"
                ),
            }, 422)
            return

        other_total = sum(p["allocated_gb"] for p in procs if p["pid"] != pid)
        cap = effective_vram_total()
        if other_total + new_alloc > cap:
            reserved = state["sandbox"]["protected_enclave_gb"]
            reserved_note = (
                f"（其中 {reserved}GB 已被 Futurenest 沙盒受保護記憶體區保留）"
                if reserved else ""
            )
            self._send_json({
                "ok": False,
                "error": (
                    f"總分配將超過目前可用上限 {cap}GB{reserved_note}"
                    f"（其他程序已佔用 {other_total}GB）。"
                    " PRD 8. 描述之「強制暫停低優先序背景任務」自動降級邏輯"
                    "尚未實作於本 Demo（Roadmap）。"
                ),
            }, 409)
            return

        target["allocated_gb"] = new_alloc
        self._send_json({"ok": True, "data": vram_summary()})

    def _handle_cooling_mode(self):
        """POST /api/hardware/cooling/mode
        body: { mode: "silent" | "balanced" | "performance_80w" }
        """
        body = self._read_json_body()
        if body is None:
            self._send_json({"ok": False, "error": "invalid json"}, 400)
            return

        mode = body.get("mode")
        if mode not in COOLING_PRESETS:
            self._send_json({
                "ok": False,
                "error": f"mode 必須為 {list(COOLING_PRESETS.keys())} 之一",
            }, 400)
            return

        state["cooling"]["mode"] = mode
        self._send_json({"ok": True, "data": cooling_summary()})

    def _handle_sandbox_verify(self):
        """POST /api/futurenest/sandbox/verify
        body: { license_code: str, hwid: str }

        對應 PRD: 「驗證在地 AI 模型與企業授權狀態，並初始化隔離的沙盒環境」。

        Demo 簡化規則（三階段流程為使用者提供之安全架構描述的概念示意，
        非來自 PRD/提案單，未經 AI Team / 資安團隊驗證）：
          1. 模型與身份校驗 (model_integrity_verified / tpm_hwid_bound)
             — license_code 須符合 FN-XXXX-XXXX 格式（純格式檢查，非真實
               Futurenest 授權系統 — 該合作狀態本身仍待確認，見 PRD 9.）
          2. 驅動層級網路阻斷 (network_isolated / ndis_isolation_active)
             — 通過後標記為 true，不代表已實作 NDIS 過濾驅動
          3. 記憶體沙盒隔離 (protected_enclave_gb)
             — 通過後從 128GB UMA 中保留 PROTECTED_ENCLAVE_GB，影響
               vram_summary() 的可用總量（與 Performance 卡連動的示意）

        通過後回傳 mock session_token。
        """
        body = self._read_json_body()
        if body is None:
            self._send_json({"ok": False, "error": "invalid json"}, 400)
            return

        license_code = (body.get("license_code") or "").strip().upper()
        hwid = (body.get("hwid") or "").strip()

        if not hwid:
            self._send_json({"ok": False, "error": "hwid is required"}, 400)
            return

        if not LICENSE_RE.match(license_code):
            self._send_json({
                "ok": False,
                "error": "license_code 格式錯誤，應為 FN-XXXX-XXXX（mock格式檢查）",
            }, 422)
            return

        token = f"sbx_{int(time.time())}_{hwid[-4:]}"
        state["sandbox"] = {
            "active": True,
            "session_token": token,
            "hwid": hwid,
            "verified_at": int(time.time()),
            "network_isolated": True,
            "model_integrity_verified": True,
            "tpm_hwid_bound": True,
            "ndis_isolation_active": True,
            "protected_enclave_gb": PROTECTED_ENCLAVE_GB,
        }
        self._send_json({"ok": True, "data": sandbox_summary()})

    def log_message(self, fmt, *args):
        pass  # quiet logging


def main(port=8000):
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"AERO GO Sandbox Demo running at http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
