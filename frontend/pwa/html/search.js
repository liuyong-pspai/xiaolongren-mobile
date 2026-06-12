/**
 * 插件: search — 搜索/HTTP/网页提取（蜂群天犬版）
 */
XLR.registerPlugin({
  name: 'search',
  version: '2.0.0',

  tools: [
    {type:"function",function:{name:"web_search",description:"搜索互联网获取最新信息——蜂群战术多引擎并行+天犬深度追踪",parameters:{type:"object",properties:{query:{type:"string",description:"搜索关键词"},mode:{type:"string",description:"搜索模式：standard=蜂群三引擎并行(默认), deep=蜂群+天犬深度BFS追踪"},limit:{type:"number",description:"返回结果数量（默认5）"}},required:["query"]}}},
    {type:"function",function:{name:"http_request",description:"发送HTTP请求",parameters:{type:"object",properties:{url:{type:"string"},method:{type:"string"},headers:{type:"string"},body:{type:"string"}},required:["url"]}}},
    {type:"function",function:{name:"html_parse",description:"解析HTML内容提取结构化数据",parameters:{type:"object",properties:{html:{type:"string"},selector:{type:"string",description:"text提取纯文本/links提取链接/forms提取表单"}},required:["html"]}}},
    {type:"function",function:{name:"web_extract",description:"从URL提取网页纯文本内容",parameters:{type:"object",properties:{url:{type:"string"}},required:["url"]}}},
  ],

  handlers: {
    web_search: async (args) => {
      const query = args.query || '';
      const mode = args.mode || 'standard';
      const limit = args.limit || 5;
      if (!query) return JSON.stringify({error:'请输入搜索关键词'});

      // 调用蜂群天犬后端（server_8092.py：Bing+百度+DDG并行/深度追踪）
      try {
        const ctrl = new AbortController();
        const tm = setTimeout(() => ctrl.abort(), 15000);
        const r = await fetch('http://192.168.1.35:8092/api/search?q='+encodeURIComponent(query)+'&mode='+encodeURIComponent(mode)+'&limit='+limit, {
          signal: ctrl.signal
        });
        clearTimeout(tm);
        if (!r.ok) throw new Error('search status ' + r.status);
        const data = await r.json();
        if (data.results && data.results.length) {
          const lines = data.results.map((item, i) => {
            const src = item.source || 'web';
            const icon = src === 'deep_hunt' ? '🐕' : src === 'baidu' ? '🐝百度' : src === 'bing' ? '🐝Bing' : src === 'ddg' ? '🐝DDG' : '🌐';
            const title = item.title ? item.title : '';
            const snippet = item.snippet ? item.snippet.substring(0,200) : '';
            return (i+1)+'. ['+icon+'] '+title + (snippet ? ' - '+snippet : '');
          });
          const modeLabel = mode === 'deep' ? '🐝蜂群+🐕天犬深度追踪' : '🐝蜂群三引擎并行';
          return JSON.stringify({engine:modeLabel, query:query, results:lines, total:data.results.length});
        }
        return JSON.stringify({engine:mode, query:query, results:['未找到相关结果']});

      } catch(e) {
        // 后端不可用，浏览器DuckDuckGo直连兜底
        try {
          const r = await fetch('https://html.duckduckgo.com/html/?q='+encodeURIComponent(query));
          const h = await r.text(); const s = [];
          const re = /class="result__snippet"[^>]*>(.*?)<\/a>/gs; let m;
          while ((m=re.exec(h))&&s.length<limit) s.push((s.length+1)+'. '+m[1].replace(/<[^>]*>/g,'').trim());
          if (s.length) return JSON.stringify({engine:'duckduckgo(兜底)',query:query,results:s});
        } catch(e2) {}
        return JSON.stringify({engine:'none',query:query,results:['搜索暂不可用，请检查网络或稍后重试']});
      }
    },

    http_request: async (args) => {
      try {
        const o={method:args.method||'GET',headers:{'User-Agent':'XiaoLongRen/6.0'}};
        if(args.headers)try{Object.assign(o.headers,JSON.parse(args.headers));}catch(e){}
        if(args.body)o.body=args.body;
        const r=await fetch(args.url,o); const t=await r.text();
        return JSON.stringify({status:r.status,url:args.url,body:t.substring(0,3000)});
      }catch(e){return JSON.stringify({error:e.message});}
    },

    html_parse: (args) => {
      try {
        const html = args.html;
        if(args.selector==='text'){
          const t=html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
          return JSON.stringify({text:t.substring(0,2000)});
        }
        if(args.selector==='links'){
          const re=/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi;
          const ls=[];let m;
          while((m=re.exec(html))&&ls.length<20)ls.push({href:m[1],text:m[2].trim()});
          return JSON.stringify({links:ls});
        }
        return JSON.stringify({error:'未知selector，支持: text/links/forms'});
      }catch(e){return JSON.stringify({error:e.message});}
    },

    web_extract: async (args) => {
      try{
        const r=await fetch(args.url);const h=await r.text();
        const t=h.replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
        return JSON.stringify({url:args.url,text:t.substring(0,2000)});
      }catch(e){return JSON.stringify({error:e.message});}
    },
  },
});
