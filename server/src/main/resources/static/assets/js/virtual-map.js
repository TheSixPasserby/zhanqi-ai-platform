/*!
 * 战旗村虚拟地图控件（window.ZQMap）
 * ============================================================================
 * 改这个文件前务必先读完这段：
 *
 * 1. 底图是纯矢量 SVG，不用位图 —— 缩放 5 倍不糊，也不额外下载图片，
 *    符合项目「离线可用、不许 CDN」的红线。
 * 2. 标记点与文字标签走 HTML 层（.vmap-pins），不画进 SVG。
 *    上一版把 <text> 画在 SVG 里，标签跟着地图一起缩放：缩小时互相压盖，
 *    放大时字大得离谱，而且没法做「放不下就换位置 / 隐藏」的排版。
 *    搬到 HTML 层后字号恒定、可以做矩形碰撞检测，压盖问题从根上消失。
 * 3. 标记点也用 HTML：五类语义图标在任何缩放级别都是清晰的目标尺寸，
 *    hover / click 直接用原生 DOM 事件。
 * 4. 坐标一律 0-100 的百分比（左上角为原点）。世界坐标 ↔ 视口坐标只有
 *    一个公式：视口 = (世界 − 平移) × 缩放；反解：世界 = 视口 ÷ 缩放 + 平移。
 * 5. 对外 API（create 的 opts、返回的方法）被游客端 / 商家端 / 管理端
 *    三处调用，签名只能新增、不能改。
 * ============================================================================
 */
