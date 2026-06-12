/** 插件: knowledge — 知识库（localStorage持久化） */
(function(){
  function loadKB(){
    try{var r=localStorage.getItem('xlr_knowledge');return r?JSON.parse(r):[]}catch(e){return[]}
  }
  function saveKB(kb){
    try{localStorage.setItem('xlr_knowledge',JSON.stringify(kb))}catch(e){}
  }
  XLR.registerPlugin({
    name:'knowledge', version:'1.0.0',
    tools:[
      {type:"function",function:{name:"kb_store",description:"存入知识：将一条知识永久存储",parameters:{type:"object",properties:{title:{type:"string",description:"知识标题"},content:{type:"string",description:"知识内容"},tags:{type:"string",description:"标签（逗号分隔）"}},required:["title","content"]}}},
      {type:"function",function:{name:"kb_search",description:"搜索知识库",parameters:{type:"object",properties:{query:{type:"string",description:"搜索关键词"},limit:{type:"integer",description:"最多返回几条"}},required:["query"]}}},
      {type:"function",function:{name:"kb_list",description:"列出所有知识条目",parameters:{type:"object",properties:{tag:{type:"string",description:"按标签过滤"}},required:[]}}},
      {type:"function",function:{name:"kb_delete",description:"删除一条知识",parameters:{type:"object",properties:{title:{type:"string",description:"要删除的知识标题"}},required:["title"]}}},
      {type:"function",function:{name:"kb_stats",description:"知识库统计",parameters:{type:"object",properties:{},required:[]}}},
    ],
    handlers:{
      kb_store:function(args){
        var kb=loadKB();
        kb=kb.filter(function(k){return k.title!==(args&&args.title)});
        kb.push({title:args&&args.title||'',content:args&&args.content||'',tags:(args&&args.tags||'').split(',').map(function(t){return t.trim()}).filter(Boolean),created:new Date().toISOString(),updated:new Date().toISOString()});
        if(kb.length>500)kb=kb.slice(-500);
        saveKB(kb);
        return JSON.stringify({status:'stored',title:args&&args.title,total:kb.length});
      },
      kb_search:function(args){
        var kb=loadKB();
        var q=((args&&args.query)||'').toLowerCase();
        var limit=(args&&args.limit)||5;
        var res=kb.filter(function(k){return k.title.toLowerCase().indexOf(q)>=0||k.content.toLowerCase().indexOf(q)>=0}).slice(0,limit).map(function(k){return{title:k.title,content:k.content.substring(0,300),tags:k.tags,updated:k.updated}});
        return JSON.stringify({query:args&&args.query,found:res.length,results:res});
      },
      kb_list:function(args){
        var kb=loadKB();
        if(args&&args.tag)kb=kb.filter(function(k){return(k.tags||[]).indexOf(args.tag)>=0});
        return JSON.stringify({total:kb.length,items:kb.map(function(k){return{title:k.title,tags:k.tags,updated:k.updated}})});
      },
      kb_delete:function(args){
        var kb=loadKB();
        var before=kb.length;
        kb=kb.filter(function(k){return k.title!==(args&&args.title)});
        saveKB(kb);
        return JSON.stringify({status:'deleted',title:args&&args.title,removed:before-kb.length});
      },
      kb_stats:function(){
        var kb=loadKB();
        var tags={};
        kb.forEach(function(k){(k.tags||[]).forEach(function(t){tags[t]=(tags[t]||0)+1})});
        return JSON.stringify({total_entries:kb.length,total_chars:kb.reduce(function(s,k){return s+k.content.length},0),top_tags:Object.entries(tags).sort(function(a,b){return b[1]-a[1]}).slice(0,10).map(function(e){return{tag:e[0],count:e[1]}}),newest:kb.length?kb[kb.length-1].title:null});
      },
    },
    onLoad:function(){console.log('[knowledge] ✅');}
  });
})();
