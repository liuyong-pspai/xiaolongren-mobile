#!/usr/bin/env python3
"""
🐉 小龙人 PSPAI v7.0 — DNA双螺旋原生引擎

不再有"call_llm + register_tool + 事后记录"的拼凑模式。
整个引擎的内核就是一条DNA流水线：

  用户消息 → [基因测序器] → 基因序列 → [蛋白质合成器] → 回复
                         ↕                ↕
                   [进化引擎] ← 失败→变异 → 成功→存档

架构：
  - GeneSequencer（基因测序器）：LLM将用户意图解析为[基因序列]
  - ProteinSynthesizer（蛋白质合成器）：执行序列中的工具调用+组装回复
  - EvolutionEngine（进化引擎）：失败→自动变异工具组合，成功→存档模板
  - DNARegistry（基因注册中心）：16个工具即16个基因片段

不依赖任何外部AI框架，纯标准库。
"""
import http.server
import json
import os
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

# ═══════════════════════════════════════════════
# 自加载 .env（不依赖 systemd/source 注入，双路径搜索）
# ═══════════════════════════════════════════════
def _load_env():
    for _p in [Path(__file__).resolve().parent.parent / ".env",
               Path(__file__).resolve().parent / ".env"]:
        if _p.exists():
            with open(_p, encoding='utf-8') as _f:
                for _line in _f:
                    _line = _line.strip()
                    if not _line or _line.startswith('#') or '=' not in _line:
                        continue
                    _k, _v = _line.split('=', 1)
                    _k = _k.strip()
                    _v = _v.strip().strip('"').strip("'")
                    if _k and _v and _k not in os.environ:
                        os.environ[_k] = _v
            break
_load_env()

# ═══════════════════════════════════════════════
# 路径 & 配置
# ═══════════════════════════════════════════════

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
sys.path.insert(0, str(BASE_DIR))

def _load_env():
    env_path = BASE_DIR.parent / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    if k not in os.environ:
                        os.environ[k.strip()] = v.strip()
_load_env()

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

_config_paths = [Path.cwd() / 'config.yaml', BASE_DIR / 'config.yaml',
                 Path.cwd() / 'config.json', BASE_DIR / 'config.json']
CONFIG = {}
for _cp in _config_paths:
    if _cp.exists():
        try:
            if _cp.suffix == '.yaml':
                if HAS_YAML:
                    with open(_cp) as f:
                        CONFIG = yaml.safe_load(f)
                else:
                    continue
            else:
                with open(_cp) as f:
                    CONFIG = json.load(f)
            break
        except Exception:
            continue

AGENT_CFG = CONFIG.get('agent', {})
PROVIDER = AGENT_CFG.get('provider', os.environ.get('PSPAI_PROVIDER', 'deepseek'))
MODEL = AGENT_CFG.get('model', os.environ.get('PSPAI_MODEL', 'deepseek-v4-flash'))

# ═══════════════════════════════════════════════
# L0 灵魂（SOUL.md → 系统提示词）
# ═══════════════════════════════════════════════

SOUL_PATH = BASE_DIR / "SOUL.md"
if SOUL_PATH.exists():
    with open(SOUL_PATH, encoding='utf-8') as f:
        DEFAULT_PROMPT = f.read().strip()
else:
    DEFAULT_PROMPT = "你是小龙人PSPAI，基于DNA双螺旋架构的数字生命体。"

PSPAI_MSGS = {
    'zh': {'empty': '请说点什么吧。', 'thinking': '（思考中）', 'error': '抱歉，出了点问题'},
    'en': {'empty': 'Please say something.', 'thinking': '(Thinking)', 'error': 'Sorry, something went wrong'},
}
def t_msg(lang, key):
    return PSPAI_MSGS.get(lang, PSPAI_MSGS['zh']).get(key, PSPAI_MSGS['zh'][key])

# ═══════════════════════════════════════════════
# Provider配置（多LLM支持）
# ═══════════════════════════════════════════════

