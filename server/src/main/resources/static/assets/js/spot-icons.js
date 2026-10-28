/* ============================================================================
 *  点位印章图标映射 + 环形扇形工具（三端共用）
 *
 *  印章以前是单字（旗 / 院 / 鞋 / 稻 …），用户反馈「用文字顶替图标」。
 *  现在每个点位映射到 icons.svg 里的一个艺术图标，印章外框由 CSS 画。
 *  新增点位时在 BY_ID 里补一行；没配到的按点位类型兜底，再兜不住用 i-stamp。
 * ========================================================================== */
window.ZQSpotIcons = (function () {
  'use strict';

  var BY_ID = {
    sp1: 'i-info',     sp2: 'i-home',   sp3: 'i-craft',  sp4: 'i-rice',
    sp5: 'i-museum',   sp6: 'i-book',   sp7: 'i-radish', sp8: 'i-book',
    sp9: 'i-jar',      sp10: 'i-tea',   sp11: 'i-bamboo', sp12: 'i-path',
    sp13: 'i-market',  sp14: 'i-leaf'
  };

  /* 旧版印章存的是单个汉字（旗/院/鞋…）。为了不破坏历史数据与已打卡的印章记录，
     这里保留一张「单字 → 图标」映射；管理员新选的图标会直接以 i-xxx 存进 stampIcon，
     iconOf() 会优先识别这种新格式。 */
  var BY_CHAR = {
    '旗': 'i-info', '院': 'i-home', '鞋': 'i-craft', '稻': 'i-rice', '史': 'i-museum',
    '学': 'i-book', '萝': 'i-radish', '书': 'i-book', '酱': 'i-jar', '茶': 'i-tea',
    '竹': 'i-bamboo', '田': 'i-rice', '集': 'i-market', '杏': 'i-leaf'
  };

  var BY_TYPE = {
    '服务设施': 'i-info',
    '自然人文': 'i-leaf',
    '非遗工坊': 'i-craft',
    '农事景观': 'i-rice',
    '文化场馆': 'i-museum',
    '研学基地': 'i-book',
    '农产基地': 'i-radish',
    '休闲空间': 'i-tea'
  };

  /** 传入点位对象、印章记录（含 spotId）或 id 字符串，返回图标名 */
  function iconOf(spot) {
    if (!spot) { return 'i-stamp'; }
    if (typeof spot === 'string') {
      return BY_ID[spot] || 'i-stamp';
    }
    // ① 新版管理员选的图标（i-rice 这类 key）优先；
    // ② 旧版单字走 BY_CHAR 兼容；
    // ③ 再按点位 id / 类型兜底。
    var raw = String(spot.stampIcon || '').trim();
    if (raw.indexOf('i-') === 0) { return raw; }
    if (raw && BY_CHAR[raw]) { return BY_CHAR[raw]; }
    // 顺序很重要：印章记录自带 id（st1/st2…），必须先看 spotId，
    // 否则会拿 st3 去查点位映射，永远查不到、全部退回默认印章。
    return BY_ID[spot.spotId || spot.id] || BY_TYPE[spot.type] || 'i-stamp';
  }

  /**
   * 生成环形扇区的 path，用于集章进度扇形图。
   * 角度单位是度，0° 指向 3 点方向（调用方自己减 90 让它从 12 点开始）。
   *
   * 退化保护：角度跨度 ≤0 时返回空字符串（渲染成空路径 = 不画），
   * 否则只有 1 个点位时算出的负跨度和 0 跨度会生成一条几乎填满整圈的怪路径；
   * 跨度接近 360° 时也不画满圈，留一道缝，否则与「已全部集齐」的实心环无法区分。
   */
  function ringSegment(cx, cy, rOuter, rInner, a0, a1) {
    var span = a1 - a0;
    if (typeof span !== 'number' || !isFinite(span) || span <= 0.01) { return ''; }
    if (span > 359.9) { span = 359.9; a1 = a0 + span; }
    var rad = Math.PI / 180;
    function pt(r, a) {
      return [(cx + r * Math.cos(a * rad)).toFixed(2), (cy + r * Math.sin(a * rad)).toFixed(2)];
    }
    var large = span > 180 ? 1 : 0;
    var o0 = pt(rOuter, a0), o1 = pt(rOuter, a1);
    var i1 = pt(rInner, a1), i0 = pt(rInner, a0);
    return 'M' + o0[0] + ' ' + o0[1]
      + 'A' + rOuter + ' ' + rOuter + ' 0 ' + large + ' 1 ' + o1[0] + ' ' + o1[1]
      + 'L' + i1[0] + ' ' + i1[1]
      + 'A' + rInner + ' ' + rInner + ' 0 ' + large + ' 0 ' + i0[0] + ' ' + i0[1]
      + 'Z';
  }

  return { iconOf: iconOf, ringSegment: ringSegment, BY_ID: BY_ID, BY_TYPE: BY_TYPE };
})();
