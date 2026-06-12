/**
 * 小龙人 PSPAI 前端桥接层 v2.0
 * 纯UI桥接——所有逻辑走后端API，前端只做展示和用户交互
 * 
 * 后端地址: pspai_server.py (默认 :8089)
 * 通信协议: REST JSON (/api/chat, /api/tool/exec, /api/*)
 */

// ===================================================================
// 配置
// ===================================================================
const API_BASE = window.location.origin || 'http://localhost:8089';

// ===================================================================
// XiaoLongRen Client — 轻量桥接客户端
// ===================================================================
class XiaoLongRen {
  constructor(cfg = {}) {
    this.provider = cfg.provider || 'deepseek';
    this.model = cfg.model || 'deepseek-v4-flash';
    this.apiKey = cfg.apiKey || '';
    this.baseUrl = cfg.baseUrl || '';
    this.charIndex = cfg.charIndex || 0;
    this.lang = cfg.lang || 'zh';
    this.onThink = cfg.onThink || (() => {});
    this.onTool = cfg.onTool || (() => {});
    this.onReply = cfg.onReply || (() => {});
    this.onErr = cfg.onErr || (() => {});
  }

  /** 发消息到后端，返回AI回复 */
  async run(userMsg) {
    try {
      this.onThink(1);
      const resp = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          charIndex: this.charIndex,
          lang: this.lang,
          provider: this.provider,
          model: this.model,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`服务器错误 ${resp.status}: ${errText.substring(0, 100)}`);
      }
      const data = await resp.json();
      if (data.dna_tools > 0) {
        this.onTool('dna', { count: data.dna_tools });
      }
      this.onReply();
      return data.reply || '（未收到回复）';
    } catch (err) {
      this.onErr(err);
      throw err;
    }
  }

  /** 直接调用后端工具 */
  async execTool(toolName, args = {}) {
    const resp = await fetch(`${API_BASE}/api/tool/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: toolName, args }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || '工具调用失败');
    return data.result;
  }

  /** 获取DNA进化状态 */
  async getDNAStatus() {
    const resp = await fetch(`${API_BASE}/api/dna`);
    return await resp.json();
  }

  /** 获取工具列表 */
  async getTools() {
    const resp = await fetch(`${API_BASE}/api/tools`);
    return await resp.json();
  }

  /** 测试API连接 */
  async testConnection(provider, apiKey, model, baseUrl) {
    const ep = baseUrl 
      ? baseUrl.replace(/\/+$/, '') + '/chat/completions'
      : ({ deepseek:'https://api.deepseek.com/v1', openai:'https://api.openai.com/v1',
          moonshot:'https://api.moonshot.cn/v1', zhipu:'https://open.bigmodel.cn/api/paas/v4',
          qwen:'https://dashscope.aliyuncs.com/compatible-mode/v1',
          anthropic:'https://api.anthropic.com/v1' }[provider] || '') + '/chat/completions';
    if (!apiKey) return { ok: false, msg: '请填写API Key' };
    const resp = await fetch(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: model || 'deepseek-v4-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
    });
    if (resp.ok) return { ok: true, msg: '连接成功' };
    const text = await resp.text().catch(() => '');
    return { ok: false, msg: `HTTP ${resp.status}: ${text.substring(0, 100)}` };
  }
}


// ===================================================================
// 本地存储工具（IndexedDB — 仅用于前端UI状态，不存核心逻辑）
// ===================================================================
const DB_NAME = 'PSPAI_UI';
const DB_VER = 1;

async function uiDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config');
      if (!db.objectStoreNames.contains('conversations')) db.createObjectStore('conversations', { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbGet(store, key) {
  const db = await uiDB();
  return new Promise((resolve) => {
    const t = db.transaction(store, 'readonly');
    const r = t.objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
  });
}

async function dbSet(store, key, val) {
  const db = await uiDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const r = t.objectStore(store).put(val, key);
    r.onsuccess = () => resolve();
    r.onerror = (e) => reject(e.target.error);
  });
}


// ===================================================================
// 工具函数
// ===================================================================
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatTime() {
  const n = new Date();
  return n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
}

function getCharName(id) {
  const names = { longyuan:'龙渊', chiyu:'赤羽', ling:'凌', qingmo:'轻墨', shuanghua:'霜华', yeying:'夜影' };
  return names[id] || '小龙人';
}


// ===================================================================
// UI 操作函数
// ===================================================================
let isBusy = false;
let agent = null;
let charId = 'longyuan';
let convId = 'default';

function gcfg() {
  try { return JSON.parse(localStorage.getItem('xlr_cfg') || '{}'); }
  catch(e) { return {}; }
}
function scfg(c) { localStorage.setItem('xlr_cfg', JSON.stringify(c)); }

function initAgent() {
  const c = gcfg();
  agent = new XiaoLongRen({
    provider: c.provider || 'deepseek',
    model: c.model || 'deepseek-v4-flash',
    apiKey: c.apiKey || '',
    baseUrl: c.baseUrl || '',
    charIndex: 0,
    lang: 'zh',
    onThink: (i) => {
      document.getElementById('sd').classList.add('online');
      const el = document.querySelector('#msgs .msg.ai:last-child .tool-note');
      if (el) el.textContent = '⚡ DNA思考中...';
    },
    onTool: (name, args) => {
      const el = document.querySelector('#msgs .msg.ai:last-child .tool-note');
      if (el) el.textContent = '🔧 调用基因工具...';
    },
    onReply: () => { document.getElementById('sd').classList.add('online'); },
    onErr: () => { document.getElementById('sd').classList.remove('online'); },
  });
}

function addMsg(type, text) {
  const d = document.getElementById('msgs');
  const eh = document.getElementById('empty-hint');
  if (eh) eh.remove();
  const el = document.createElement('div');
  el.className = 'msg ' + type;
  el.innerHTML = '<div class="mb">' + esc(text) + '</div><div class="mtime">' + formatTime() + '</div>';
  d.appendChild(el);
  d.scrollTop = d.scrollHeight;
  return el;
}

function showLoading() {
  const d = document.getElementById('msgs');
  if (document.getElementById('empty-hint')) document.getElementById('empty-hint').remove();
  const el = document.createElement('div');
  el.className = 'msg ai';
  el.innerHTML = '<div class="mb"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
  d.appendChild(el);
  d.scrollTop = d.scrollHeight;
  return el;
}

async function sendText() {
  if (isBusy) return;
  const inp = document.getElementById('text-input');
  const text = inp.value.trim();
  if (!text) return;
  const c = gcfg();
  if (!c.apiKey) {
    addMsg('ai', '请先配置API Key → 点右上角⚙');
    return;
  }

  addMsg('user', text);
  inp.value = ''; inp.style.height = 'auto';
  isBusy = true;
  document.getElementById('send-btn').disabled = true;
  document.getElementById('sd').classList.remove('online');

  initAgent();
  const loadEl = showLoading();

  try {
    const reply = await agent.run(text);
    loadEl.remove();
    addMsg('ai', reply);
    document.getElementById('sd').classList.add('online');
  } catch (err) {
    loadEl.remove();
    addMsg('ai', '❌ ' + err.message);
    document.getElementById('sd').classList.remove('online');
  } finally {
    isBusy = false;
    document.getElementById('send-btn').disabled = false;
  }
}

function onKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
}


// ===================================================================
// 角色切换
// ===================================================================
function switchChar(id) {
  charId = id;
  document.getElementById('sel-avatar').src = 'img_' + id + '.jpg';
  document.getElementById('sel-name').textContent = getCharName(id);
  document.getElementById('empty-avatar').src = 'img_' + id + '.jpg';
  document.getElementById('char-picker').style.display = 'none';
}

function showCharPicker() {
  const names = { longyuan:'龙渊·沉稳', chiyu:'赤羽·热血', ling:'凌·冷峻',
                  qingmo:'轻墨·知性', shuanghua:'霜华·通透', yeying:'夜影·神秘' };
  const g = document.getElementById('char-grid');
  g.innerHTML = Object.entries(names).map(([k, v]) =>
    `<div onclick="switchChar('${k}')" style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;padding:8px;border-radius:12px;${k===charId?'background:rgba(200,168,78,0.15);border:1px solid rgba(200,168,78,0.3)':'border:1px solid rgba(255,255,255,0.06)'}">
       <div style="width:44px;height:44px;border-radius:50%;overflow:hidden;border:2px solid ${k===charId?'var(--gold)':'rgba(255,255,255,0.1)'}"><img src="img_${k}.jpg" style="width:100%;height:100%;object-fit:cover"></div>
       <span style="font-size:11px;color:${k===charId?'var(--gold)':'#aaa'};white-space:nowrap">${v}</span>
     </div>`
  ).join('');
  document.getElementById('char-picker').style.display = 'flex';
}


// ===================================================================
// 设置面板
// ===================================================================
function toggleSettings() {
  const p = document.getElementById('settings-panel');
  p.classList.toggle('show');
  if (p.classList.contains('show')) loadSettings();
}

function loadSettings() {
  const c = gcfg();
  document.getElementById('cfg-provider').value = c.provider || 'deepseek';
  document.getElementById('cfg-key').value = c.apiKey || '';
  document.getElementById('cfg-url').value = c.baseUrl || '';
  onProviderChange();
}

function onProviderChange() {
  const p = document.getElementById('cfg-provider').value;
  const s = document.getElementById('cfg-model'); s.innerHTML = '';
  const models = { deepseek:['deepseek-v4-flash','deepseek-reasoner'], openai:['gpt-4o','gpt-4o-mini'],
    moonshot:['moonshot-v1-8k'], zhipu:['glm-4-flash','glm-4-plus'], qwen:['qwen-turbo','qwen-plus'],
    anthropic:['claude-sonnet-4-20250514','claude-haiku-3.5'], custom:[] };
  if (p === 'custom') {
    s.innerHTML = '<option value="">(手动输入)</option>';
    document.getElementById('custom-url-sec').style.display = 'block';
  } else {
    (models[p] || []).forEach(m => { s.innerHTML += '<option value="'+m+'">'+m+'</option>'; });
    document.getElementById('custom-url-sec').style.display = 'none';
  }
}

async function testConnection() {
  const p = document.getElementById('cfg-provider').value;
  const k = document.getElementById('cfg-key').value.trim();
  const m = document.getElementById('cfg-model').value;
  const u = document.getElementById('cfg-url').value.trim();
  const r = document.getElementById('test-result');
  if (!k) { r.style.display='block'; r.innerHTML='<span style="color:#e74c3c">❌ 填写API Key</span>'; return; }
  r.style.display='block'; r.innerHTML='⏳ 测试中...';
  try {
    const agent = new XiaoLongRen();
    const res = await agent.testConnection(p, k, m, u);
    r.innerHTML = res.ok
      ? '<span style="color:#2ecc71">✅ 连接成功！</span>'
      : '<span style="color:#e74c3c">🔴 '+res.msg+'</span>';
  } catch(e) { r.innerHTML = '<span style="color:#e74c3c">🔴 网络不通: '+e.message+'</span>'; }
}

function saveAndClose() {
  scfg({
    provider: document.getElementById('cfg-provider').value,
    model: document.getElementById('cfg-model').value,
    apiKey: document.getElementById('cfg-key').value.trim(),
    baseUrl: document.getElementById('cfg-url').value.trim(),
  });
  document.getElementById('settings-panel').classList.remove('show');
  if (gcfg().apiKey) document.getElementById('sd').classList.add('online');
  initAgent();
}


// ===================================================================
// 启动
// ===================================================================
switchChar('longyuan');

function closeWelcome() {
  document.getElementById('welcome').classList.add('hide');
}

// 无API Key显示欢迎引导
if (!gcfg().apiKey) {
  document.getElementById('welcome').classList.remove('hide');
} else {
  document.getElementById('welcome').classList.add('hide');
  document.getElementById('sd').classList.add('online');
}

initAgent();

// 请求通知权限
if (Notification && Notification.permission === 'default') {
  Notification.requestPermission();
}