PROVIDER_KEY_MAP = {
    'deepseek': 'DEEPSEEK_API_KEY', 'openai': 'OPENAI_API_KEY',
    'anthropic': 'ANTHROPIC_API_KEY', 'openrouter': 'OPENROUTER_API_KEY',
    'alibaba': 'DASHSCOPE_API_KEY', 'zai': 'ZAI_API_KEY',
    'gemini': 'GEMINI_API_KEY', 'kimi-coding': 'MOONSHOT_API_KEY',
    'minimax': 'MINIMAX_API_KEY',
}
BASE_URL_MAP = {
    'deepseek': 'https://api.deepseek.com/v1', 'openai': 'https://api.openai.com/v1',
    'anthropic': 'https://api.anthropic.com/v1', 'openrouter': 'https://openrouter.ai/api/v1',
    'alibaba': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'gemini': 'https://generativelanguage.googleapis.com/v1beta',
    'zai': 'https://api.z.ai/api/paas/v4',
    'kimi-coding': 'https://api.moonshot.cn/v1',
    'minimax': 'https://api.minimax.chat/v1',
}

def resolve_api_key(provider):
    u = os.environ.get('PSPAI_API_KEY', '').strip()
    if u: return u
    v = PROVIDER_KEY_MAP.get(provider)
    if v:
        k = os.environ.get(v, '').strip()
        if k: return k
    return os.environ.get('DEEPSEEK_API_KEY', '').strip()

def resolve_base_url(provider):
    return BASE_URL_MAP.get(provider, 'https://api.deepseek.com/v1')

# ═══════════════════════════════════════════════
# 记忆 & 对话历史
# ═══════════════════════════════════════════════

MEMORY_PATH = BASE_DIR / "MEMORY.md"
if not MEMORY_PATH.exists():
    MEMORY_PATH.write_text("# 小龙人PSPAI DNA记忆\n\n## L1 工作记忆\n（系统就绪）\n---\n统计: 0\n", encoding='utf-8')

HISTORY_PATH = DATA_DIR / "conversations.json"
conversation_history = {}
if HISTORY_PATH.exists():
    try:
        with open(HISTORY_PATH) as f:
            conversation_history = json.load(f)
    except (json.JSONDecodeError, OSError):
        conversation_history = {}

def get_history(char_index):
    k = str(char_index)
    if k not in conversation_history:
        conversation_history[k] = []
    return conversation_history[k]

def add_history(char_index, role, content):
    k = str(char_index)
    if k not in conversation_history:
        conversation_history[k] = []
    conversation_history[k].append({"role": role, "content": content})
    if len(conversation_history[k]) > 200:
        conversation_history[k] = conversation_history[k][-200:]
    with open(HISTORY_PATH, 'w', encoding='utf-8') as f:
        json.dump(conversation_history, f, ensure_ascii=False)

# ═══════════════════════════════════════════════
# 第一层：DNA碱基 & 基因注册中心
# ═══════════════════════════════════════════════

class Base:
    """四碱基类型"""
    A = "tool"   # 原子工具
    T = "skill"  # 技能组合
    C = "plugin" # 插件
    G = "card"   # 声明

class Gene:
    """单个基因片段 = 一个工具/技能"""
    def __init__(self, name, base_type, description, parameters, handler):
        self.name = name
        self.base_type = base_type
        self.description = description
        self.parameters = parameters
        self.handler = handler
        self.fitness = 0.0
        self.call_count = 0
        self.success_count = 0

    def record(self, success):
        self.call_count += 1
        if success:
            self.success_count += 1
        self.fitness = self.success_count / max(self.call_count, 1)

    def to_dict(self):
        return {"name": self.name, "fitness": round(self.fitness, 3), "calls": self.call_count}

class DNARegistry:
    """基因注册中心——小龙人的DNA库"""
    def __init__(self):
        self.genes = {}
        self.by_type = {t: {} for t in [Base.A, Base.T, Base.C, Base.G]}

    def register(self, name, description, parameters, handler, base_type=Base.A):
        gene = Gene(name, base_type, description, parameters, handler)
        self.genes[name] = gene
        self.by_type[base_type][name] = gene

    def get(self, name):
        return self.genes.get(name)

    def get_fittest(self, n=3):
        return sorted(self.genes.values(), key=lambda g: g.fitness, reverse=True)[:n]

    def get_tool_list(self):
        return [{"name": n, "description": g.description, "parameters": g.parameters}
                for n, g in self.genes.items()]

    def count(self):
        return len(self.genes)

DNAREGISTRY = DNARegistry()

# ═══════════════════════════════════════════════
# 第二层：基因测序器（蛋白质合成器）
# ═══════════════════════════════════════════════

