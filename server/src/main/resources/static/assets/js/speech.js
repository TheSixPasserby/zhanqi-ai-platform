/* ============================================================================
 *  语音讲解（三端共用）：音色优选 + 韵律整形 + 分句朗读 + 可靠停止
 *
 *  【为什么要单独抽一个模块】
 *  原来游客端 H5 与电脑版各写了一份 speechSynthesis 调用，问题有三类：
 *    1. 没人负责「停」：切页面、退出登录、令牌过期被踢回登录页时，朗读还在继续。
 *    2. 音色随缘：只写 lang='zh-CN'，浏览器挑了哪个就用哪个 —— 多数 Windows
 *       机器上会落到 Microsoft Huihui/Yaoyao 这类十几年前的 SAPI 音色，
 *       语调平直、断句生硬，是「AI 味」的主要来源。
 *    3. 一口气念完一大段：Chrome 对长文本有 15 秒左右的静默截断，
 *       而且中途 cancel() 常常不生效（异步队列没被真正清空）。
 *
 *  【本模块的做法】
 *    · 音色打分优选：优先设备/浏览器上的神经音色（晓晓、云希、Google 普通话、
 *      婷婷……），老 SAPI 音色排最后；用户可手动切换并记住选择。
 *    · 分句朗读：按中文标点切句、句间留 200ms 左右停顿，既自然，
 *      又天然绕开 Chrome 的长文本截断；停止时只需作废当前「代次」。
 *    · 停止做成幂等且带补偿：cancel() 之后再补一次，并清掉自己的队列，
 *      保证任何时机调用都能立刻静音。
 *
 *  【为什么不用云端语音合成】
 *  项目红线是「部署机只要 JDK + MySQL，断网可用」。云端 TTS 需要 key、
 *  需要外网，失败时还会让讲解按钮点了没反应。这里的原则是：能用设备上更
 *  自然的音色就用，没有就退到最不机械的那个，永不因为语音而阻塞流程。
 *  仓库内也不存在名为「曼波」的语音包（全库检索无任何命中），故按设备音色优选实现。
 * ========================================================================== */
