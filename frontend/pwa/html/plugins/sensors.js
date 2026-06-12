/**
 * 插件: sensors — 通知/定时器/文件上传
 */
XLR.registerPlugin({
  name: 'sensors',
  version: '1.0.0',

  tools: [
    {type:"function",function:{name:"send_notification",description:"发送系统通知（需授权）",parameters:{type:"object",properties:{title:{type:"string"},body:{type:"string"}},required:["title","body"]}}},
    {type:"function",function:{name:"set_timer",description:"设置定时提醒",parameters:{type:"object",properties:{seconds:{type:"number"},message:{type:"string"}},required:["seconds","message"]}}},
    {type:"function",function:{name:"session_search",description:"搜索历史对话",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}}},
    {type:"function",function:{name:"todo_add",description:"添加待办事项",parameters:{type:"object",properties:{content:{type:"string"},priority:{type:"string"}},required:["content"]}}},
    {type:"function",function:{name:"todo_list",description:"列出待办事项",parameters:{type:"object",properties:{},required:[]}}},
    {type:"function",function:{name:"todo_done",description:"完成待办事项",parameters:{type:"object",properties:{id:{type:"string"}},required:["id"]}}},
    {type:"function",function:{name:"schedule_task",description:"创建定时任务",parameters:{type:"object",properties:{name:{type:"string"},cron:{type:"string"},task:{type:"string"}},required:["name","task"]}}},
    {type:"function",function:{name:"list_schedules",description:"列出定时任务",parameters:{type:"object",properties:{},required:[]}}},
    {type:"function",function:{name:"make_call",description:"发起P2P通话请求",parameters:{type:"object",properties:{peerId:{type:"string"}},required:["peerId"]}}},
    {type:"function",function:{name:"send_peer_message",description:"发送P2P消息",parameters:{type:"object",properties:{peerId:{type:"string"},message:{type:"string"}},required:["peerId","message"]}}},
  ],

  handlers: {
    send_notification: (args) => {
      if (Notification.permission === 'granted') {
        new Notification(args.title, {body: args.body});
        return JSON.stringify({status:'sent'});
      }
      return JSON.stringify({status:'no_permission', note:'请在设置中允许通知权限'});
    },

    set_timer: (args) => {
      const seconds = Math.min(args.seconds, 86400); // 最长24小时
      setTimeout(() => {
        if (Notification.permission === 'granted') {
          new Notification('⏰ 小龙人提醒', {body: args.message});
        }
      }, seconds * 1000);
      return JSON.stringify({seconds, message: args.message, status:'set'});
    },

    session_search: async (args) => {
      try {
        if (typeof memory !== 'undefined') {
          const conv = await memory.loadConversation();
          const q = args.query.toLowerCase();
          const matches = conv.filter(m => m.content.toLowerCase().includes(q));
          return JSON.stringify({
            query: args.query,
            found: matches.length,
            matches: matches.slice(0, 5).map(m => ({
              role: m.role,
              content: m.content.substring(0, 200)
            }))
          });
        }
        return JSON.stringify({found:0, note:'记忆系统未初始化'});
      } catch(e) { return JSON.stringify({error: e.message}); }
    },

    todo_add: (args) => {
      const todos = JSON.parse(localStorage.getItem('xlr_todos') || '[]');
      const item = {
        id: Date.now().toString(),
        content: args.content,
        priority: args.priority || 'medium',
        created: new Date().toISOString(),
        done: false,
      };
      todos.push(item);
      localStorage.setItem('xlr_todos', JSON.stringify(todos));
      return JSON.stringify({status: 'added', todo: item, total: todos.length});
    },

    todo_list: () => {
      const todos = JSON.parse(localStorage.getItem('xlr_todos') || '[]');
      const pending = todos.filter(t => !t.done);
      return JSON.stringify({total: todos.length, pending: pending.length, items: pending});
    },

    todo_done: (args) => {
      const todos = JSON.parse(localStorage.getItem('xlr_todos') || '[]');
      const idx = todos.findIndex(t => t.id === args.id);
      if (idx >= 0) {
        todos[idx].done = true;
        todos[idx].completed = new Date().toISOString();
        localStorage.setItem('xlr_todos', JSON.stringify(todos));
        return JSON.stringify({status: 'completed', todo: todos[idx]});
      }
      return JSON.stringify({error: '未找到该待办项'});
    },

    schedule_task: (args) => {
      const schedules = JSON.parse(localStorage.getItem('xlr_schedules') || '[]');
      schedules.push({
        id: Date.now().toString(),
        name: args.name,
        cron: args.cron || 'daily',
        task: args.task,
        created: new Date().toISOString(),
      });
      localStorage.setItem('xlr_schedules', JSON.stringify(schedules));
      return JSON.stringify({status:'scheduled',name:args.name,total:schedules.length});
    },

    list_schedules: () => {
      const schedules = JSON.parse(localStorage.getItem('xlr_schedules') || '[]');
      return JSON.stringify({schedules,count:schedules.length});
    },

    make_call: (args) => {
      return JSON.stringify({peerId:args.peerId,status:'calling',note:'P2P信令需后端服务支持'});
    },

    send_peer_message: (args) => {
      return JSON.stringify({peerId:args.peerId,message:args.message,status:'sent',note:'P2P消息需后端服务支持'});
    },
  },
});