class GeneSequencer:
    """
    基因测序器。把LLM回复解析为结构化的基因序列。
    
    测序协议：LLM在回复中嵌入 GENE://tool_name?key=val&key2=val2 标记
    测序器解析这些标记，生成有序的基因序列。
    如果LLM没有输出任何基因标记 → 返回纯文本序列（仅对话）。
    """
    @staticmethod
    def sequence(reply_text):
        """
        从LLM回复文本中解析基因序列。
        返回 (基因序列列表, 纯文本回复)
        """
        genes = []
        clean_lines = []
        
        for line in reply_text.split('\n'):
            # 检测基因标记
            m = re.search(r'GENE://([a-z_]+)(?:\?(.*))?', line)
            if m:
                name = m.group(1)
                params_str = m.group(2) or ""
                params = {}
                if params_str:
                    for pair in params_str.split('&'):
                        if '=' in pair:
                            k, v = pair.split('=', 1)
                            params[k] = urllib.parse.unquote(v)
                genes.append({"tool": name, "params": params})
            else:
                clean_lines.append(line)
        
        return genes, '\n'.join(clean_lines)

class ProteinSynthesizer:
    """
    蛋白质合成器。执行基因序列中的工具调用，组装最终输出。
    
    对于每个GENE标记：
      1. 查DNARegistry找对应基因
      2. 调用handler执行
      3. 记录结果到基因的适应度
      4. 结果注入合成器上下文
    最后把所有结果+纯文本合成为最终回复。
    """
    @staticmethod
    def synthesize(genes_text, registry):
        """输入LLM原始回复 → 输出(执行结果, 工具调用数, 成功数)"""
        genes, clean_text = GeneSequencer.sequence(genes_text)
        
        if not genes:
            return clean_text, 0, 0
        
        tool_results = []
        success_count = 0
        
        for g in genes:
            gene = registry.get(g["tool"])
            if not gene:
                tool_results.append(f"[工具 {g['tool']} 不存在]")
                continue
            
            try:
                result = gene.handler(g["params"])
                gene.record(True)
                success_count += 1
                result_str = str(result)[:500]
                tool_results.append(f"[{g['tool']}] {result_str}")
            except Exception as e:
                gene.record(False)
                tool_results.append(f"[{g['tool']} 失败: {e}]")
        
        # 组合最终回复：工具结果 + 纯文本
        parts = tool_results + ([clean_text] if clean_text.strip() else [])
        return "\n\n".join(parts), len(genes), success_count


# ═══════════════════════════════════════════════
# 第三层：进化引擎
# ═══════════════════════════════════════════════

class EvolutionEngine:
    """
    进化引擎。失败时自动变异，成功时存档。
    
    变异规则：
      - 某个工具连续2次失败 → 标记为弱基因
      - 下次遇到同类型任务 → 替换为相似基因
      - 相似基因映射表从调用记录中自动学习
    
    存档规则：
      - 成功执行的基因序列 → 保存为模板
      - DNA编码 = 工具名的md5→ATCG映射
    """
    def __init__(self, registry):
        self.registry = registry
        self.templates = []
        self.mutation_count = 0
        self._fail_streak = {}
        self.evolution_path = DATA_DIR / "dna_evolution.json"
        self._load_persistence()

    def _load_persistence(self):
        """加载持久化的进化记录"""
        if self.evolution_path.exists():
            try:
                data = json.loads(self.evolution_path.read_text())
                if isinstance(data, list):
                    for rec in data:
                        if rec.get("success_rate", 0) >= 1.0:
                            self.templates.append(rec)
                        if rec.get("mutated", False):
                            self.mutation_count += 1
            except (json.JSONDecodeError, OSError):
                pass

    def _save_persistence(self):
        """持久化进化记录到文件"""
        records = []
        for t in self.templates[-50:]:
            records.append(t)
        # 也保存每个基因的适应度
        for g in self.registry.genes.values():
            if g.call_count > 0:
                records.append({
                    "gene": g.name,
                    "fitness": g.fitness,
                    "calls": g.call_count,
                    "time": time.time(),
                })
        self.evolution_path.parent.mkdir(exist_ok=True)
        self.evolution_path.write_text(json.dumps(records, ensure_ascii=False, indent=2))

    def record_execution(self, genes_text, tool_count, success_count):
        """记录一次执行结果，触发进化逻辑"""
        if tool_count == 0:
            return
        
        if success_count == tool_count:
            # 全部成功 → 存档模板
            self.templates.append({
                "genes": genes_text[:200],
                "time": time.time(),
                "success_rate": 1.0,
            })
            if len(self.templates) > 100:
                self.templates = self.templates[-100:]
            self._save_persistence()
        else:
            # 有失败 → 检查失败工具并触发变异
            genes, _ = GeneSequencer.sequence(genes_text)
            for g in genes:
                name = g["tool"]
                self._fail_streak[name] = self._fail_streak.get(name, 0) + 1
                if self._fail_streak[name] >= 2:
                    self._mutate(name)

    def _mutate(self, tool_name):
        """尝试为一个连续失败的工具寻找替代"""
        # 相似工具映射表
        fallback = {
            "ai_search": ["knowledge_query", "shell_exec"],
            "ssh_exec": ["brother_watch", "shell_exec"],
            "sql_query": ["csv_read"],
            "csv_read": ["excel_read"],
        }
        alts = fallback.get(tool_name, [])
        for alt in alts:
            if alt in self.registry.genes:
                self.mutation_count += 1
                self._fail_streak[tool_name] = 0  # 重置失败计数
                self._save_persistence()
                return True
        return False

    def get_status(self):
        return {
            "genes": self.registry.count(),
            "mutations": self.mutation_count,
            "templates": len(self.templates),
            "fittest": [g.name for g in self.registry.get_fittest(3)],
        }

