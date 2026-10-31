/* ============================================================================
 *  主题切换（三端共用，零构建）
 *
 *  设计取舍：**只覆盖设计令牌，不改组件样式**。
 *  三端的卡片 / 弹窗 / 表格底色全部走 assets/css/app.css 里的 CSS 变量，
 *  所以把 :root 的令牌换成深色值，整个站点就整体变深，不需要逐个组件打补丁。
 *  这也是唯一能保证「弹窗、表格、输入框、Element UI 组件」一起适配的做法 ——
 *  只改局部背景会出现「卡片黑了、弹窗还是白」的割裂感。
 *
 *  持久化：localStorage 按端隔离（与登录态同一套 ns 规则），刷新/换页不丢。
 *  首屏防闪：脚本在 <head> 里同步执行，先给 <html> 打上 data-theme，
 *  等 CSS 加载时已经是深色，不会先白后黑闪一下。
 * ========================================================================== */
(function () {
  'use strict';

  var KEY = 'zhanqi.theme';        // 主题偏好全局共享（不按端隔离：用户在哪端选都应该生效）
  /** 四种主题：浅色（默认）/ 深色 / 暖阳 / 青墨 */
  var MODES = ['light', 'dark', 'warm', 'ink'];

  function read() {
    try {
      var v = localStorage.getItem(KEY);
      return MODES.indexOf(v) >= 0 ? v : 'light';
    } catch (e) { return 'light'; }
  }

  function write(mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) { /* 隐私模式忽略 */ }
  }

  /**
   * 把主题写到 <html data-theme>。
   * CSS 里每个主题用 [data-theme="<mode>"] 覆盖设计令牌；浅色是默认（不设属性）。
   */
  function apply(mode) {
    var html = document.documentElement;
    if (mode === 'dark' || mode === 'warm' || mode === 'ink') {
      html.setAttribute('data-theme', mode);
    } else {
      html.removeAttribute('data-theme');
    }
    // 移动端浏览器地址栏配色跟着变，否则深色页面顶着一条白栏很割裂
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var barColor = { dark: '#151A18', warm: '#6B4A2E', ink: '#1B2A33' }[mode] || '#146B57';
      meta.setAttribute('content', barColor);
    }
    return mode;
  }

  var listeners = [];
  function notify(mode) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](mode); } catch (e) { /* 单个订阅者出错不影响其它 */ }
    }
  }

  var Theme = {
    /** 当前主题 */
    get: function () { return read(); },
    /** 是否深色 */
    isDark: function () { return read() === 'dark'; },
    /** 设置主题并落库 + 广播 */
    set: function (mode) {
      if (MODES.indexOf(mode) < 0) { mode = 'light'; }
      write(mode);
      apply(mode);
      notify(mode);
      return mode;
    },
    /** 按顺序轮换主题（浅色 → 深色 → 暖阳 → 青墨 → 浅色），返回切换后的值 */
    toggle: function () {
      var i = MODES.indexOf(read());
      return Theme.set(MODES[(i + 1) % MODES.length]);
    },
    /** 订阅变化（返回取消函数），供各端「个性化设置」同步 UI */
    onChange: function (fn) {
      if (typeof fn !== 'function') { return function () {}; }
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) { listeners.splice(i, 1); }
      };
    },
    /** 供首屏同步调用 */
    apply: apply
  };

  /**
   * 各端「个性化设置」可直接绑定的选项列表。
   * 放在这里而不是每个页面各写一份：加主题时只改一处，四端一起变。
   * dot 是给按钮上的小圆点用的主色示意，让用户点之前就能看出区别。
   */
  Theme.options = [
    { key: 'light', text: '浅色', dot: '#F6F4EF' },
    { key: 'dark', text: '深色', dot: '#151A18' },
    { key: 'warm', text: '暖阳', dot: '#BE5230' },
    { key: 'ink', text: '青墨', dot: '#1B2A33' },
  ];

  window.ZQTheme = Theme;
  // 首屏立刻应用（本脚本在 head 里同步引入，早于 body 渲染）
  apply(read());
})();
