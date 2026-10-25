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
    // 顺序很重要：印章记录自带 id（st1/st2…），必须先看 spotId，
    // 否则会拿 st3 去查点位映射，永远查不到、全部退回默认印章。
    return BY_ID[spot.spotId || spot.id] || BY_TYPE[spot.type] || 'i-stamp';
  }

  /**
   * 生成环形扇区的 path，用于集章进度扇形图。
   * 角度单位是度，0° 指向 3 点方向（调用方自己减 90 让它从 12 点开始）。
   */
  function ringSegment(cx, cy, rOuter, rInner, a0, a1) {
    var rad = Math.PI / 180;
    function pt(r, a) {
      return [(cx + r * Math.cos(a * rad)).toFixed(2), (cy + r * Math.sin(a * rad)).toFixed(2)];
    }
    var large = (a1 - a0) > 180 ? 1 : 0;
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