window.ZQSpeech = (function () {
  'use strict';

  var synth = (typeof window !== 'undefined' && window.speechSynthesis) ? window.speechSynthesis : null;

  /* 服务端下发的默认参数（app.speech.*，见 /api/server/info），失败时用这里的兜底值 */
  var cfg = { enabled: true, voice: '', pack: 'auto', rate: 0.95, pitch: 1.0, gapMs: 200, autoPlay: true };

  var VOICE_KEY = 'zhanqi.speech.voice';

  /* 音色偏好表：从上往下匹配，第一个命中的胜出。
     rate/pitch 是针对该音色单独调的 —— 神经音色本身韵律好，接近原速即可；
     老 SAPI 音色语速稍微放慢、音高压一点点，听起来会不那么「念稿」。 */
  var PREFER = [
    { re: /xiaoxiao|晓晓/i, label: '晓晓', rate: 0.96, pitch: 1.00 },
    { re: /xiaoyi|晓伊/i, label: '晓伊', rate: 0.96, pitch: 1.00 },
    { re: /xiaohan|晓涵/i, label: '晓涵', rate: 0.96, pitch: 1.00 },
    { re: /xiaomo|晓墨/i, label: '晓墨', rate: 0.96, pitch: 1.00 },
    { re: /yunxi|云希/i, label: '云希', rate: 0.97, pitch: 1.00 },
    { re: /yunyang|云扬/i, label: '云扬', rate: 0.97, pitch: 1.00 },
    { re: /yunjian|云健/i, label: '云健', rate: 0.97, pitch: 1.00 },
    { re: /natural|neural/i, label: '自然音色', rate: 0.97, pitch: 1.00 },
    { re: /google.*(普通话|mandarin)/i, label: 'Google 普通话', rate: 0.98, pitch: 1.00 },
    { re: /ting-?ting|婷婷/i, label: '婷婷', rate: 0.97, pitch: 1.00 },
    { re: /mei-?jia|美佳|sin-?ji/i, label: '美佳', rate: 0.97, pitch: 1.00 },
    { re: /lili|丽丽/i, label: '丽丽', rate: 0.96, pitch: 1.00 },
    { re: /huihui|慧慧/i, label: '慧慧', rate: 0.90, pitch: 0.98 },
    { re: /yaoyao|瑶瑶/i, label: '瑶瑶', rate: 0.90, pitch: 1.00 },
    { re: /kangkang|康康/i, label: '康康', rate: 0.92, pitch: 0.99 }
  ];

  /* 语音包：管理员在「点位编辑」里给每个点位选「自动 / 男声 / 女声」。
     设备上的中文音色数量有限，且不同系统命名差异很大，所以这里按名字正则做偏好排序，
     并在排序结果上微调语速/音高 —— 男声压低一点、女声略高一点，听感更接近真人，
     而不是同一条机械音念所有内容。找不到对应性别音色时自动退回打分最优音色。 */
  var PACKS = {
    male: {
      label: '男声',
      prefer: [/yunxi|云希/i, /yunyang|云扬/i, /yunjian|云健/i, /kangkang|康康/i, /male|男/i],
      rate: 0.94, pitch: 0.90
    },
    female: {
      label: '女声',
      prefer: [/xiaoxiao|晓晓/i, /xiaoyi|晓伊/i, /xiaohan|晓涵/i,
               /ting-?ting|婷婷/i, /mei-?jia|美佳/i, /huihui|慧慧/i, /female|女/i],
      rate: 0.96, pitch: 1.06
    }
  };

  var voicesCache = [];
  var chosen = null;        // { voice, label, rate, pitch }
  var generation = 0;       // 朗读代次：任何一次 stop 都会 +1，旧的回调全部作废
  var queue = [];           // 待朗读的句子
  var timer = null;         // 句间停顿的定时器
  var cancelTimer = null;   // stop() 的补偿 cancel —— 下一次 speak 必须能撤销它
  var retryLeft = 0;        // 本段讲解允许看门狗补救几次（每段只补一次）
  var busy = false;         // 对外暴露的「正在朗读」
  var watchdogFail = null;  // 静默失败时的界面回调（展开文稿）
  var onStateChange = null; // 页面用来同步按钮状态

  /* ------------------------------ 音色相关 ------------------------------ */

  function zhVoices() {
    return voicesCache.filter(function (v) {
      var lang = String(v.lang || '').toLowerCase();
      return lang.indexOf('zh') === 0 || lang.indexOf('cmn') === 0;
    });
  }

  function scoreOf(v) {
    var name = String(v.name || '');
    for (var i = 0; i < PREFER.length; i++) {
      if (PREFER[i].re.test(name)) { return { rank: i, meta: PREFER[i] }; }
    }
    // 没进表的 zh 音色：普通话优先于粤语/台湾国语
    var lang = String(v.lang || '').toLowerCase();
    if (lang === 'zh-cn' || lang.indexOf('cmn') === 0) { return { rank: 50, meta: null }; }
    return { rank: 80, meta: null };
  }

  /**
   * 刷新可用音色（getVoices 首次可能为空，要等 voiceschanged）。
   *
   * 【为什么要检测列表变化并重选】
   * 浏览器返回音色是「分批」的：一开始只有本机 SAPI 音色（Windows 上通常是
   * 慧慧 / 瑶瑶这类老音色），网络音色（Edge 在线自然音色、Google 普通话）要等
   * voiceschanged 才补进来。如果第一次就定下音色，就会一直用那个最机械的 ——
   * 正是用户抱怨的「AI 味」。所以只要列表变长，就把选择作废重挑一次；
   * 用户手动选过的音色在 pick() 里优先命中，不会被这里覆盖。
   */
  function refreshVoices() {
    if (!synth) { return; }
    try {
      var list = synth.getVoices() || [];
      if (list.length && list.length !== voicesCache.length) {
        voicesCache = list;
        chosen = null;
      }
    } catch (e) { /* 忽略 */ }
  }

  function nameLabel(v) {
    var name = String(v.name || '');
    for (var i = 0; i < PREFER.length; i++) {
      if (PREFER[i].re.test(name)) { return PREFER[i].label; }
    }
    // 去掉 "Microsoft ... - Chinese (Simplified, PRC)" 这类冗长前后缀
    return name.replace(/^Microsoft\s+/i, '').replace(/\s*-\s*Chinese.*$/i, '') || '系统音色';
  }

  /** 选一个音色：用户手动选过的 > 服务端指定 > 打分最优 */
  function pick() {
    refreshVoices();
    var all = zhVoices();
    if (!all.length) { return null; }

    var saved = '';
    try { saved = localStorage.getItem(VOICE_KEY) || ''; } catch (e) { /* 隐私模式 */ }

    var wanted = saved || cfg.voice;
    if (wanted) {
      for (var i = 0; i < all.length; i++) {
        if (String(all[i].name).toLowerCase().indexOf(String(wanted).toLowerCase()) >= 0) {
          return decorate(all[i]);
        }
      }
    }

    var best = null;
    var bestRank = 9999;
    for (var j = 0; j < all.length; j++) {
      var s = scoreOf(all[j]);
      // 同分时偏向本地音色：网络音色在断网/弱网时会直接静音
      var rank = s.rank + (all[j].localService ? 0 : 0.5);
      if (rank < bestRank) { bestRank = rank; best = all[j]; }
    }
    return best ? decorate(best) : null;
  }

  function decorate(v) {
    var s = scoreOf(v);
    return {
      voice: v,
      label: s.meta ? s.meta.label : nameLabel(v),
      rate: s.meta ? s.meta.rate : 0.95,
      pitch: s.meta ? s.meta.pitch : 1.0
    };
  }

  function ensureChosen() {
    if (!chosen) { chosen = pick(); }
    return chosen;
  }

  /**
   * 按语音包选音色。pack=auto 时沿用原来的打分优选；
   * male/female 会先按 PACKS.prefer 找设备上的同性别音色，找不到再用打分最优。
   */
  function pickByPack(pack) {
    var key = String(pack || 'auto').toLowerCase();
    var conf = PACKS[key];
    if (!conf) {
      return ensureChosen();
    }
    refreshVoices();
    var all = zhVoices();
    if (!all.length) {
      return null;
    }
    var saved = '';
    try { saved = localStorage.getItem(VOICE_KEY) || ''; } catch (e) { /* 隐私模式 */ }
    var hit = null;
    for (var p = 0; p < conf.prefer.length && !hit; p++) {
      for (var i = 0; i < all.length; i++) {
        if (conf.prefer[p].test(String(all[i].name || ''))) {
          hit = all[i];
          break;
        }
      }
    }
    if (!hit) {
      hit = (ensureChosen() || {}).voice || null;
    }
    if (!hit) {
      return null;
    }
    var decorated = decorate(hit);
    // 用户手动选过音色时仍尊重用户选择（音高/语速按包微调），避免「管理员配了女声却听不到变化」
    if (saved) {
      for (var j = 0; j < all.length; j++) {
        if (String(all[j].name).toLowerCase().indexOf(saved.toLowerCase()) >= 0) {
          decorated = decorate(all[j]);
          break;
        }
      }
    }
    return {
      voice: decorated.voice,
      label: decorated.label,
      rate: conf.rate,
      pitch: conf.pitch
    };
  }

  /** 页面展示用：语音包中文名（自动则返回当前音色名） */
  function packLabel(pack) {
    var key = String(pack || 'auto').toLowerCase();
    if (PACKS[key]) { return PACKS[key].label; }
    return voiceLabel();
  }

  /** 界面上展示「当前音色」；没有可用音色时返回空串 */
  function voiceLabel() {
    var c = ensureChosen();
    return c ? c.label : '';
  }

  /** 在候选音色里循环切换（用户点了「换音色」） */
  function cycleVoice() {
    refreshVoices();
    var list = zhVoices().slice().sort(function (a, b) { return scoreOf(a).rank - scoreOf(b).rank; });
    if (list.length < 2) { return voiceLabel(); }
    var cur = ensureChosen();
    var idx = 0;
    if (cur) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] === cur.voice) { idx = i; break; }
      }
    }
    var next = list[(idx + 1) % list.length];
    try { localStorage.setItem(VOICE_KEY, next.name); } catch (e) { /* 忽略 */ }
    // 直接改掉缓存，避免 pick() 又按打分选回默认
    chosen = decorate(next);
    return chosen.label;
  }

  /* ------------------------------ 文本整形 ------------------------------ */

  /** 把一段讲解切成适合逐句朗读的句子（不依赖正则后行断言，兼容老 Safari） */
  function splitSentences(text) {
    var s = String(text || '')
      .replace(/[\r\n]+/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/[*_`#>]/g, '')      // 偶尔混进来的 Markdown 记号，念出来很奇怪
      .trim();
    if (!s) { return []; }

    var END = '。！？!?；;…\n';
    var parts = [];
    var buf = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      buf += ch;
      if (END.indexOf(ch) >= 0) {
        if (buf.trim()) { parts.push(buf.trim()); }
        buf = '';
      }
    }
    if (buf.trim()) { parts.push(buf.trim()); }

    // 太短的句子（"好。"）并到下一句，避免碎成一地；太长的按逗号再拆
    var merged = [];
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k];
      if (p.length < 8 && k + 1 < parts.length) {
        parts[k + 1] = p + parts[k + 1];
      } else {
        merged.push(p);
      }
    }

    var out = [];
    var LIMIT = 58;
    for (var m = 0; m < merged.length; m++) {
      var seg = merged[m];
      while (seg.length > LIMIT) {
        var cut = -1;
        for (var c = Math.min(LIMIT, seg.length - 1); c > LIMIT * 0.4; c--) {
          if ('，、,'.indexOf(seg.charAt(c)) >= 0) { cut = c + 1; break; }
        }
        if (cut < 0) { cut = LIMIT; }
        out.push(seg.slice(0, cut).trim());
        seg = seg.slice(cut).trim();
      }
      if (seg) { out.push(seg); }
    }
    return out;
  }

  /* ------------------------------ 朗读控制 ------------------------------ */

  function setBusy(v) {
    if (busy === v) { return; }
    busy = v;
    if (typeof onStateChange === 'function') {
      try { onStateChange(v); } catch (e) { /* 忽略 */ }
    }
  }

  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  /**
   * 停止朗读。
   *
   * 为什么要 cancel 两次：Chrome / 部分安卓 WebView 里，speak() 之后立刻 cancel()
   * 只会清掉「当前正在念」的那条，已经排进引擎队列的还会继续念几秒；
   * 另外在 paused 状态下 cancel 也可能无效。所以先 resume（如果被暂停）、
   * 再 cancel，60ms 后补一次 —— 让「停止」在任何时机都真的停。
   *
   * ⚠️ 那次「补刀」必须能被下一次 speak() 取消掉。
   * 语音播报曾经整段失效就是栽在这里：`speak()` 内部先调 `stop()` 清场，
   * 30ms 后开始念，而 stop() 埋下的补偿 cancel 在 60ms 时照常开火，
   * 把刚起来的那句话直接掐断 —— 表现就是「点了没反应」或「念半句就停」。
   * 所以补偿定时器要存成 cancelTimer，speak()/speakNext() 一开始就把它清掉。
   */
  function stop() {
    generation++;
    queue = [];
    clearTimer();
    setBusy(false);
    if (!synth) { return; }
    try {
      if (synth.paused) { synth.resume(); }
      synth.cancel();
    } catch (e) { /* 忽略 */ }
    if (cancelTimer) { clearTimeout(cancelTimer); }
    cancelTimer = setTimeout(function () {
      cancelTimer = null;
      try {
        if (synth.speaking || synth.pending) { synth.cancel(); }
      } catch (e) { /* 忽略 */ }
    }, 60);
  }

  function speakNext(gen, picked) {
    if (gen !== generation) { return; }         // 已被 stop 作废
    // 真正要开口了：把 stop() 埋下的补偿 cancel 撤掉，否则它会掐掉这句话
    if (cancelTimer) { clearTimeout(cancelTimer); cancelTimer = null; }
    if (!queue.length) { setBusy(false); return; }

    var text = queue.shift();
    var u = makeUtterance(text, picked, gen);
    try {
      synth.speak(u);
      setBusy(true);
      watchdog(u, gen);
    } catch (e) {
      queue = [];
      setBusy(false);
    }
  }

  /**
   * 兜底看门狗：Chrome 有个老毛病 —— 刚 cancel() 完紧接着 speak() 会被静默吞掉，
   * 既不报错也不出声。这里在 700ms 后检查是否真的开念过，没开念就补救一次
   * （整个会话只补一次，避免死循环式重复朗读）。
   */
  function watchdog(u, gen) {
    if (retryLeft <= 0) { return; }
    setTimeout(function () {
      if (gen !== generation) { return; }
      // 已经开念、已明确报错，都不需要补
      if (u.__started || u.__failed) { return; }
      try {
        if (synth.speaking || synth.pending) { return; }
      } catch (e) { return; }
      retryLeft--;
      try {
        synth.cancel();
        synth.speak(u);
      } catch (e) { /* 忽略 */ }
      // 补一次仍无声音：把控制权交回页面（展开文稿），不让按钮永远停在「朗读中」
      setTimeout(function () {
        if (gen !== generation) { return; }
        if (u.__started) { return; }
        try {
          if (synth.speaking || synth.pending) { return; }
        } catch (e) { /* 忽略 */ }
        setBusy(false);
        if (typeof watchdogFail === 'function') {
          try { watchdogFail(); } catch (e2) { /* 忽略 */ }
        }
      }, 900);
    }, 700);
  }

  function makeUtterance(text, picked, gen) {
    // 音色在整段讲解开始时就定下来，中途不换（哪怕 voiceschanged 补了更好的音色），
    // 否则同一段讲解会前后两个声音，比机械更难受。
    var c = picked || ensureChosen();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = (c && c.voice && c.voice.lang) ? c.voice.lang : 'zh-CN';
    if (c && c.voice) { u.voice = c.voice; }
    u.rate = clamp((c ? (c.rate || cfg.rate) : cfg.rate), 0.5, 2);
    u.pitch = clamp((c ? (c.pitch || cfg.pitch) : cfg.pitch), 0, 2);
    u.volume = 1;
    u.onstart = function () { u.__started = true; };

    u.onend = function () {
      if (gen !== generation) { return; }
      if (!queue.length) { setBusy(false); return; }
      // 句间留一个自然的呼吸感，而不是机械地一句咬一句
      timer = setTimeout(function () {
        timer = null;
        speakNext(gen, picked);
      }, cfg.gapMs);
    };
    u.onerror = function (e) {
      u.__failed = true;
      if (gen !== generation) { return; }
      // interrupted / canceled 是主动停止的正常表现，不要当成失败
      var err = (e && e.error) || '';
      if (err === 'interrupted' || err === 'canceled') { setBusy(false); return; }
      // 其它错误（音色不可用等）就别再念了，直接结束，页面会显示文稿
      queue = [];
      setBusy(false);
    };

    return u;
  }

  function clamp(v, lo, hi) {
    v = Number(v);
    if (!isFinite(v)) { return 1; }
    return Math.min(hi, Math.max(lo, v));
  }

  /**
   * 朗读一段文字。
   * @returns {boolean} false 表示当前环境没有语音合成能力，调用方应退化为「展示文稿」
   */
  function speak(text, opts) {
    opts = opts || {};
    if (!synth || cfg.enabled === false) { return false; }
    var parts = splitSentences(text);
    if (!parts.length) { return false; }

    // 一些浏览器（尤其 Chrome / 安卓 WebView）在页面长时间静默或刚 cancel 之后，
    // speechSynthesis 会停在一个「suspended」状态，直接 speak 既不报错也没声音。
    // 先 resume 一次是成本最低、收益最直接的修复。
    try { if (synth.paused) { synth.resume(); } } catch (e) { /* 忽略 */ }

    stop();
    // stop() 里埋的补偿 cancel 已经在这里失效：马上要开念，不能再被打断
    if (cancelTimer) { clearTimeout(cancelTimer); cancelTimer = null; }
    var gen = generation;
    var picked = pickByPack(opts.pack || cfg.pack) || ensureChosen();
    queue = parts;
    retryLeft = 1;
    // 记录失败回调：如果浏览器把 speak 静默吞掉（无 onstart / 无 onerror），
    // 1.5 秒后页面可以据此展开文稿，而不是让用户面对一个「点了没反应」的按钮。
    watchdogFail = typeof opts.onFail === 'function' ? opts.onFail : null;
    if (typeof opts.onStart === 'function') { try { opts.onStart(); } catch (e) { /* 忽略 */ } }

    // 部分浏览器（尤其从 cancel 状态直接再 speak）需要一点点时间复位，
    // 这里延后一个小节拍启动，能明显减少「点了没反应」。
    setTimeout(function () { speakNext(gen, picked); }, 30);
    return true;
  }

  function isSpeaking() {
    if (!synth) { return false; }
    try { return busy || synth.speaking || synth.pending; } catch (e) { return busy; }
  }

  /* ------------------------------ 外部接口 ------------------------------ */

  /** 接收 /api/server/info 下发的 speech 配置（缺字段时保留兜底值） */
  function configure(conf) {
    if (!conf || typeof conf !== 'object') { return; }
    if (typeof conf.enabled === 'boolean') { cfg.enabled = conf.enabled; }
    if (typeof conf.voice === 'string') { cfg.voice = conf.voice; }
    if (typeof conf.pack === 'string') { cfg.pack = conf.pack; }
    if (typeof conf.rate === 'number') { cfg.rate = conf.rate; }
    if (typeof conf.pitch === 'number') { cfg.pitch = conf.pitch; }
    if (typeof conf.gapMs === 'number') { cfg.gapMs = conf.gapMs; }
    if (typeof conf.autoPlay === 'boolean') { cfg.autoPlay = conf.autoPlay; }
    chosen = null;  // 配置变了要重新挑音色
  }

  function autoPlayEnabled() { return cfg.autoPlay !== false; }

  /** 页面挂载时调一次：预热音色列表并缓存结果 */
  function preload() {
    if (!synth) { return; }
    refreshVoices();
    // 某些浏览器首次需要一次 resume 才会把语音引擎唤醒
    try { if (synth.paused) { synth.resume(); } } catch (e) { /* 忽略 */ }
    try {
      // 有些浏览器只有监听了 voiceschanged 才把列表填好
      synth.addEventListener('voiceschanged', refreshVoices);
    } catch (e) {
      try { synth.onvoiceschanged = refreshVoices; } catch (e2) { /* 忽略 */ }
    }
  }

  function bind(fn) { onStateChange = typeof fn === 'function' ? fn : null; }

  function available() { return !!synth; }

  return {
    available: available,
    preload: preload,
    configure: configure,
    autoPlayEnabled: autoPlayEnabled,
    speak: speak,
    stop: stop,
    isSpeaking: isSpeaking,
    voiceLabel: voiceLabel,
    packLabel: packLabel,
    cycleVoice: cycleVoice,
    bind: bind,
    // 便于自检脚本断言内部状态
    _debug: function () {
      return {
        generation: generation,
        queue: queue.length,
        busy: busy,
        voice: chosen ? chosen.label : '',
        voiceName: chosen && chosen.voice ? chosen.voice.name : '',
        rate: chosen ? chosen.rate : cfg.rate
      };
    }
  };
})();
