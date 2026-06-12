/**
 * 插件: knowledge — 知识库（对标PSPAI L3知识底座）
 * 存储/检索/更新知识条目，localStorage持久化
 */
XLR.registerPlugin({
  name: 'knowledge',
  version: '1.0.0',

  tools: [
    {type:"function",function:{name:"kb_store",description:"存入知识：将一条知识永久存储",parameters:{type:"object",properties:{title:{type:"string",description:"知识标题"},content:{type:"string",description:"知识内容"},tags:{type:"string",description:"标签（逗号分隔）"}},required:["title","content"]}}},
    {type:"function",function:{name:"kb_search",description:"搜索知识库",parameters:{type:"object",properties:{query:{type:"string",description:"搜索关键词"},limit:{type:"integer",description:"最多返回几条"}},required:["query"]}}},
    {type:"function",function:{name:"kb_list",description:"列出所有知识条目",parameters:{type:"object",properties:{tag:{type:"string",description:"按标签过滤"}},required:[]}}},
    {type:"function",function:{name:"kb_delete",description:"删除一条知识",parameters:{type:"object",properties:{title:{type:"string",description:"要删除的知识标题"}},required:["title"]}}},
    {type:"function",function:{name:"kb_stats",description:"知识库统计",parameters:{type:"object",properties:{},required:[]}}},
  ],

  // 知识库加载/保存（闭包内私有）
  _loadKB: function() {
    try {
      var raw = localStorage.getItem('xlr_knowledge');
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  },
  
  _saveKB: function(kb) {
    try {
      localStorage.setItem('xlr_knowledge', JSON.stringify(kb));
    } catch(e) {}
  },

  handlers: {
    kb_store: function(args) {
      var kb = XLR._loadKB ? XLR._loadKB() : [];
      // 去重
      kb = kb.filter(function(k){ return k.title !== (args && args.title); });
      
      kb.push({
        title: args.title || '',
        content: args.content || '',
        tags: ((args.tags || '').split ? (args.tags||'').split(',').map(function(t){return t.trim();}).filter(Boolean) : []),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });
      
      if (kb.length > 500) kb = kb.slice(-500);
      if (XLR._saveKB) XLR._saveKB(kb);
      
      return JSON.stringify({ status: 'stored', title: args.title, total: kb.length });
    },

    kb_search: function(args) {
      var kb = XLR._loadKB ? XLR._loadKB() : [];
      var q = ((args && args.query) || '').toLowerCase();
      var limit = (args && args.limit) || 5;
      
      var results = kb.filter(function(k) {
        return k.title.toLowerCase().indexOf(q) >= 0 || 
               k.content.toLowerCase().indexOf(q) >= 0;
      });
      
      results = results.slice(0, limit).map(function(k) {
        return { title: k.title, content: k.content.substring(0, 300), tags: k.tags, updated: k.updated };
      });
      
      return JSON.stringify({ query: args && args.query, found: results.length, results: results });
    },

    kb_list: function(args) {
      var kb = XLR._loadKB ? XLR._loadKB() : [];
      if (args && args.tag) {
        kb = kb.filter(function(k) { return (k.tags || []).indexOf(args.tag) >= 0; });
      }
      var items = kb.map(function(k) { return { title: k.title, tags: k.tags, updated: k.updated }; });
      return JSON.stringify({ total: items.length, items: items });
    },

    kb_delete: function(args) {
      var kb = XLR._loadKB ? XLR._loadKB() : [];
      var before = kb.length;
      kb = kb.filter(function(k) { return k.title !== (args && args.title); });
      if (XLR._saveKB) XLR._saveKB(kb);
      return JSON.stringify({ status: 'deleted', title: args && args.title, removed: before - kb.length });
    },

    kb_stats: function() {
      var kb = XLR._loadKB ? XLR._loadKB() : [];
      var tags = {};
      kb.forEach(function(k) {
        (k.tags || []).forEach(function(t) { tags[t] = (tags[t] || 0) + 1; });
      });
      var totalChars = kb.reduce(function(s,k){ return s + k.content.length; }, 0);
      return JSON.stringify({
        total_entries: kb.length,
        total_chars: totalChars,
        top_tags: Object.entries(tags).sort(function(a,b){ return b[1]-a[1]; }).slice(0,10).map(function(e){ return {tag:e[0],count:e[1]}; }),
        newest: kb.length ? kb[kb.length-1].title : null,
      });
    },
  },

  onLoad: function() {
    // 把 _loadKB/_saveKB 挂到 XLR 上
    XLR._loadKB = function() {
      try { var raw = localStorage.getItem('xlr_knowledge'); return raw ? JSON.parse(raw) : []; } catch(e) { return []; }
    };
    XLR._saveKB = function(kb) {
      try { localStorage.setItem('xlr_knowledge', JSON.stringify(kb)); } catch(e) {}
    };
    console.log('[knowledge] 知识库插件已就绪');
  },
});
