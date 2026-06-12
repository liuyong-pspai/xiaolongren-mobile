#!/usr/bin/env python3
"""
🐉 小龙人PSPAI 一键启动器
"""
import json, os, sys, time, socket, subprocess, webbrowser
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

APP_DIR = Path(__file__).parent.resolve()
CONFIG_FILE = APP_DIR / "config.json"
ENV_FILE = APP_DIR / ".env"
FRONTEND_DIR = APP_DIR / "frontend" / "pwa" / "html"
for d in [APP_DIR / "frontend", APP_DIR / "UI原型", APP_DIR / "pwa", APP_DIR / "hongmeng"]:
    if d.exists(): FRONTEND_DIR = d; break

FRONTEND_PORT = int(os.environ.get('PSPAI_FRONTEND_PORT', '8088'))
ENGINE_PORT = int(os.environ.get('PSPAI_ENGINE_PORT', '8089'))

def find_python():
    for cmd in ["python3", "python"]:
        p = __import__("shutil").which(cmd)
        if p:
            try:
                r = subprocess.run([p, "--version"], capture_output=True, text=True, timeout=5)
                if r.returncode == 0: return p
            except: continue
    return None

def port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0

def wait_for_port(port, timeout=20):
    dl = time.time() + timeout
    while time.time() < dl:
        if port_in_use(port): return True
        time.sleep(0.3)
    return False

def load_config():
    if CONFIG_FILE.exists():
        try: return json.loads(CONFIG_FILE.read_text())
        except: pass
    return None

def save_config(cfg):
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))

def config_to_env(cfg):
    prov = cfg.get("provider", "deepseek"); key = cfg.get("api_key", "")
    lines = ["# 小龙人PSPAI配置", f"PSPAI_PROVIDER={prov}", f"PSPAI_API_KEY={key}"]
    m = cfg.get("model", ""); b = cfg.get("base_url", "")
    if m: lines.append(f"PSPAI_MODEL={m}")
    if b: lines.append(f"CUSTOM_BASE_URL={b}")
    pm = {"deepseek":"DEEPSEEK_API_KEY","openai":"OPENAI_API_KEY","anthropic":"ANTHROPIC_API_KEY","openrouter":"OPENROUTER_API_KEY"}
    lines.append(f"{pm.get(prov, 'DEEPSEEK_API_KEY')}={key}")
    ENV_FILE.write_text("\n".join(lines) + "\n")

class XiaoLongRenHandler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(FRONTEND_DIR), **kw)
    def do_GET(self):
        p = urlparse(self.path).path
        if p == "/api/config-file":
            self._json({"exists": CONFIG_FILE.exists()}); return
        super().do_GET()
    def do_POST(self):
        p = urlparse(self.path).path
        if p == "/api/config":
            try:
                cfg = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                save_config(cfg); self._json({"ok": True})
            except Exception as e: self._json({"ok": False, "error": str(e)}, 500)
        else: self.send_response(404); self.end_headers()
    def do_OPTIONS(self):
        self.send_response(200)
        for h in ["Access-Control-Allow-Origin", "Access-Control-Allow-Methods", "Access-Control-Allow-Headers"]:
            self.send_header(h, "*")
        self.end_headers()
    def _json(self, data, s=200):
        b = json.dumps(data).encode()
        self.send_response(s)
        for h, v in [("Content-Type","application/json"),("Access-Control-Allow-Origin","*")]: self.send_header(h, v)
        self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass

def start_http():
    if port_in_use(FRONTEND_PORT): print(f"✅ 前端端口 {FRONTEND_PORT} 已使用"); return None
    s = HTTPServer(("127.0.0.1", FRONTEND_PORT), XiaoLongRenHandler)
    __import__("threading").Thread(target=s.serve_forever, daemon=True).start()
    print(f"🌐 前端: http://127.0.0.1:{FRONTEND_PORT}"); return s

def start_engine():
    if port_in_use(ENGINE_PORT): print(f"✅ 引擎端口 {ENGINE_PORT} 已使用"); return None
    if not ENV_FILE.exists() and not all(k in os.environ for k in ["PSPAI_API_KEY","DEEPSEEK_API_KEY"]):
        print("❌ 未配置API Key，请通过网页配置"); return None
    py = find_python()
    if not py: print("❌ 未找到Python"); return None
    eng = APP_DIR / "engine" / "pspai_server.py"
    if not eng.exists(): print(f"❌ 引擎文件不存在: {eng}"); return None
    proc = subprocess.Popen([py, str(eng)], cwd=str(eng.parent), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"🚀 引擎启动中 (PID: {proc.pid})...")
    if wait_for_port(ENGINE_PORT, timeout=25): print(f"✅ 引擎: http://127.0.0.1:{ENGINE_PORT}")
    else: print("⚠️ 引擎启动较慢")
    return proc

def main():
    st = time.time()
    print("🐉 小龙人PSPAI 启动器 v1.0")
    print("="*50)
    if not FRONTEND_DIR.exists(): print(f"❌ 前端目录不存在"); return 1
    httpd = start_http()
    cfg = load_config()
    if not cfg:
        webbrowser.open(f"http://127.0.0.1:{FRONTEND_PORT}/config.html")
        print("⏳ 等待配置...")
        lm = CONFIG_FILE.stat().st_mtime if CONFIG_FILE.exists() else 0
        while True:
            time.sleep(0.5)
            if CONFIG_FILE.exists() and CONFIG_FILE.stat().st_mtime > lm:
                time.sleep(0.5); break
            if lm == 0 and time.time() - st > 300: print("⚠️ 配置超时"); return 1
        cfg = load_config()
    if cfg: config_to_env(cfg); print(f"📋 配置: {cfg.get('provider','?')}")
    start_engine()
    webbrowser.open(f"http://127.0.0.1:{FRONTEND_PORT}/")
    print("\n"+"="*50); print("  🐉  小龙人PSPAI 运行中！") ; print("="*50)
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        print("\n停止")

if __name__ == "__main__":
    st = time.time()
    main()
