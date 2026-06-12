/**
 * 小龙人插件加载器 v1.0
 * 动态加载、注册、路由插件——加功能不改内核
 */

const XLR = (function() {
  'use strict';
  
  const plugins = {};
  const toolMap = {};       // tool_name → {plugin, handler}
  const allTools = [];      // 所有已注册工具定义
  let loadOrder = [];
  
  // 桥接存储（插件产数据→Agent消费）
  const bridgeStore = {};
  
  // 健康记录（错误计数+最后活跃时间）
  const healthLog = {};

  return {
    // ============================================================
    // 注册插件（插件文件调用此方法）
    // ============================================================
    registerPlugin(plugin) {
      const { name, version, tools, handlers, onLoad, onUnload } = plugin;
      
      if (plugins[name]) {
        console.warn(`[XLR] 插件 "${name}" 已注册，跳过重复加载`);
        return false;
      }

      // 注册工具
      const toolCount = (tools || []).length;
      for (const tool of (tools || [])) {
        const toolName = typeof tool === 'string' ? tool : tool.function?.name;
        if (!toolName) continue;
        
        if (toolMap[toolName]) {
          console.warn(`[XLR] 工具 "${toolName}" 已被插件 "${toolMap[toolName].plugin}" 注册，跳过`);
          continue;
        }
        
        toolMap[toolName] = { plugin: name, handler: handlers?.[toolName] };
        if (typeof tool === 'object') allTools.push(tool);
      }

      plugins[name] = {
        name, version: version || '0.1.0', toolCount,
        handlers: handlers || {},
        onLoad, onUnload,
        loaded: false,
      };
      
      loadOrder.push(name);
      console.log(`[XLR] ✅ 插件 "${name}" v${version} 已注册 (${toolCount}个工具)`);
      return true;
    },

    // ============================================================
    // 初始化所有插件（由内核启动时调用）
    // ============================================================
    async initAll(coreEngine) {
      const results = [];
      for (const name of loadOrder) {
        const p = plugins[name];
        if (!healthLog[name]) healthLog[name] = { errors: 0, lastActive: Date.now() };
        try {
          if (p.onLoad) await p.onLoad(coreEngine);
          p.loaded = true;
          healthLog[name].lastActive = Date.now();
          results.push({ name, status: 'ok' });
        } catch (e) {
          console.error(`[XLR] ❌ 插件 "${name}" 初始化失败:`, e);
          healthLog[name].errors++;
          results.push({ name, status: 'error', error: e.message });
        }
      }
      
      // 初始化后自动自诊断
      const diag = XLR.selfDiagnose();
      console.log(`[XLR] 🔍 自诊断: ${diag.grade} — ${diag.summary}`);
      if (diag.issues.length > 0) {
        console.warn(`[XLR] ⚠️ 发现问题:`, diag.issues);
      }
      
      return results;
    },

    // ============================================================
    // 执行工具调用（内核调用此方法分发到插件）
    // ============================================================
    async execute(toolName, args) {
      const entry = toolMap[toolName];
      if (!entry) {
        return null;
      }
      
      try {
        const result = await entry.handler(args);
        // 记录成功执行
        if (healthLog[entry.plugin]) {
          healthLog[entry.plugin].lastActive = Date.now();
        }
        return result;
      } catch (e) {
        console.error(`[XLR] 工具 "${toolName}" 执行失败:`, e);
        // 记录错误
        if (healthLog[entry.plugin]) {
          healthLog[entry.plugin].errors++;
        }
        return JSON.stringify({ error: `${toolName}: ${e.message}` });
      }
    },

    // ============================================================
    // 查询接口
    // ============================================================
    getAllTools() {
      return allTools;
    },

    getToolCount() {
      return Object.keys(toolMap).length;
    },

    getPlugins() {
      return Object.entries(plugins).map(([name, p]) => ({
        name, version: p.version,
        tools: p.toolCount, loaded: p.loaded,
      }));
    },

    hasTool(name) {
      return name in toolMap;
    },

    getToolPlugin(name) {
      return toolMap[name]?.plugin || null;
    },

    // ============================================================
    // 动态加载外部插件文件
    // ============================================================
    async loadPluginFile(url) {
      try {
        // 安全校验：只允许同域相对路径或同源绝对路径
        if (!url || url.startsWith('http://') || url.startsWith('//')) {
          throw new Error(`不安全的插件URL: ${url}。只允许相对路径或HTTPS`);
        }
        if (url.startsWith('https://') && !url.includes(window.location.hostname)) {
          throw new Error(`跨域插件URL被拒绝: ${url}`);
        }
        
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const code = await resp.text();
        // CSP-safe: 先检测eval可用性，不可用则用Blob URL
        let fn;
        try {
          fn = new Function('XLR', code);
        } catch (cspErr) {
          console.warn(`[XLR] CSP限制new Function()，尝试Blob URL加载: ${url}`);
          const blob = new Blob(['(function(XLR){' + code + '})'], {type: 'application/javascript'});
          const blobUrl = URL.createObjectURL(blob);
          try {
            await import(blobUrl).then(m => m.default?.(XLR));
            URL.revokeObjectURL(blobUrl);
            const lastName = loadOrder[loadOrder.length - 1];
            return { status: 'ok', plugin: lastName, fallback: 'blob' };
          } catch (blobErr) {
            URL.revokeObjectURL(blobUrl);
            return { status: 'error', error: `CSP+Blob双失败: ${blobErr.message}` };
          }
        }
        fn(XLR);
        // 初始化最后一个加载的插件
        const lastName = loadOrder[loadOrder.length - 1];
        if (lastName && plugins[lastName]?.onLoad) {
          await plugins[lastName].onLoad();
          plugins[lastName].loaded = true;
        }
        return { status: 'ok', plugin: lastName };
      } catch (e) {
        return { status: 'error', error: e.message };
      }
    },

    // ============================================================
    // 自诊断 — "应该≠实际"对照表
    // ============================================================
    selfDiagnose() {
      const issues = [];
      const expectedTools = [];
      
      for (const [name, p] of Object.entries(plugins)) {
        const pluginTools = Object.keys(toolMap).filter(t => toolMap[t].plugin === name);
        expectedTools.push({ plugin: name, declared: p.toolCount, registered: pluginTools.length });
        
        if (pluginTools.length < p.toolCount) {
          issues.push(`${name}: 声明${p.toolCount}工具/实际注册${pluginTools.length}`);
        }
        if (!p.loaded) {
          issues.push(`${name}: 未初始化`);
        }
      }
      
      const totalPlugins = Object.keys(plugins).length;
      const loadedPlugins = Object.values(plugins).filter(p => p.loaded).length;
      const totalTools = Object.keys(toolMap).length;
      
      let grade, summary;
      if (issues.length === 0 && loadedPlugins === totalPlugins) {
        grade = '🟢 健康';
        summary = `${totalPlugins}插件/${totalTools}工具 全部正常`;
      } else if (loadedPlugins >= totalPlugins - 1 && issues.length <= 1) {
        grade = '🟡 注意';
        summary = `${loadedPlugins}/${totalPlugins}插件就绪 ${issues.length}个问题`;
      } else {
        grade = '🔴 异常';
        summary = `仅${loadedPlugins}/${totalPlugins}就绪 ${issues.length}个问题`;
      }
      
      return { grade, summary, plugins: totalPlugins, loadedPlugins, tools: totalTools, expected: expectedTools, issues, timestamp: Date.now() };
    },

    // ============================================================
    // 桥接 — 插件产数据→Agent消费
    // ============================================================
    bridge(name, data) {
      bridgeStore[name] = { data, timestamp: Date.now(), consumed: false };
      console.log(`[XLR] 🌉 桥接 "${name}" 已就绪`);
    },

    readBridge(name) {
      const entry = bridgeStore[name];
      if (!entry) return null;
      entry.consumed = true;
      return entry;
    },

    listBridges() {
      return Object.entries(bridgeStore)
        .filter(([, v]) => !v.consumed)
        .map(([k, v]) => ({ name: k, timestamp: v.timestamp }));
    },

    // ============================================================
    // 健康扫描
    // ============================================================
    healthCheck() {
      const now = Date.now();
      const results = [];
      
      for (const [name, p] of Object.entries(plugins)) {
        const log = healthLog[name] || { errors: 0, lastActive: 0 };
        const loadScore = p.loaded ? 4 : 0;
        const errorScore = log.errors === 0 ? 3 : log.errors <= 2 ? 2 : log.errors <= 5 ? 1 : 0;
        const inactiveMinutes = (now - (log.lastActive || 0)) / 60000;
        const activeScore = inactiveMinutes < 30 ? 3 : inactiveMinutes < 120 ? 2 : inactiveMinutes < 360 ? 1 : 0;
        const total = loadScore + errorScore + activeScore;
        
        let grade;
        if (total >= 9) grade = '🟢';
        else if (total >= 6) grade = '🟡';
        else if (total >= 3) grade = '🟠';
        else grade = '🔴';
        
        results.push({
          plugin: name, version: p.version,
          scores: { load: loadScore, error: errorScore, active: activeScore },
          total, grade,
          details: { loaded: p.loaded, tools: p.toolCount, errors: log.errors, inactiveMin: Math.round(inactiveMinutes) }
        });
      }
      
      const ok = results.filter(r => r.grade === '🟢').length;
      return {
        grade: results.every(r => r.grade === '🟢') ? '🟢 全健康' : results.some(r => r.grade === '🔴') ? '🔴 有腐烂' : '🟡 基本正常',
        timestamp: now,
        plugins: results,
        summary: `${results.length}插件: ${ok}健康/${results.length-ok}需关注`,
      };
    },

    // ============================================================
    // 插件状态报告
    // ============================================================
    report() {
      return {
        totalPlugins: Object.keys(plugins).length,
        totalTools: Object.keys(toolMap).length,
        plugins: Object.entries(plugins).map(([name, p]) => ({
          name, version: p.version,
          tools: p.toolCount,
          status: p.loaded ? '✅' : '⏳',
        })),
      };
    },
  };
})();
