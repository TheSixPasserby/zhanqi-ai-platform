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
  var MODES = ['light', 'dark'];

  function read() {
    try {
      var v = localStorage.getItem(KEY);
      return MODES.indexOf(v) >= 0 ? v : 'light';
    } catch (e) { return 'light'; }
  }

  function write(mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) { /* 隐私模式忽略 */ }
  }

  /** 把主题写到 <html data-theme>，CSS 用 [data-theme="dark"] 覆盖令牌 */
  function apply(mode) {
    var html = document.documentElement;
    if (mode === 'dark') { html.setAttribute('data-theme', 'dark'); }
    else { html.removeAttribute('data-theme'); }
    // 移动端浏览器地址栏配色跟着变，否则深色页面顶着一条白栏很割裂
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) { meta.setAttribute('content', mode === 'dark' ? '#151A18' : '#146B57'); }
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
    /** 在浅/深之间切换，返回切换后的值 */
    toggle: function () { return Theme.set(read() === 'dark' ? 'light' : 'dark'); },
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

  window.ZQTheme = Theme;
  // 首屏立刻应用（本脚本在 head 里同步引入，早于 body 渲染）
  apply(read());
})();