(function () {
  'use strict';

  /* 五类地图要素。color 同时用于图例圆点、标记针底色、选中态描边 */
  var KINDS = {
    spot:       { color: '#146B57', soft: '#E6F2ED', label: '点位', glyph: 'star' },
    study:      { color: '#2F6BA8', soft: '#EAF1F9', label: '研学', glyph: 'book' },
    homestay:   { color: '#7A4FA3', soft: '#F1EAF7', label: '民宿', glyph: 'house' },
    experience: { color: '#B07A18', soft: '#FCF4E2', label: '农事', glyph: 'wheat' },
    activity:   { color: '#BE5230', soft: '#FBEDE7', label: '活动', glyph: 'calendar' }
  };

  var ORDER = ['spot', 'study', 'homestay', 'experience', 'activity'];

  /* 白色字形（24×24 视窗）。fill=currentColor，颜色由标记针的 color 决定 */
  var GLYPHS = {
    star:
      '<path fill="currentColor" d="M12 3.3l2.63 5.33 5.88.86-4.25 4.14 1 5.85L12 16.75l-5.26 2.76 1-5.85-4.25-4.14 5.88-.86z"/>',
    book:
      '<path fill="currentColor" d="M3.7 5.1c2.66-.4 5.14.28 6.7 1.76v13.3c-1.56-1.4-4.04-2.08-6.7-1.7a.8.8 0 01-.9-.79V5.9c0-.42.4-.76.9-.8zm16.6 0c-2.66-.4-5.14.28-6.7 1.76v13.3c1.56-1.4 4.04-2.08 6.7-1.7a.8.8 0 00.9-.79V5.9a.8.8 0 00-.9-.8z"/>',
    house:
      '<path fill="currentColor" d="M12 2.7l9.3 7.55a1 1 0 01.4.8v9.65a1 1 0 01-1 1h-5.5v-5.9h-6.4v5.9H3.3a1 1 0 01-1-1V11.05a1 1 0 01.4-.8z"/>',
    wheat:
      '<path fill="currentColor" d="M11.2 21.5h1.6V11.3h-1.6z"/>' +
      '<path fill="currentColor" d="M12 12.1c-1.95 0-3.3-1.34-3.3-3.16 1.95 0 3.3 1.34 3.3 3.16zm0 0c1.95 0 3.3-1.34 3.3-3.16-1.95 0-3.3 1.34-3.3 3.16zm0-3.5c-1.95 0-3.3-1.34-3.3-3.16 1.95 0 3.3 1.34 3.3 3.16zm0 0c1.95 0 3.3-1.34 3.3-3.16-1.95 0-3.3 1.34-3.3 3.16zM12 5.2c-1.5 0-2.55-1-2.55-2.38C10.95 2.82 12 3.82 12 5.2zm0 0c1.5 0 2.55-1 2.55-2.38C13.05 2.82 12 3.82 12 5.2z"/>',
    calendar:
      '<path fill="currentColor" fill-rule="evenodd" d="M5.4 5.2h13.2a1.8 1.8 0 011.8 1.8v12.2a1.8 1.8 0 01-1.8 1.8H5.4a1.8 1.8 0 01-1.8-1.8V7a1.8 1.8 0 011.8-1.8zm1.4 7.1v2.4h2.4v-2.4H6.8zm4.6 0v2.4h2.4v-2.4h-2.4zm4.6 0v2.4h2.4v-2.4h-2.4z"/>' +
      '<path fill="currentColor" d="M8 2.5h1.9v3.5H8zm6.1 0H16v3.5h-1.9z"/>'
  };

  /* ------------------------------ 小工具 ------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 夹到 0-100；非数字返回 null（未标点的对象直接不画） */
  function clampPct(v) {
    var n = Number(v);
    if (v === null || v === undefined || v === '' || !isFinite(n)) return null;
    return n < 0 ? 0 : n > 100 ? 100 : n;
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  /** 固定种子伪随机：底图的树木/垄沟位置每次渲染都一样，避免地图「抖动」 */
  function rng(seed) {
    var s = seed || 1;
    return function () {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  /* --------------------------- 底图（矢量插画） ---------------------------
   * 分层：纸底 → 农田（含垄沟）→ 林地树冠 → 水渠与塘 → 道路 → 建筑群
   *      → 村口广场 → 边界虚线 → 纸纹。
   * 配色刻意低饱和：底图是「背景」，标记点才是主体，不能抢视线。
   * -------------------------------------------------------------------- */

  function furrows(clipId, x0, y0, x1, y1, step) {
    var out = '<g clip-path="url(#' + clipId + ')">';
    for (var y = y0; y <= y1; y += step) {
      out += '<path d="M' + x0 + ' ' + y + 'H' + x1 + '" stroke="#BFD5AC" stroke-width=".32" opacity=".55"/>';
    }
    out += '</g>';
    return out;
  }

  function grove(cx, cy, n, rand, scale) {
    var out = '<g>';
    for (var i = 0; i < n; i++) {
      var a = rand() * Math.PI * 2;
      var d = rand() * 5.2;
      var x = round2(cx + Math.cos(a) * d);
      var y = round2(cy + Math.sin(a) * d * 0.82);
      var r = round2((1.5 + rand() * 0.8) * (scale || 1));
      out += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="url(#vmapGrove)" stroke="#A6C9A2" stroke-width=".26"/>';
      out += '<circle cx="' + round2(x - r * 0.3) + '" cy="' + round2(y - r * 0.34) + '" r="' + round2(r * 0.42) + '" fill="#DCEDD5" opacity=".85"/>';
    }
    return out + '</g>';
  }

  function buildings() {
    /* 乡村十八坊：一条南北向的作坊街，六间坡屋顶小院 */
    var out = '<g>' +
      '<rect x="21.6" y="33" width="7.2" height="27.4" rx="1.4" fill="#F1E8D8" stroke="#DFD0B4" stroke-width=".3"/>';
    for (var i = 0; i < 6; i++) {
      var y = 34.6 + i * 4.3;
      out += '<g><rect x="23.1" y="' + round2(y) + '" width="4.2" height="3" rx=".35" fill="#FBF5E9" stroke="#D6C3A2" stroke-width=".3"/>' +
        '<path d="M22.7 ' + round2(y) + 'L25.2 ' + round2(y - 1.15) + 'L27.7 ' + round2(y) + 'Z" fill="#D9C39C"/></g>';
    }
    /* 林盘院落：中部几组围合小院 */
    var yards = [[41.5, 45.5], [45.5, 54.5], [53.5, 44.5], [46.5, 62.5]];
    for (var j = 0; j < yards.length; j++) {
      var yx = yards[j][0], yy = yards[j][1];
      out += '<rect x="' + yx + '" y="' + yy + '" width="3.6" height="2.6" rx=".3" fill="#FBF5E9" stroke="#DCCBAE" stroke-width=".28"/>' +
        '<path d="M' + (yx - 0.35) + ' ' + yy + 'L' + (yx + 1.8) + ' ' + round2(yy - 1) + 'L' + (yx + 3.95) + ' ' + yy + 'Z" fill="#DCC6A4"/>';
    }
    return out + '</g>';
  }

  function baseMapSvg() {
    var rand = rng(20261031);
    var s = '<defs>' +
      '<linearGradient id="vmapGround" x1="0" y1="0" x2="0.4" y2="1">' +
        '<stop offset="0" stop-color="#F8F4E9"/><stop offset="1" stop-color="#EFE9DA"/></linearGradient>' +
      '<linearGradient id="vmapField" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#E9F2D6"/><stop offset="1" stop-color="#D5E5BE"/></linearGradient>' +
      '<linearGradient id="vmapField2" x1="1" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#EFF5E0"/><stop offset="1" stop-color="#DBE9C6"/></linearGradient>' +
      '<linearGradient id="vmapWater" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#CBE7F0"/><stop offset="1" stop-color="#9ECEDE"/></linearGradient>' +
      '<linearGradient id="vmapGrove" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#D9EACD"/><stop offset="1" stop-color="#B7D6B0"/></linearGradient>' +
      '<radialGradient id="vmapVignette" cx=".5" cy=".44" r=".8">' +
        '<stop offset=".52" stop-color="#6B5B3E" stop-opacity="0"/><stop offset="1" stop-color="#6B5B3E" stop-opacity=".14"/></radialGradient>' +
      '<pattern id="vmapGrain" width="3" height="3" patternUnits="userSpaceOnUse">' +
        '<circle cx=".8" cy=".9" r=".16" fill="#8C7A55" opacity=".16"/>' +
        '<circle cx="2.1" cy="2.3" r=".13" fill="#8C7A55" opacity=".12"/></pattern>' +
      /* 农田裁剪区，垄沟只画在田里 */
      '<clipPath id="vmapClipA"><path d="M56 45L94 39.5L98.5 69L73.5 82L57.5 67Z"/></clipPath>' +
      '<clipPath id="vmapClipB"><path d="M69.5 8L96.5 12L94.5 34L71.5 32Z"/></clipPath>' +
      '<clipPath id="vmapClipC"><path d="M35 84.5L56.5 82L58.5 96.5L37 97.5Z"/></clipPath>' +
      '</defs>';

    /* 纸底 */
    s += '<rect x="0" y="0" width="100" height="100" fill="url(#vmapGround)"/>';

    /* 农田 */
    s += '<path d="M56 45L94 39.5L98.5 69L73.5 82L57.5 67Z" fill="url(#vmapField)"/>';
    s += '<path d="M69.5 8L96.5 12L94.5 34L71.5 32Z" fill="url(#vmapField2)"/>';
    s += '<path d="M35 84.5L56.5 82L58.5 96.5L37 97.5Z" fill="url(#vmapField2)"/>';
    s += '<path d="M56 45L94 39.5L98.5 69L73.5 82L57.5 67Z" fill="none" stroke="#C4D9AE" stroke-width=".5"/>';
    s += '<path d="M69.5 8L96.5 12L94.5 34L71.5 32Z" fill="none" stroke="#C4D9AE" stroke-width=".5"/>';
    s += '<path d="M35 84.5L56.5 82L58.5 96.5L37 97.5Z" fill="none" stroke="#C4D9AE" stroke-width=".5"/>';
    s += furrows('vmapClipA', 54, 42, 100, 82, 2.3);
    s += furrows('vmapClipB', 68, 8, 98, 34, 2.1);
    s += furrows('vmapClipC', 34, 82, 60, 98, 2.1);

    /* 林地（林盘） */
    s += grove(12, 14, 7, rand, 1.05);
    s += grove(19.5, 27, 5, rand, 0.9);
    s += grove(8.5, 47, 6, rand, 0.95);
    s += grove(88, 55, 6, rand, 1);
    s += grove(90, 86, 5, rand, 0.95);
    s += grove(46, 7, 5, rand, 0.85);
    s += grove(66, 96, 5, rand, 0.9);
    s += grove(37.5, 67, 4, rand, 0.8);
    s += grove(59.5, 34, 4, rand, 0.8);

    /* 水：主渠（南缘横贯）+ 西侧支渠 + 东南水塘 */
    s += '<path d="M-2 90C14 88 26 92 40 90S66 85.5 78 89.5S96 92 102 90" fill="none" stroke="#DCEFF5" stroke-width="7" stroke-linecap="round" opacity=".8"/>';
    s += '<path d="M-2 90C14 88 26 92 40 90S66 85.5 78 89.5S96 92 102 90" fill="none" stroke="url(#vmapWater)" stroke-width="3.6" stroke-linecap="round"/>';
    s += '<path d="M18 90C16 77 20 67 18 55C16 43 20 35 18.5 23" fill="none" stroke="#DCEFF5" stroke-width="5" stroke-linecap="round" opacity=".75"/>';
    s += '<path d="M18 90C16 77 20 67 18 55C16 43 20 35 18.5 23" fill="none" stroke="url(#vmapWater)" stroke-width="2.3" stroke-linecap="round"/>';
    s += '<ellipse cx="85" cy="75" rx="8.6" ry="5.4" fill="url(#vmapWater)" opacity=".9"/>';
    s += '<ellipse cx="85" cy="75" rx="8.6" ry="5.4" fill="none" stroke="#8FC4D6" stroke-width=".4"/>';
    s += '<path d="M80.5 73.6c1.6 1 3.4 1 5 0M82.5 76.6c1.3.8 2.8.8 4.1 0" fill="none" stroke="#EAF7FB" stroke-width=".4" opacity=".9"/>';

    /* 道路 */
    s += '<path d="M-2 68C18 70 34 72 46 76C56 79 62 86 66 102" fill="none" stroke="#E4DBC6" stroke-width="4.2" stroke-linecap="round"/>';
    s += '<path d="M-2 68C18 70 34 72 46 76C56 79 62 86 66 102" fill="none" stroke="#FBF7EC" stroke-width=".5" stroke-dasharray="2.6 2.6" stroke-linecap="round"/>';
    s += '<path d="M46 76C44 60 40 44 36 30C34 20 34.5 10 34.5 -2" fill="none" stroke="#E7DFCB" stroke-width="2.6" stroke-linecap="round"/>';
    s += '<path d="M46 76C60 72 74 66 88 58C96 54 100 52 103 50" fill="none" stroke="#E7DFCB" stroke-width="2.4" stroke-linecap="round"/>';
    s += '<path d="M18 55C26 53 34 52 44 53" fill="none" stroke="#EBE3D0" stroke-width="1.8" stroke-linecap="round"/>';

    /* 建筑群 */
    s += buildings();

    /* 村口广场（游客中心所在） */
    s += '<circle cx="50" cy="80" r="8.2" fill="#F2EADA" stroke="#DED1B8" stroke-width=".4"/>';
    s += '<circle cx="50" cy="80" r="3.6" fill="#E9DEC7" stroke="#D6C7AA" stroke-width=".35"/>';
    s += '<path d="M50 76.4v7.2M46.4 80h7.2" stroke="#CFBE9E" stroke-width=".4" opacity=".8"/>';

    /* 边界虚线 */
    s += '<rect x="2.6" y="2.6" width="94.8" height="94.8" rx="4.6" fill="none" stroke="#C7BC9F" stroke-width=".5" stroke-dasharray="2.6 2.2" opacity=".75"/>';

    /* 纸纹 + 暗角 */
    s += '<rect x="0" y="0" width="100" height="100" fill="url(#vmapGrain)"/>';
    s += '<rect x="0" y="0" width="100" height="100" fill="url(#vmapVignette)"/>';
    return s;
  }

  /* --------------------------- 标签排版（防重合） ---------------------------
   * 每个标记点的文字标签是 HTML 元素，字号固定。渲染完先量出每个标签的
   * 矩形，再按「上 → 下 → 右 → 左 → 斜角 → 远位」的顺序试候选位置，
   * 第一个不与已放置矩形相交、且不出画布的位置就用它。
   * 全都放不下时把标签藏起来（opacity:0），鼠标悬停该点或放大后重新排版
   * 会再尝试显示 —— 宁可暂时不显示，也不允许文字互相压盖。
   * -------------------------------------------------------------------- */

  /* 候选槽位：按「圈」由近到远生成，每圈 16 个方向。
     早先是手写 20 个固定偏移，密集区（中部林盘、东南稻田）放不下就整片隐藏；
     扩到 5 圈后同一位置附近有更多落点可选，能显著提高标签显示率。 */
  var LABEL_SLOTS = (function () {
    var out = [];
    var rings = [20, 32, 44, 58, 72];
    var dirs = [
      [0, -1], [0, 1], [1, 0], [-1, 0],
      [.71, -.71], [-.71, -.71], [.71, .71], [-.71, .71],
      [.38, -.92], [-.38, -.92], [.92, -.38], [-.92, -.38],
      [.92, .38], [-.92, .38], [.38, .92], [-.38, .92]
    ];
    for (var r = 0; r < rings.length; r++) {
      for (var d = 0; d < dirs.length; d++) {
        out.push([Math.round(dirs[d][0] * rings[r]), Math.round(dirs[d][1] * rings[r])]);
      }
    }
    return out;
  })();

  function rectsOverlap(a, b, pad) {
    return !(a.x2 + pad <= b.x1 || b.x2 + pad <= a.x1 || a.y2 + pad <= b.y1 || b.y2 + pad <= a.y1);
  }

  function create(opts) {
    opts = opts || {};
    var el = opts.el;
    if (!el) throw new Error('virtual-map: 缺少 el');

    var minZoom = Number(opts.minZoom) || 0.6;
    var maxZoom = Number(opts.maxZoom) || 5;
    var showLegend = opts.showLegend !== false;
    var selectable = !!opts.selectable;
    var onPick = typeof opts.onPick === 'function' ? opts.onPick : function () {};
    var onMarkerClick = typeof opts.onMarkerClick === 'function' ? opts.onMarkerClick : null;

    var zoom = 1, tx = 0, ty = 0;
    var markers = opts.markers || [];
    var pinList = [];        /* 当前渲染出来的 pin 节点，与 markers 一一对应 */
    var picked = opts.picked || null;
    var side = 300;          /* 画布（正方形）边长，px */
    var ro = null;
    var tipTimer = null;
    var destroyed = false;

    el.classList.add('vmap');
    el.innerHTML =
      '<div class="vmap-toolbar">' +
        '<button type="button" class="vmap-btn" data-act="in" title="放大">+</button>' +
        '<button type="button" class="vmap-btn" data-act="out" title="缩小">−</button>' +
        '<button type="button" class="vmap-btn" data-act="reset" title="复位">⌖</button>' +
        '<span class="vmap-zoom">100%</span>' +
      '</div>' +
      '<div class="vmap-stage">' +
        '<svg class="vmap-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-label="战旗村虚拟地图">' +
          '<g class="vmap-world">' + baseMapSvg() + '</g>' +
        '</svg>' +
        '<div class="vmap-pins"></div>' +
      '</div>' +
      (showLegend ? '<div class="vmap-legend"></div>' : '') +
      '<div class="vmap-tip"></div>';

    var stage = el.querySelector('.vmap-stage');
    var svg = el.querySelector('.vmap-svg');
    var world = el.querySelector('.vmap-world');
    var pinsLayer = el.querySelector('.vmap-pins');
    var tipEl = el.querySelector('.vmap-tip');
    var zoomLabel = el.querySelector('.vmap-zoom');
    var legendEl = el.querySelector('.vmap-legend');

    if (legendEl) {
      var lg = '';
      for (var i = 0; i < ORDER.length; i++) {
        var k = ORDER[i], kd = KINDS[k];
        lg += '<span class="vmap-legend-item"><i style="background:' + kd.color + '"></i>' + kd.label + '</span>';
      }
      legendEl.innerHTML = lg;
    }

    /* ------------------------------ 视图变换 ------------------------------ */

    function clampView() {
      if (zoom >= 1) {
        var maxT = 100 - 100 / zoom;
        if (tx < 0) tx = 0; else if (tx > maxT) tx = maxT;
        if (ty < 0) ty = 0; else if (ty > maxT) ty = maxT;
      } else {
        /* 缩到比画布还小的时候居中，不然会贴左上角显得很怪 */
        var c = (100 - 100 / zoom) / 2;
        tx = c; ty = c;
      }
    }

    function applyView() {
      clampView();
      world.setAttribute('transform', 'translate(' + (-tx * zoom) + ',' + (-ty * zoom) + ') scale(' + zoom + ')');
      if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%';
      placePins();
    }

    function setZoom(z, focusX, focusY) {
      var nz = Math.min(maxZoom, Math.max(minZoom, z));
      if (Math.abs(nz - zoom) < 1e-6) return;
      var fx = (focusX === null || focusX === undefined) ? tx + 50 / zoom : focusX;
      var fy = (focusY === null || focusY === undefined) ? ty + 50 / zoom : focusY;
      /* 焦点处的世界坐标不变：fx/zoom + tx = fx/nz + tx' */
      tx = fx / zoom + tx - fx / nz;
      ty = fy / zoom + ty - fy / nz;
      zoom = nz;
      applyView();
    }

    function resetView() {
      zoom = 1; tx = 0; ty = 0;
      applyView();
    }

    /* ------------------------------ 标记点渲染 ---------------------------- */

    /*
     * 标记的唯一键。
     * 调用方传进来的对象不一定带 id：游客端 mapMarkers 用的是 { key, kind, refId, ... }，
     * 商家/管理员端用的是 { id, name, x, y }。早先这里只认 m.id，结果所有标记的
     * data-id 都是 "undefined"，去重时被当成同一个对象，只画出第一个点。
     * 所以这里做一次归一：id → key → refId → 下标，保证每个标记都有稳定且唯一的键。
     */
    function markerKey(m, i) {
      if (m.id !== undefined && m.id !== null && m.id !== '') return String(m.id);
      if (m.key !== undefined && m.key !== null && m.key !== '') return String(m.key);
      if (m.refId !== undefined && m.refId !== null && m.refId !== '') return String(m.refId);
      return 'idx-' + i;
    }

    function pinHtml(m, key) {
      var kd = KINDS[m.kind] || KINDS.spot;
      return '<button type="button" class="vmap-pin" data-kind="' + esc(m.kind) + '" ' +
        'data-id="' + esc(key) + '" tabindex="0" ' +
        'aria-label="' + esc(m.name) + '">' +
        '<span class="vmap-dot">' +
          '<svg class="vmap-glyph" viewBox="0 0 24 24" aria-hidden="true" style="color:' + kd.color + '">' +
            (GLYPHS[kd.glyph] || GLYPHS.star) +
          '</svg>' +
        '</span>' +
        '<span class="vmap-label">' + esc(m.name) + '</span>' +
      '</button>';
    }

    function renderMarkers() {
      pinsLayer.innerHTML = '';
      pinList = [];
      var seen = {};
      for (var i = 0; i < markers.length; i++) {
        var m = markers[i];
        if (!m) continue;
        var key = markerKey(m, i);
        if (seen[key]) continue;
        var x = clampPct(m.x), y = clampPct(m.y);
        if (x === null || y === null) continue;   /* 未标点的对象不画 */
        seen[key] = 1;
        m._x = x; m._y = y;
        pinsLayer.insertAdjacentHTML('beforeend', pinHtml(m, key));
      }
      /* 节点和标记对象一一对应地存下来，比事后按 data-id 反查更可靠 */
      var byKey = {};
      for (var t0 = 0; t0 < markers.length; t0++) if (markers[t0]) byKey[markerKey(markers[t0], t0)] = markers[t0];
      var nodes = pinsLayer.querySelectorAll('.vmap-pin');
      for (var j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        var mm = byKey[node.getAttribute('data-id')];
        if (!mm) continue;
        node.__marker = mm;
        pinList.push(node);
        (function (nd, mk) {
          nd.addEventListener('click', function (ev) {
            ev.stopPropagation();
            showTip(mk);
            if (typeof mk.onClick === 'function') mk.onClick(mk);
            else if (onMarkerClick) onMarkerClick(mk);
          });
          nd.addEventListener('mouseenter', function () {
            nd.classList.add('is-hover');
            /* 悬停时强制显示被藏起来的标签，并且恢复完整名字（平时可能是截断版） */
            var lb = nd.querySelector('.vmap-label');
            if (!lb) return;
            lb.textContent = mk.name || '';
            lb.classList.remove('is-hidden');
          });
          nd.addEventListener('mouseleave', function () {
            nd.classList.remove('is-hover');
            placePins();
          });
        })(node, mm);
      }
      placePins();
      renderPicked();
    }

    /* 把世界坐标换成画布内 px 坐标 */
    function toPx(wx, wy) {
      return { x: (wx - tx) * zoom / 100 * side, y: (wy - ty) * zoom / 100 * side };
    }

    /* 名字太长时截断的备用写法：既保证「至少认得出是哪一类地方」，
       又不让一个长标签吃掉两三个邻位的空间。 */
    function shortName(name) {
      var s = String(name || '');
      /* 去掉「战旗村」「天府粮仓 · 」这类前缀修饰，只留主干 */
      s = s.replace(/^战旗村/, '').replace(/^乡村/, '').replace(/^天府粮仓\s*[·・]\s*/, '');
      if (s.length <= 5) return s;
      return s.slice(0, 5) + '…';
    }

    /*
     * 标签排版：贪心放置，保证任意两个可见标签矩形不相交。
     * 三条策略（都是为了「默认缩放下不要把一半标签藏起来」）：
     *   1. 点位（spot）优先占位 —— 14 个打卡点是游客最需要看的信息；
     *   2. 放不下先试截断短名，再不行才隐藏；
     *   3. 放大到 1.6 倍以上时槽位间距收紧（pad 变小），尽量全显。
     */
    function placePins() {
      if (destroyed) return;
      var pins = pinsLayer.querySelectorAll('.vmap-pin');
      if (!pins.length) return;
      var placed = [];
      var pad = zoom >= 1.6 ? 1 : 3;
      var order = [];
      for (var i = 0; i < pins.length; i++) {
        var m0 = pins[i].__marker;
        var rank = m0 && m0.kind === 'spot' ? 0 : 1;
        order.push({ node: pins[i], rank: rank, idx: i });
      }
      order.sort(function (a, b) { return a.rank - b.rank || a.idx - b.idx; });

      for (var oi = 0; oi < order.length; oi++) {
        var node = order[oi].node;
        var m = node.__marker;
        if (!m) continue;
        var p = toPx(m._x, m._y);
        node.style.left = p.x + 'px';
        node.style.top = p.y + 'px';
        /* 超出画布的点仍然渲染（放大后可能露出来），但要淡出，避免压在边缘 */
        var out = p.x < -2 || p.y < -2 || p.x > side + 2 || p.y > side + 2;
        node.classList.toggle('is-out', out);

        var lb = node.querySelector('.vmap-label');
        if (!lb) continue;
        var full = m.name || '';
        var cand = [full];
        var sn = shortName(full);
        if (sn && sn !== full) cand.push(sn);

        var best = null;
        for (var ci = 0; ci < cand.length && !best; ci++) {
          if (lb.textContent !== cand[ci]) lb.textContent = cand[ci];
          var w = lb.offsetWidth, h = lb.offsetHeight;
          for (var s = 0; s < LABEL_SLOTS.length; s++) {
            var dx = LABEL_SLOTS[s][0], dy = LABEL_SLOTS[s][1];
            var cx = p.x + dx, cy = p.y + dy;
            var r = { x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 };
            if (r.x1 < 1 || r.y1 < 1 || r.x2 > side - 1 || r.y2 > side - 1) continue;
            var hit = false;
            for (var q = 0; q < placed.length; q++) if (rectsOverlap(r, placed[q], pad)) { hit = true; break; }
            if (!hit) { best = { dx: dx, dy: dy, r: r }; break; }
          }
        }
        if (best) {
          placed.push(best.r);
          lb.style.transform = 'translate(calc(-50% + ' + best.dx + 'px), calc(-50% + ' + best.dy + 'px))';
          lb.classList.remove('is-hidden');
        } else {
          /* 全放不下：恢复全名再隐藏，鼠标悬停时仍然读得到完整名字 */
          if (lb.textContent !== full) lb.textContent = full;
          lb.style.transform = 'translate(-50%, -50%)';
          lb.classList.add('is-hidden');
        }
      }
    }

    function showTip(m) {
      if (!tipEl) return;
      var kd = KINDS[m.kind] || KINDS.spot;
      tipEl.innerHTML = '<b>' + esc(m.name) + '</b>' +
        '<span class="vmap-tip-kind" style="color:' + kd.color + '">' + kd.label + '</span>' +
        (m.subtitle ? '<span>' + esc(m.subtitle) + '</span>' : '');
      tipEl.classList.add('on');
      if (tipTimer) clearTimeout(tipTimer);
      tipTimer = setTimeout(function () { tipEl.classList.remove('on'); }, 2600);
    }

    /* ------------------------------ 选点标记 ------------------------------ */

    function renderPicked() {
      var old = pinsLayer.querySelector('.vmap-picked');
      if (old) old.parentNode.removeChild(old);
      if (!picked || clampPct(picked.x) === null || clampPct(picked.y) === null) return;
      var p = toPx(clampPct(picked.x), clampPct(picked.y));
      var d = document.createElement('div');
      d.className = 'vmap-picked';
      d.style.left = p.x + 'px';
      d.style.top = p.y + 'px';
      pinsLayer.appendChild(d);
    }

    /* ------------------------------ 尺寸同步 ------------------------------ */

    function measure() {
      var w = stage.clientWidth, h = stage.clientHeight;
      side = Math.max(1, Math.min(w, h));
      pinsLayer.style.width = side + 'px';
      pinsLayer.style.height = side + 'px';
      pinsLayer.style.left = Math.round((w - side) / 2) + 'px';
      pinsLayer.style.top = Math.round((h - side) / 2) + 'px';
    }

    function relayout() {
      measure();
      placePins();
      renderPicked();
    }

    /* ------------------------------ 交互：拖拽 ---------------------------- */

    var drag = null;
    var dragMoved = false;

    function onPointerDown(ev) {
      if (ev.button !== 0) return;
      if (ev.target.closest && ev.target.closest('.vmap-pin')) return;
      drag = { x: ev.clientX, y: ev.clientY, tx: tx, ty: ty, id: ev.pointerId };
      dragMoved = false;
      try { stage.setPointerCapture(ev.pointerId); } catch (e) {}
    }

    function onPointerMove(ev) {
      if (!drag || drag.id !== ev.pointerId) return;
      var dxp = ev.clientX - drag.x, dyp = ev.clientY - drag.y;
      if (!dragMoved && Math.abs(dxp) + Math.abs(dyp) < 3) return;
      if (zoom <= 1) return;             /* 没放大时地图铺满画布，没得拖 */
      dragMoved = true;
      tx = drag.tx - dxp / side * 100 / zoom;
      ty = drag.ty - dyp / side * 100 / zoom;
      applyView();
    }

    function onPointerUp(ev) {
      if (!drag || (ev.pointerId !== undefined && drag.id !== ev.pointerId)) return;
      var moved = dragMoved;
      drag = null; dragMoved = false;
      try { stage.releasePointerCapture(ev.pointerId); } catch (e) {}
      if (moved) {
        stage.dataset.suppressClick = '1';
        setTimeout(function () { delete stage.dataset.suppressClick; }, 0);
      }
    }

    /* ------------------------------ 交互：选点 ---------------------------- */

    function toMapCoord(clientX, clientY) {
      var rect = stage.getBoundingClientRect();
      var vx = (clientX - rect.left - (rect.width - side) / 2) / side * 100;
      var vy = (clientY - rect.top - (rect.height - side) / 2) / side * 100;
      if (vx < -1 || vy < -1 || vx > 101 || vy > 101) return null;
      return {
        x: clampPct(Math.min(100, Math.max(0, vx / zoom + tx))),
        y: clampPct(Math.min(100, Math.max(0, vy / zoom + ty)))
      };
    }

    function onStageClick(ev) {
      if (stage.dataset.suppressClick) return;
      if (ev.target.closest && ev.target.closest('.vmap-pin')) return;
      if (!selectable) return;
      var c = toMapCoord(ev.clientX, ev.clientY);
      if (!c) return;
      /* 再点同一处（±6%）取消：想微调时点一下不会把已选的清掉 */
      if (picked && Math.abs(picked.x - c.x) <= 6 && Math.abs(picked.y - c.y) <= 6) {
        picked = null;
        renderPicked();
        onPick(null, null);
        showTip({ name: '已取消选点', kind: 'spot' });
        return;
      }
      picked = { x: round2(c.x), y: round2(c.y) };
      renderPicked();
      onPick(picked.x, picked.y);
      showTip({ name: '已选点', subtitle: picked.x + ', ' + picked.y, kind: 'spot' });
    }

    /* ------------------------------ 交互：滚轮 / 工具栏 -------------------- */

    function onWheel(ev) {
      ev.preventDefault();
      var c = toMapCoord(ev.clientX, ev.clientY);
      setZoom(zoom * (ev.deltaY < 0 ? 1.16 : 0.86), c ? c.x : null, c ? c.y : null);
    }

    function onToolbarClick(ev) {
      var btn = ev.target.closest ? ev.target.closest('.vmap-btn') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'in') setZoom(zoom * 1.3);
      else if (act === 'out') setZoom(zoom / 1.3);
      else resetView();
    }

    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);
    stage.addEventListener('click', onStageClick);
    stage.addEventListener('wheel', onWheel, { passive: false });
    var toolbar = el.querySelector('.vmap-toolbar');
    if (toolbar) toolbar.addEventListener('click', onToolbarClick);
    if (selectable) stage.style.cursor = 'crosshair';

    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(function () { relayout(); });
      ro.observe(stage);
    } else {
      window.addEventListener('resize', relayout);
    }

    measure();
    renderMarkers();
    applyView();

    return {
      setMarkers: function (list) {
        markers = list || [];
        renderMarkers();
      },
      setPicked: function (p) {
        picked = (p && clampPct(p.x) !== null && clampPct(p.y) !== null) ? { x: clampPct(p.x), y: clampPct(p.y) } : null;
        renderPicked();
      },
      getPicked: function () { return picked ? { x: picked.x, y: picked.y } : null; },
      zoomIn: function () { setZoom(zoom * 1.3); },
      zoomOut: function () { setZoom(zoom / 1.3); },
      reset: function () { resetView(); },
      relayout: function () { relayout(); },
      /*
       * 把某个世界坐标点摆到画布正中，并缩放到 z（不传 z 就用当前缩放）。
       * 详情页「在村内地图中查看」靠它对准目标点：只切页面不对视口的话，
       * 用户还是得自己在图上找一遍，等于没跳。
       */
      focus: function (x, y, z) {
        var cx = clampPct(x), cy = clampPct(y);
        if (cx === null || cy === null) return;
        if (z !== undefined && z !== null) zoom = Math.min(maxZoom, Math.max(minZoom, z));
        tx = cx - 50 / zoom;
        ty = cy - 50 / zoom;
        applyView();
      },
      destroy: function () {
        destroyed = true;
        if (ro) { try { ro.disconnect(); } catch (e) {} }
        window.removeEventListener('resize', relayout);
        if (tipTimer) clearTimeout(tipTimer);
        el.innerHTML = '';
        el.classList.remove('vmap');
      }
    };
  }

  window.ZQMap = { create: create, KINDS: KINDS, ORDER: ORDER };
})();
