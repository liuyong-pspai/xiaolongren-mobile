/**
 * 插件: search — 搜索/HTTP/网页提取
 */
XLR.registerPlugin({
  name: 'search',
  version: '1.0.0',
  
  tools: [
    {type:"function",function:{name:"web_search",description:"搜索互联网获取最新信息",parameters:{type:"object",properties:{query:{type:"string",description:"搜索关键词"}},required:["query"]}}},
    {type:"function",function:{name:"http_request",description:"发送HTTP请求",parameters:{type:"object",properties:{url:{type:"string"},method:{type:"string"},headers:{type:"string"},body:{type:"string"}},required:["url"]}}},
    {type:"function",function:{name:"html_parse",description:"解析HTML内容提取结构化数据",parameters:{type:"object",properties:{html:{type:"string"},selector:{type:"string",description:"text提取纯文本/links提取链接/forms提取表单"}},required:["html"]}}},
    {type:"function",function:{name:"web_extract",description:"从URL提取网页纯文本内容",parameters:{type:"object",properties:{url:{type:"string"}},required:["url"]}}},
  ],

  handlers: {
    web_search: async (args) => {
      // 走本地代理（绕开浏览器CORS限制）
      try {
        const ctrl = new AbortController();
        const tm = setTimeout(() => ctrl.abort(), 10000);
        const r = await fetch('/api/search?q='+encodeURIComponent(args.query), {
          signal: ctrl.signal
        });
        clearTimeout(tm);
        if (!r.ok) throw new Error('proxy status ' + r.status);
        const data = await r.json();
        if (data.results && data.results.length) {
          const lines = data.results.map(item =>
            (item.title ? item.title + ' - ' : '') + (item.snippet || '')
          );
          return JSON.stringify({engine:'proxy',query:args.query,results:lines});
        }
      } catch(e) {
        console.warn('[搜索] 本地代理失败:', e.message);
      }
      
      // 浏览器直连兜底（DuckDuckGo）
      try {
        const r = await fetch('https://html.duckduckgo.com/html/?q='+encodeURIComponent(args.query));
        const h = await r.text(); const s = [];
        const re = /class="result__snippet"[^>]*>(.*?)<\/a>/gs; let m;
        while ((m=re.exec(h))&&s.length<5) s.push(m[1].replace(/<[^>]*>/g,'').trim());
        if (s.length) return JSON.stringify({engine:'duckduckgo',query:args.query,results:s});
      } catch(e) {}
      
      return JSON.stringify({engine:'none',query:args.query,results:['搜索暂不可用，请检查网络或稍后重试']});
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
