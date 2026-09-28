import { createSSRApp } from 'vue';
import App from './App.vue';

/*
 * uni-app（Vue 3）固定入口写法：必须把 createSSRApp 的返回值交给 uni-app 处理，
 * 不能自己调用 app.mount()，否则 H5 与 App 两端都会白屏。
 */
export function createApp() {
  const app = createSSRApp(App);

  /*
   * 全局混入：给所有页面提供图片加载失败的兜底处理。
   *
   * 为什么要做成全局的：图片路径来自数据库，属于「历史数据」，
   * 可能指向已经被删除或改名的文件。指望人工发现破图并不现实，
   * 所以让前端统一兜住 —— 任何一张图挂了都退化成默认插画，
   * 界面上永远不会出现裂图。
   *
   * 用全局混入而不是逐个页面写：页面有十几处 <image>，
   * 分散实现迟早会漏掉一处，而漏掉的那一处就是将来出问题的地方。
   */
  app.mixin({
    methods: {
      onImgError(e) {
        const el = (e && (e.target || e.detail)) || null;
        // 打标记防止兜底图本身也失败时无限触发 error
        if (!el || el.__fallbackApplied) return;
        el.__fallbackApplied = true;
        el.src = '/assets/img/hero.svg';
      },
    },
  });

  return { app };
}
