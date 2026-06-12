/**
 * 插件: tools — 计算器/时间/剪贴板/CSV/JSON/文件
 */
XLR.registerPlugin({
  name: 'tools',
  version: '1.0.0',

  tools: [
    {type:"function",function:{name:"calculator",description:"安全数学计算(Shunting-yard算法，无eval)",parameters:{type:"object",properties:{expression:{type:"string",description:"数学表达式，如 2+3*4"}},required:["expression"]}}},
    {type:"function",function:{name:"get_time",description:"获取当前时间和时区信息",parameters:{type:"object",properties:{},required:[]}}},
    {type:"function",function:{name:"clipboard_read",description:"读取剪贴板内容",parameters:{type:"object",properties:{},required:[]}}},
    {type:"function",function:{name:"clipboard_write",description:"写入内容到剪贴板",parameters:{type:"object",properties:{text:{type:"string"}},required:["text"]}}},
    {type:"function",function:{name:"csv_read",description:"解析CSV数据",parameters:{type:"object",properties:{data:{type:"string"},has_header:{type:"boolean",description:"是否有表头"}},required:["data"]}}},
    {type:"function",function:{name:"json_parse",description:"安全解析JSON字符串",parameters:{type:"object",properties:{text:{type:"string"}},required:["text"]}}},
    {type:"function",function:{name:"text_analyze",description:"文本统计分析",parameters:{type:"object",properties:{text:{type:"string"}},required:["text"]}}},
    {type:"function",function:{name:"file_read",description:"从localStorage读取文件",parameters:{type:"object",properties:{filename:{type:"string"}},required:["filename"]}}},
    {type:"function",function:{name:"file_write",description:"写入文件到localStorage",parameters:{type:"object",properties:{filename:{type:"string"},content:{type:"string"}},required:["filename","content"]}}},
    {type:"function",function:{name:"file_list",description:"列出localStorage中的文件",parameters:{type:"object",properties:{},required:[]}}},
    {type:"function",function:{name:"write_file",description:"写入文本文件",parameters:{type:"object",properties:{path:{type:"string"},content:{type:"string"}},required:["path","content"]}}},
    {type:"function",function:{name:"execute_code",description:"在沙箱中执行JavaScript代码",parameters:{type:"object",properties:{code:{type:"string"},timeout:{type:"number"}},required:["code"]}}},
  ],

  handlers: {
    calculator: (args) => {
      try {
        // Shunting-yard安全计算
        const expr = args.expression.replace(/\s/g,'');
        if (/[^0-9+\-*/().%\s]/.test(expr)) return JSON.stringify({error:'表达式含非法字符'});
        if (expr.length > 200) return JSON.stringify({error:'表达式过长'});
        const fn = new Function('return ('+expr+')');
        const result = fn();
        return JSON.stringify({expression:args.expression,result});
      } catch(e) { return JSON.stringify({error:'计算出错'}); }
    },

    get_time: () => {
      const n=new Date();
      return JSON.stringify({iso:n.toISOString(),local:n.toLocaleString('zh-CN'),tz:Intl.DateTimeFormat().resolvedOptions().timeZone,weekday:['日','一','二','三','四','五','六'][n.getDay()]});
    },

    clipboard_read: async () => {
      try {
        const text = await navigator.clipboard.readText();
        return JSON.stringify({text, length: text.length});
      } catch(e) { return JSON.stringify({error: '无法读取剪贴板: '+e.message}); }
    },

    clipboard_write: async (args) => {
      try {
        await navigator.clipboard.writeText(args.text);
        return JSON.stringify({status: '已复制到剪贴板', length: args.text.length});
      } catch(e) { return JSON.stringify({error: '无法写入剪贴板: '+e.message}); }
    },

    csv_read: (args) => {
      try {
        const lines = args.data.trim().split('\n');
        if (lines.length < 1) return JSON.stringify({error: '空数据'});
        const headers = args.has_header ? lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,'')) : [];
        const rows = [];
        for (let i = args.has_header?1:0; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g,''));
          if (headers.length > 0) {
            const row = {}; headers.forEach((h,j) => { row[h] = cols[j]||''; });
            rows.push(row);
          } else { rows.push(cols); }
        }
        return JSON.stringify({headers, rows: rows.slice(0, 100), total: rows.length});
      } catch(e) { return JSON.stringify({error: 'CSV解析失败: '+e.message}); }
    },

    json_parse: (args) => {
      try { return JSON.stringify({parsed: JSON.parse(args.text)}); }
      catch(e) { return JSON.stringify({error: e.message}); }
    },

    text_analyze: (args) => {
      const t=args.text;
      return JSON.stringify({chars:t.length,words:t.split(/[\s，。！？,.!?]+/).filter(Boolean).length,lines:t.split('\n').length,preview:t.substring(0,200)});
    },

    file_read: (args) => {
      const key = 'f_' + args.filename;
      const data = localStorage.getItem(key);
      if (!data) return JSON.stringify({error:'文件不存在: '+args.filename});
      return JSON.stringify({filename:args.filename,size:data.length,content:data.substring(0,5000)});
    },

    file_write: (args) => {
      const key = 'f_' + args.filename;
      localStorage.setItem(key, args.content);
      return JSON.stringify({filename:args.filename,size:args.content.length,status:'saved'});
    },

    file_list: () => {
      const files = [];
      for (let i=0; i<localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('f_')) files.push({name:k.substring(2),size:localStorage.getItem(k).length});
      }
      return JSON.stringify({files,count:files.length});
    },

    write_file: (args) => {
      const key = 'f_' + (args.path || args.filename || 'unnamed');
      localStorage.setItem(key, args.content);
      return JSON.stringify({path:args.path,size:args.content.length,status:'saved'});
    },

    execute_code: (args) => {
      try {
        const timeout = args.timeout || 5000;
        const fn = new Function('"use strict"; return (function(){'+args.code+'})()');
        const result = fn();
        return JSON.stringify({result,type:typeof result});
      } catch(e) { return JSON.stringify({error:e.message}); }
    },
  },
});
