/**
 * 插件: media — 图片分析/语音合成/翻译
 */
XLR.registerPlugin({
  name: 'media',
  version: '1.0.0',

  tools: [
    {type:"function",function:{name:"vision_analyze",description:"分析图片内容，提取视觉元素+语义+方法论",parameters:{type:"object",properties:{image_data:{type:"string",description:"图片base64或URL"},question:{type:"string",description:"可选问题"}},required:["image_data"]}}},
    {type:"function",function:{name:"text_to_speech",description:"文字转语音播报",parameters:{type:"object",properties:{text:{type:"string"}},required:["text"]}}},
    {type:"function",function:{name:"translate",description:"翻译文本(MyMemory API)",parameters:{type:"object",properties:{text:{type:"string"},from:{type:"string"},to:{type:"string"}},required:["text","to"]}}},
  ],

  handlers: {
    vision_analyze: async (args) => {
      try {
        const defaultPrompt = `请按以下JSON结构分析这张图片，用中文回答：

{
  "视觉元素": {"物体角色":"","文字标识":"","场景背景":"","色彩风格":"","布局构图":""},
  "语义意图": {"表层含义":"","深层目的":"","目标受众":""},
  "方法论": {"核心策略":"","步骤拆解":[],"可复用技能":[{"名称":"","描述":"","类型":"视觉/策略/工具"}]}
}

要求：文字逐字提取不脑补，方法论具体可操作不空泛。`;

        const analysisQuestion = args.question && args.question !== '这张图片里有什么？'
          ? args.question + '\n\n---\n同时请按以下结构提取方法论：' + defaultPrompt.substring(defaultPrompt.indexOf('{'))
          : defaultPrompt;

        let base64 = args.image_data;
        if (args.image_data.startsWith('http')) {
          const r = await fetch(args.image_data);
          const blob = await r.blob();
          base64 = await new Promise((res) => {
            const reader = new FileReader();
            reader.onloadend = () => res(reader.result);
            reader.readAsDataURL(blob);
          });
        }
        return JSON.stringify({
          status: 'ok',
          method: '四层闭环视觉分析',
          note: '图片已接收，附带结构化分析指令。模型将提取：视觉元素→语义意图→方法论→可复用技能。',
          image_size: base64.length,
          question: analysisQuestion
        });
      } catch(e) { return JSON.stringify({error: '图片分析失败: '+e.message}); }
    },

    text_to_speech: (args) => {
      if (typeof SpeechSynthesisUtterance === 'undefined' || typeof speechSynthesis === 'undefined') {
        return JSON.stringify({status:'unavailable', note:'当前环境不支持语音合成（WebView限制）', text:args.text.substring(0,100)});
      }
      const voices = speechSynthesis.getVoices();
      const zhVoice = voices.find(v => v.lang.startsWith('zh')) || voices.find(v => v.lang.startsWith('en'));
      const u = new SpeechSynthesisUtterance(args.text);
      u.lang = zhVoice ? zhVoice.lang : 'zh-CN';
      if (zhVoice) u.voice = zhVoice;
      u.rate = 1.0; u.pitch = 1.0;
      speechSynthesis.cancel();
      setTimeout(() => speechSynthesis.speak(u), 50);
      return JSON.stringify({status:'speaking',voice:zhVoice?.name||'default',text:args.text.substring(0,100)});
    },

    translate: async (args) => {
      try {
        const ctrl = new AbortController();
        const tm = setTimeout(() => ctrl.abort(), 8000);
        const lp = (args.from||'auto') + '|' + args.to;
        const r = await fetch('https://api.mymemory.translated.net/get?q='+encodeURIComponent(args.text)+'&langpair='+lp, {
          signal: ctrl.signal
        });
        clearTimeout(tm);
        const d = await r.json();
        if (d.responseStatus === 200 || d.responseData?.translatedText) {
          return JSON.stringify({original:args.text,translated:d.responseData.translatedText,from:args.from||'auto',to:args.to,engine:'mymemory'});
        }
      } catch(e) {}
      return JSON.stringify({error:'翻译服务暂不可用，请让AI直接翻译',from:args.from||'auto',to:args.to});
    },
  },
});