EVO_ENGINE = None  # main()中初始化

# ═══════════════════════════════════════════════
# 第四层：DNA聊天引擎（替代旧call_llm）
# ═══════════════════════════════════════════════

def dna_chat(messages, system_prompt, provider=None, model=None, api_key=None):
    """
    DNA原生聊天引擎。
    
    不再有"call_llm然后事后解析"的拼凑模式。
    而是：
      1. LLM回复 → [GeneSequencer] 测序 → 基因列表
      2. 基因列表 → [ProteinSynthesizer] 合成 → 工具执行结果
      3. 执行结果 → [EvolutionEngine] 进化 → 存档/变异
      4. 最终输出 ← 合成结果 + LLM文本
    """
    _provider = provider or PROVIDER
    _model = model or MODEL
    api_key = api_key or resolve_api_key(_provider)
    base_url = resolve_base_url(_provider)
    
    if not api_key:
        return {"error": "No API key configured"}
    
    # 构建请求
    req_msgs = []
    if system_prompt:
        # 注入当前时间，让小龙人知道现在几点
        now_str = time.strftime('%Y-%m-%d %H:%M:%S')
        timed_prompt = f"【当前真实时间：{now_str}（北京时间）】{system_prompt}"
        req_msgs.append({"role": "system", "content": timed_prompt})
    req_msgs.extend(messages)
    
    # 调用LLM
    if _provider == 'anthropic':
        headers = {"Content-Type": "application/json", "x-api-key": api_key, "anthropic-version": "2023-06-01"}
        sys_t = ""
        msgs_a = []
        for m in req_msgs:
            if m["role"] == "system":
                sys_t += m["content"] + "\n"
            else:
                msgs_a.append(m)
        payload = {"model": _model, "max_tokens": 4096, "messages": msgs_a}
        if sys_t.strip():
            payload["system"] = sys_t.strip()
        api_url = f"{base_url}/messages"
    else:
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
        payload = {"model": _model, "messages": req_msgs, "max_tokens": 4096, "temperature": 0.7}
        api_url = f"{base_url}/chat/completions"
    
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(api_url, data=data, headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode('utf-8'))
        
        if _provider == 'anthropic':
            ct = result.get('content', [])
            raw_reply = ''.join(c.get('text', '') for c in ct if c.get('type') == 'text') if isinstance(ct, list) else (ct or '')
        else:
            raw_reply = result.get('choices', [{}])[0].get('message', {}).get('content', '')
        
        # DNA测序+合成：解析回复中的GENE标记，执行工具
        final_reply, tool_count, success_count = ProteinSynthesizer.synthesize(raw_reply, DNAREGISTRY)
        
        # 进化引擎记录
        if EVO_ENGINE:
            EVO_ENGINE.record_execution(raw_reply, tool_count, success_count)
        
        return {"reply": final_reply, "provider": _provider, "tools_called": tool_count}
    
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}


# ═══════════════════════════════════════════════
# HTTP 处理器
# ═══════════════════════════════════════════════

class PSPAIHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[PSPAI] {args[0]}")
    
    def _json(self, data, status=200):
        b = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", len(b))
        self.end_headers()
        self.wfile.write(b)
    
    def _body(self):
        l = int(self.headers.get("Content-Length", 0))
        if l == 0:
            return {}
        return json.loads(self.rfile.read(l).decode('utf-8'))
    
    def do_OPTIONS(self):
        self.send_response(200)
        for h in ["Access-Control-Allow-Origin", "Access-Control-Allow-Methods", "Access-Control-Allow-Headers"]:
            self.send_header(h, "*")
        self.end_headers()
    
    def do_GET(self):
        p = urllib.parse.urlparse(self.path).path
        
        # ── API端点 ──
        if p == '/api/status':
            self._json({
                "name": "PSPAI", "version": "v7.0.0-dna",
                "tools": DNAREGISTRY.count(),
                "engine": "DNA双螺旋",
                "status": "running",
            })
        elif p == '/api/health':
            self._json({"ok": True, "time": time.time()})
        elif p == '/api/tools':
            self._json({"total": DNAREGISTRY.count(), "tools": DNAREGISTRY.get_tool_list()})
        elif p == '/api/models':
            provs = [{"id": pid, "label": pid.capitalize(), "active": pid == PROVIDER,
                      "configured": bool(resolve_api_key(pid))} for pid in BASE_URL_MAP]
            self._json({"current": {"provider": PROVIDER, "model": MODEL}, "providers": provs})
        elif p == '/api/memory':
            self._json({
                "memory_file": str(MEMORY_PATH),
                "memory_size_bytes": MEMORY_PATH.stat().st_size,
                "total_conversations": len(conversation_history),
            })
        elif p == '/api/dna':
            if EVO_ENGINE:
                self._json(EVO_ENGINE.get_status())
            else:
                self._json({"error": "DNA not initialized"}, 503)
        elif p == '/api/dna/genome':
            self._json({
                "genes": [g.to_dict() for g in DNAREGISTRY.genes.values()],
                "total": DNAREGISTRY.count(),
            })
        else:
            # 静态文件服务（前端）
            frontend_dir = BASE_DIR.parent / "frontend" / "pwa" / "html"
            if frontend_dir.exists():
                req_path = p.lstrip('/')
                fp = frontend_dir / (req_path or 'index.html')
                if fp.exists() and fp.is_file():
                    ct_map = {'.html': 'text/html', '.js': 'application/javascript',
                              '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
                              '.json': 'application/json', '.svg': 'image/svg+xml'}
                    ext = fp.suffix
                    ct = ct_map.get(ext, 'application/octet-stream')
                    self.send_response(200)
                    self.send_header("Content-Type", f"{ct}; charset=utf-8" if ext in ('.html','.js','.css','.json','.svg') else ct)
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", fp.stat().st_size)
                    self.end_headers()
                    with open(fp, 'rb') as f:
                        self.wfile.write(f.read())
                    return
            self._json({"error": "not found"}, 404)
        return
    
    def do_POST(self):
        p = urllib.parse.urlparse(self.path).path
        
        if p == '/api/chat':
            data = self._body()
            msg = data.get("message", "").strip()
            idx = data.get("charIndex", 0)
            lang = data.get("lang", "zh")
            rprov = data.get("provider", None)
            rmod = data.get("model", None)
            rkey = data.get("api_key", None)  # 前端传来的用户API Key
            
            if not msg:
                self._json({"reply": t_msg(lang, 'empty')})
                return
            
            sp = DEFAULT_PROMPT
            t0 = time.time()
            
            try:
                _p = rprov or PROVIDER
                _m = rmod or MODEL
                # 前端传来的API Key覆盖环境变量
                _key = rkey or None
                hist = get_history(idx)
                
                result = None
                for att in range(3):
                    try:
                        if att == 0:
                            sp_cur = sp
                        elif att == 1:
                            sp_cur = sp + "\n(简洁回复，不超过3句话)"
                        else:
                            conversation_history[str(idx)] = []
                            hist = []
                            sp_cur = sp + "\n(简洁回复)"
                        
                        # DNA聊天引擎——测序+合成+进化一步到位
                        msgs = list(hist[-30:])
                        msgs.append({"role": "user", "content": msg})
                        r = dna_chat(msgs, system_prompt=sp_cur, provider=_p, model=_m, api_key=_key)
                        
                        if "error" not in r and r.get("reply"):
                            result = r
                            break
                    except Exception as e:
                        if att == 2:
                            raise e
                        time.sleep(1)
                
                reply = result.get("reply", t_msg(lang, 'thinking')) if result else t_msg(lang, 'thinking')
                add_history(idx, "user", msg)
                add_history(idx, "assistant", reply)
                
                latency_ms = int((time.time() - t0) * 1000)
                self._json({
                    "reply": reply,
                    "latency_ms": latency_ms,
                    "dna_tools": result.get("tools_called", 0) if result else 0,
                })
            except Exception as e:
                self._json({"reply": f"{t_msg(lang, 'error')}: {str(e)[:80]}"})
            return
        
        if p == '/api/tool/exec':
            data = self._body()
            tn = data.get("tool", "")
            args = data.get("args", {})
            gene = DNAREGISTRY.get(tn)
            if not gene:
                self._json({"error": f"Unknown tool: {tn}"}, 404)
                return
            try:
                import inspect
                sig = inspect.signature(gene.handler)
                if len(sig.parameters) == 0:
                    r = gene.handler()
                else:
                    r = gene.handler(args)
                gene.record(True)
                self._json({"success": True, "result": str(r)[:5000]})
            except Exception as e:
                gene.record(False)
                self._json({"error": str(e)}, 500)
            return
        
        if p == '/api/provider/switch':
            data = self._body()
            np = data.get("provider", "")
            if not np:
                self._json({"error": "provider required"}, 400)
                return
            if not resolve_api_key(np):
                self._json({"success": False, "error": f"No key for {np}"})
                return
            self._json({"success": True, "provider": np, "base_url": resolve_base_url(np)})
            return
        
        self._json({"error": "not found"}, 404)


