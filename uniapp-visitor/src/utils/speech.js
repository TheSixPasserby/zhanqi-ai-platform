/*
 * 点位语音讲解。
 *
 * 设计取舍：不引入任何第三方语音服务，也不额外消耗大模型额度。
 *   · H5 / PC 浏览器 —— 直接用浏览器内置的 speechSynthesis，零成本、断网可用；
 *   · 安卓 App       —— 优先调用系统 TTS（部分机型 / 系统版本支持），
 *                      不支持时不报错，而是回落到「展示讲解文稿」。
 * 这样任何设备上都能拿到讲解内容，不会因为语音能力缺失而卡住流程。
 */

let ctx = null;

function isH5() {
  // #ifdef H5
  return true;
  // #endif
  // #ifndef H5
  return false;
  // #endif
}

/**
 * 当前平台能不能真的朗读出来。
 * App 端固定返回 false：安卓 WebView 并没有稳定可用的语音合成实现，
 * 与其做一个「点了没反应」的按钮，不如直接告诉用户这里展示的是文稿。
 */
export function canSpeak() {
  if (isH5()) {
    return typeof window !== 'undefined' && !!window.speechSynthesis;
  }
  return false;
}

/**
 * 朗读一段文本。
 * @returns {boolean} 是否真的开始朗读；false 表示调用方应改为展示文稿
 */
export function speak(text, onEnd) {
  const content = String(text || '').trim();
  if (!content) return false;

  if (isH5()) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return false;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(content);
      u.lang = 'zh-CN';
      u.rate = 1;
      u.pitch = 1;
      if (typeof onEnd === 'function') {
        u.onend = onEnd;
        u.onerror = onEnd;
      }
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) {
      return false;
    }
  }

  // #ifndef H5
  // App 端没有稳定可用的语音合成通道，统一回落到「展示讲解文稿」，
  // 保证任何机型上体验一致，也不会因为调用不存在的原生模块而报错。
  return false;
  // #endif
}

/** 停止朗读（切换点位 / 离开页面时调用，避免上一段还在念） */
export function stopSpeak() {
  if (isH5()) {
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (e) {
      /* 忽略 */
    }
  }
}