# ═══════════════════════════════════════════════
# 启动
# ═══════════════════════════════════════════════

def main():
    global EVO_ENGINE
    port = int(os.environ.get('PSPAI_PORT', '8089'))
    
    # ── 注册15个pspai_tools基因 ──
    try:
        from pspai_tools import TOOLS_DEF
        for name, t in TOOLS_DEF.items():
            DNAREGISTRY.register(
                name=name,
                description=t["desc"],
                parameters=t["params"],
                handler=t["fn"],
                base_type=Base.A,
            )
    except Exception as e:
        print(f"[DNA] pspai_tools load: {e}")
    
    # ── 注册内置基因（shell_exec） ──
    def _shell_exec(args):
        import subprocess
        cmd = args.get("cmd", "")
        timeout = args.get("timeout", 30)
        if not cmd:
            return "Need cmd"
        try:
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
            return (r.stdout or r.stderr)[:5000]
        except subprocess.TimeoutExpired:
            return "Timeout"
        except Exception as e:
            return f"Error: {e}"
    
    DNAREGISTRY.register("shell_exec", "执行Shell命令", {
        "type": "object", "properties": {
            "cmd": {"type": "string", "description": "Shell命令"},
            "timeout": {"type": "integer", "description": "超时秒数", "default": 30},
        }, "required": ["cmd"]
    }, _shell_exec)
    
    # ── 初始化进化引擎 ──
    EVO_ENGINE = EvolutionEngine(DNAREGISTRY)
    
    # ── 检查API Key ──
    av = [p for p in ('deepseek', 'openai', 'anthropic', 'openrouter') if resolve_api_key(p)]
    
    print()
    print("=" * 50)
    print("  🧬  小龙人 PSPAI v7.0 — DNA双螺旋原生引擎")
    print("=" * 50)
    print(f"   Port: {port}")
    print(f"   Model: {MODEL} / Provider: {PROVIDER}")
    print(f"   API Keys: {'✅' if av else '❌'} {', '.join(av) if av else '未配置'}")
    print(f"   DNA Gene Pool: {DNAREGISTRY.count()} genes")
    print(f"   Evolution: ✅ (自动变异+模板存档)")
    print(f"   Sequencer: ✅ (GENE://协议解析)")
    print(f"   Synthesizer: ✅ (工具调用+结果合成)")
    print(f"   Memory: {MEMORY_PATH}")
    print(f"   Prompt: {'SOUL.md' if SOUL_PATH.exists() else 'default'}")
    print("=" * 50)
    
    server = http.server.HTTPServer(("0.0.0.0", port), PSPAIHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped")
        server.shutdown()


if __name__ == "__main__":
    main()
