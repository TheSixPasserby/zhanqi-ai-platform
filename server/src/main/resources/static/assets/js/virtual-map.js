/* ============================================================================
 *  战旗村虚拟地图（三端共用，零构建）
 *
 *  设计取舍：
 *   · **用 SVG 画底图，不用位图**。位图放大就糊，而这张地图的核心用法就是「放大看细节」；
 *     SVG 是矢量，缩到 4 倍仍然清晰，而且底图数据只有几 KB，离线可用。
 *   · **坐标用 0-100 百分比**，与数据库 mapX/mapY 一致。
 *     这样任何缩放级别下都不用换算，窗口尺寸变化也不会错位。
 *   · **平移/缩放自己做，不用第三方库**（项目红线：不许引入 npm / CDN）。
 *     实现方式是给内层 <g> 加 transform: translate + scale，指针事件换算成地图坐标。
 *
 *  底图内容按战旗村实际形态画：
 *   · 都江堰水系引来的水渠（横贯中部，带分叉）
 *   · 川西林盘：成片的竹林/院落（中部为主）
 *   · 连片农田（东南侧稻田、北侧菜地）
 *   · 乡村十八坊街区（西侧一条街）
 *   · 村口广场与集市（南侧入口）
 *   · 道路网（主干道 + 田埂小路）
 * ========================================================================== */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /** 类别 → 视觉样式（颜色/图标路径）。三类商品与点位、活动各用一种颜色，一眼能分清。 */
  var KINDS = {
    spot:     { color: '#146B57', fill: '#E6F2ED', label: '点位',   r: 3.2 },
    study:    { color: '#2F6BA8', fill: '#EAF1F9', label: '研学',   r: 3.4 },
    homestay: { color: '#7A4FA3', fill: '#F1EAF7', label: '民宿',   r: 3.4 },
    experience:{ color: '#B07A18', fill: '#FCF4E2', label: '农事', r: 3.4 },
    activity: { color: '#BE5230', fill: '#FBEDE7', label: '活动',   r: 3.0 },
  };

  /**
   * 画出战旗村底图（矢量）。
   * 所有图形都在 0-100 的坐标系里，与数据库坐标一致。
   * 用 <defs> 里的渐变换取「水」「田」「林」的层次感，避免整体扁平。
   */
  function baseMapSvg() {
    return [
      '<defs>',
      '  <linearGradient id="vmapField" x1="0" y1="0" x2="0" y2="1">',
      '    <stop offset="0%" stop-color="#EBF3E2"/><stop offset="100%" stop-color="#DCEAD0"/>',
      '  </linearGradient>',
      '  <linearGradient id="vmapWater" x1="0" y1="0" x2="1" y2="0">',
      '    <stop offset="0%" stop-color="#BBDDE8"/><stop offset="100%" stop-color="#9ED0E0"/>',
      '  </linearGradient>',
      '  <linearGradient id="vmapForest" x1="0" y1="0" x2="1" y2="1">',
      '    <stop offset="0%" stop-color="#CFE4CE"/><stop offset="100%" stop-color="#B4D6B6"/>',
      '  </linearGradient>',
      '  <pattern id="vmapHatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">',
      '    <rect width="2" height="2" fill="transparent"/>',
      '    <line x1="0" y1="0" x2="0" y2="2" stroke="#FFFFFF" stroke-opacity=".5" stroke-width=".4"/>',
      '  </pattern>',
      '</defs>',
      /* 底色：宣纸米白 + 淡绿，模拟俯瞰农田 */
      '<rect x="0" y="0" width="100" height="100" fill="#F4F1E8"/>',
      '<rect x="0" y="0" width="100" height="100" fill="url(#vmapField)" opacity=".55"/>',
      /* 农田地块：东南连片稻田 + 北侧菜地（用斜纹区分） */
      '<g opacity=".9">',
      '  <path d="M58,54 L86,48 L92,74 L62,82 Z" fill="#E4EFD8" stroke="#C9DCB8" stroke-width=".4"/>',
      '  <path d="M58,54 L86,48 L92,74 L62,82 Z" fill="url(#vmapHatch)" opacity=".45"/>',
      '  <path d="M30,12 L64,10 L68,26 L34,30 Z" fill="#EAF3DE" stroke="#C9DCB8" stroke-width=".4"/>',
      '  <path d="M30,12 L64,10 L68,26 L34,30 Z" fill="url(#vmapHatch)" opacity=".4"/>',
      '  <path d="M12,40 L26,38 L28,58 L14,60 Z" fill="#EAF3DE" stroke="#C9DCB8" stroke-width=".4"/>',
      '</g>',
      /* 林盘：中部成片竹林（圆润不规则块，模拟院落+林木） */
      '<g>',
      '  <path d="M34,42 C38,38 48,37 54,40 C60,43 62,50 58,56 C54,62 44,64 38,60 C32,56 30,48 34,42 Z"',
      '        fill="url(#vmapForest)" opacity=".85" stroke="#A8CCA9" stroke-width=".4"/>',
      '  <circle cx="40" cy="46" r="2.1" fill="#9CC79D" opacity=".65"/>',
      '  <circle cx="46" cy="50" r="2.6" fill="#93BE94" opacity=".6"/>',
      '  <circle cx="52" cy="46" r="2.3" fill="#9CC79D" opacity=".65"/>',
      '  <circle cx="44" cy="55" r="1.9" fill="#93BE94" opacity=".6"/>',
      '  <circle cx="37" cy="52" r="1.7" fill="#9CC79D" opacity=".6"/>',
      '</g>',
      /* 西侧十八坊街区：一条街 + 两侧作坊 */
      '<g>',
      '  <rect x="22" y="34" width="6" height="26" rx="1.2" fill="#F0E6D6" stroke="#D8C9B0" stroke-width=".4"/>',
      '  <g fill="#DCC9A8" opacity=".85">',
      '    <rect x="20" y="38" width="3.2" height="3.2" rx=".5"/>',
      '    <rect x="20" y="45" width="3.2" height="3.2" rx=".5"/>',
      '    <rect x="20" y="52" width="3.2" height="3.2" rx=".5"/>',
      '    <rect x="26.8" y="38" width="3.2" height="3.2" rx=".5"/>',
      '    <rect x="26.8" y="45" width="3.2" height="3.2" rx=".5"/>',
      '    <rect x="26.8" y="52" width="3.2" height="3.2" rx=".5"/>',
      '  </g>',
      '</g>',
      /* 都江堰水系：主渠横贯中部偏南，向上分出两条支渠 */
      '<g stroke="url(#vmapWater)" fill="none" stroke-linecap="round">',
      '  <path d="M2,66 C16,64 28,66 40,64 C54,62 70,64 98,60" stroke-width="2.2"/>',
      '  <path d="M30,65 C32,56 34,48 36,38" stroke-width="1.1" opacity=".85"/>',
      '  <path d="M60,63 C64,54 66,42 68,32" stroke-width="1.1" opacity=".85"/>',
      '</g>',
      /* 道路：主干道（南入口向北贯穿）+ 田埂小路 */
      '<g stroke="#E0D9C8" fill="none" stroke-linecap="round">',
      '  <path d="M50,98 C50,84 48,70 50,56 C52,44 50,30 50,16" stroke-width="2.6"/>',
      '  <path d="M14,80 C26,78 38,76 50,78 C64,80 78,78 90,76" stroke-width="1.2" opacity=".9"/>',
      '  <path d="M34,60 C42,58 50,58 58,60" stroke-width="1" opacity=".8"/>',
      '  <path d="M64,56 C70,50 74,42 76,34" stroke-width="1" opacity=".8"/>',
      '</g>',
      /* 村口广场（南）：浅色圆形铺地 */
      '<circle cx="50" cy="80" r="7.5" fill="#EFEADF" opacity=".8" stroke="#DED6C6" stroke-width=".5"/>',
      '<circle cx="50" cy="80" r="4.2" fill="#F6F2E9" stroke="#DED6C6" stroke-width=".4"/>',
      /* 指北针（右上角） */
      '<g transform="translate(92,8)" opacity=".65">',
      '  <circle r="3.4" fill="#FFFFFF" fill-opacity=".9" stroke="#C9C0AE" stroke-width=".3"/>',
      '  <path d="M0,-2.6 L1.2,0 L0,2.6 L-1.2,0 Z" fill="#8C8578"/>',
      '  <text x="0" y="-4.4" font-size="2.4" text-anchor="middle" fill="#8C8578">N</text>',
      '</g>',
      /* 图例背景（左下） */
      '<rect x="2" y="88" width="34" height="10" rx="1.4" fill="#FFFFFF" fill-opacity=".82" stroke="#E2DCCD" stroke-width=".3"/>',
    ].join('');
  }

  /** 把 0-100 的地图坐标转成 SVG viewBox 内的像素（viewBox 就是 0 0 100 100，直接用） */
  function clampPct(v) {
    var n = Number(v);
    if (!isFinite(n)) { return null; }
    return Math.max(0, Math.min(100, n));
  }

  /**
   * 创建地图控件。
   *
   * @param {object} opts
   *   el        容器 DOM（必填）
   *   markers   标记数组 [{ id, name, kind, x, y, subtitle, cover, onClick }]
   *   selectable 是否可选点模式（true 时点击空白会回调 onPick）
   *   onPick    function(x, y) 选点回调；传 null 坐标表示「取消已选点」
   *   picked    初始已选点 {x, y} 或 null
   *   showLegend 是否显示图例（默认 true）
   *   minZoom / maxZoom 缩放范围（默认 1 / 5）
   * @returns 控制对象 { setMarkers, setPicked, zoomIn, zoomOut, reset, destroy }
   */
  function create(opts) {
    opts = opts || {};
    var el = opts.el;
    if (!el) { throw new Error('virtual-map: 缺少 el'); }
    var markers = opts.markers || [];
    var selectable = !!opts.selectable;
    var onPick = typeof opts.onPick === 'function' ? opts.onPick : null;
    var picked = opts.picked || null;
    // 全局标记点击回调（侧栏/地图统一点击行为）；单个 marker 的 onClick 优先级更高
    var onMarkerClick = typeof opts.onMarkerClick === 'function' ? opts.onMarkerClick : null;
    var showLegend = opts.showLegend !== false;
    // 允许缩到 0.6 倍：地图全貌之外留一点白，比「最小 100%」更符合常见地图体验
    var minZoom = Number(opts.minZoom) || 0.6;
    var maxZoom = Number(opts.maxZoom) || 5;

    // 视图状态：缩放倍数 + 平移量（都在 0-100 的地图坐标单位里）
    var zoom = 1;
    var tx = 0;
    var ty = 0;

    el.classList.add('vmap');
    el.innerHTML = [
      '<div class="vmap-toolbar">',
      '  <button class="vmap-btn" data-act="in" title="放大">＋</button>',
      '  <button class="vmap-btn" data-act="out" title="缩小">－</button>',
      '  <button class="vmap-btn" data-act="reset" title="复位">⟲</button>',
      '  <span class="vmap-zoom">100%</span>',
      '</div>',
      '<div class="vmap-stage">',
      '  <svg class="vmap-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">',
      '    <g class="vmap-world">',
      baseMapSvg(),
      '      <g class="vmap-markers"></g>',
      '      <g class="vmap-picked"></g>',
      '    </g>',
      '  </svg>',
      (showLegend ? '<div class="vmap-legend"></div>' : ''),
      '<div class="vmap-tip"></div>',
      '</div>',
    ].join('');

    var svg = el.querySelector('.vmap-svg');
    var world = el.querySelector('.vmap-world');
    var markerLayer = el.querySelector('.vmap-markers');
    var pickedLayer = el.querySelector('.vmap-picked');
    var zoomLabel = el.querySelector('.vmap-zoom');
    var tipEl = el.querySelector('.vmap-tip');
    var stage = el.querySelector('.vmap-stage');

    /* ---------------------------- 图例 ---------------------------- */
    if (showLegend) {
      var legend = el.querySelector('.vmap-legend');
      legend.innerHTML = Object.keys(KINDS).map(function (k) {
        var it = KINDS[k];
        return '<span class="vmap-legend-item"><i style="background:' + it.color + '"></i>' + it.label + '</span>';
      }).join('');
    }

    /* ---------------------------- 视图变换 ---------------------------- */
    /**
     * 视图变换模型（唯一事实来源）：
     *   视口坐标 v = (世界坐标 p − t) × k
     *   世界坐标 p = v / k + t
     * 其中 t = (tx, ty) 是当前视口左上角对应的地图坐标，k = zoom。
     * 所有缩放/平移只改 (tx, ty, k)，这两个公式在 setZoom / 拖拽 / 选点里全部复用，
     * 避免「一边用近似换算、另一边用另一套公式」导致点位置漂移。
     */
    function applyView() {
      var k = zoom;
      // 约束：
      //   k >= 1 时视口比地图小，不能移出地图边界（0 ~ 100-100/k）；
      //   k < 1 时视口比地图大，地图应居中，此时边界为负值（(100-100/k)/2 两侧留白）。
      if (k >= 1) {
        var maxT = 100 - 100 / k;
        tx = Math.max(0, Math.min(maxT, tx));
        ty = Math.max(0, Math.min(maxT, ty));
      } else {
        var center = (100 - 100 / k) / 2;
        tx = center;
        ty = center;
      }
      // SVG 变换按从右到左应用：先平移 -t，再缩放 k
      world.setAttribute('transform',
        'translate(' + (-tx * k) + ',' + (-ty * k) + ') scale(' + k + ')');
      if (zoomLabel) { zoomLabel.textContent = Math.round(zoom * 100) + '%'; }
    }

    /**
     * 以某个地图坐标点为中心缩放。
     * 推导：希望焦点 f 在缩放前后都停在同一个视口位置 v = (f - t) × k，
     * 于是 t' = f - v / k'，其中 v = (f - t) × k。
     */
    function setZoom(z, focusX, focusY) {
      var nz = Math.max(minZoom, Math.min(maxZoom, z));
      var fx = (focusX == null ? (tx + 50 / zoom) : focusX);
      var fy = (focusY == null ? (ty + 50 / zoom) : focusY);
      var ratio = nz / zoom;
      tx = fx - (fx - tx) / ratio;
      ty = fy - (fy - ty) / ratio;
      zoom = nz;
      applyView();
    }

    function resetView() {
      zoom = 1; tx = 0; ty = 0;
      applyView();
    }

    /* ---------------------------- 标记 ---------------------------- */
    function renderMarkers() {
      markerLayer.innerHTML = '';
      markers.forEach(function (m) {
        var x = clampPct(m.x);
        var y = clampPct(m.y);
        if (x === null || y === null) { return; }   // 未标点的对象不画，避免堆在左上角
        var kind = KINDS[m.kind] || KINDS.spot;
        var g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'vmap-marker');
        g.setAttribute('transform', 'translate(' + x + ',' + y + ')');
        // 放大后再让标记保持视觉大小恒定：反向缩放，避免标记随地图一起变大
        g.setAttribute('data-kind', m.kind || 'spot');
        var circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('r', kind.r);
        circle.setAttribute('fill', kind.fill);
        circle.setAttribute('stroke', kind.color);
        circle.setAttribute('stroke-width', '0.7');
        g.appendChild(circle);
        var dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('r', kind.r * 0.42);
        dot.setAttribute('fill', kind.color);
        g.appendChild(dot);
        var label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('y', -kind.r - 1.2);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '2.6');
        label.setAttribute('fill', '#3B4A44');
        label.setAttribute('class', 'vmap-label');
        label.textContent = m.name || '';
        g.appendChild(label);
        g.style.cursor = 'pointer';
        g.addEventListener('click', function (ev) {
          ev.stopPropagation();
          showTip(m);
          if (typeof m.onClick === 'function') { m.onClick(m); }
          else if (onMarkerClick) { onMarkerClick(m); }
        });
        markerLayer.appendChild(g);
      });
    }

    function showTip(m) {
      if (!tipEl) { return; }
      tipEl.innerHTML = '<b>' + (m.name || '') + '</b>' +
        (m.subtitle ? '<span>' + m.subtitle + '</span>' : '');
      tipEl.classList.add('on');
      clearTimeout(showTip._t);
      showTip._t = setTimeout(function () { tipEl.classList.remove('on'); }, 2600);
    }

    /* ---------------------------- 选点 ---------------------------- */
    function renderPicked() {
      pickedLayer.innerHTML = '';
      if (!picked || clampPct(picked.x) === null || clampPct(picked.y) === null) { return; }
      var x = clampPct(picked.x), y = clampPct(picked.y);
      var g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', 'translate(' + x + ',' + y + ')');
      var halo = document.createElementNS(SVG_NS, 'circle');
      halo.setAttribute('r', '5.2');
      halo.setAttribute('fill', '#BE5230');
      halo.setAttribute('fill-opacity', '.18');
      halo.setAttribute('stroke', '#BE5230');
      halo.setAttribute('stroke-width', '.6');
      halo.setAttribute('stroke-dasharray', '1.2 1');
      g.appendChild(halo);
      var pin = document.createElementNS(SVG_NS, 'circle');
      pin.setAttribute('r', '1.9');
      pin.setAttribute('fill', '#BE5230');
      g.appendChild(pin);
      pickedLayer.appendChild(g);
    }

    /**
     * 屏幕坐标 → 地图 0-100 坐标。
     * 注意 SVG 的 viewBox 是正方形但容器可能是长方形的（preserveAspectRatio=xMidYMid meet），
     * 所以要先算「实际绘制区域」再归一，否则长宽比不一致时点会偏。
     */
    function toMapCoord(clientX, clientY) {
      var rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) { return null; }
      // 正方形 viewBox 在长方形容器里会居中留白，取较小的边作为实际绘制边长
      var side = Math.min(rect.width, rect.height);
      var padX = (rect.width - side) / 2;
      var padY = (rect.height - side) / 2;
      var vx = (clientX - rect.left - padX) / side * 100;
      var vy = (clientY - rect.top - padY) / side * 100;
      if (vx < 0 || vx > 100 || vy < 0 || vy > 100) { return null; }
      return { x: clampPct(vx / zoom + tx), y: clampPct(vy / zoom + ty) };
    }

    if (selectable) {
      svg.style.cursor = 'crosshair';
      svg.addEventListener('click', function (ev) {
        // 点标记时不触发选点（标记自己 stopPropagation 了，这里是双保险）
        if (ev.target.closest && ev.target.closest('.vmap-marker')) { return; }
        var c = toMapCoord(ev.clientX, ev.clientY);
        if (!c) { return; }
        // **再次点击同一位置附近 → 取消已选点**（需求：再点一下可取消）
        if (picked && Math.abs(c.x - picked.x) < 6 && Math.abs(c.y - picked.y) < 6) {
          picked = null;
          renderPicked();
          if (onPick) { onPick(null, null); }
          showTip({ name: '已取消选点', subtitle: '再点地图任意位置可重新选点' });
          return;
        }
        picked = { x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100 };
        renderPicked();
        if (onPick) { onPick(picked.x, picked.y); }
        showTip({ name: '已选点', subtitle: '坐标 x=' + picked.x + ' · y=' + picked.y + '（再点同一处可取消）' });
      });
    }

    /* ---------------------------- 拖拽平移 ---------------------------- */
    var dragging = false, dragStart = null, dragMoved = false;
    svg.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) { return; }
      dragging = true;
      dragMoved = false;
      dragStart = { x: ev.clientX, y: ev.clientY, tx: tx, ty: ty };
      svg.setPointerCapture && svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener('pointermove', function (ev) {
      if (!dragging || zoom <= 1) { return; }   // 100% 时不拖动（没内容可移）
      var rect = svg.getBoundingClientRect();
      var dx = (ev.clientX - dragStart.x) / rect.width * 100 / zoom;
      var dy = (ev.clientY - dragStart.y) / rect.height * 100 / zoom;
      if (Math.abs(ev.clientX - dragStart.x) > 3 || Math.abs(ev.clientY - dragStart.y) > 3) { dragMoved = true; }
      tx = dragStart.tx - dx;
      ty = dragStart.ty - dy;
      applyView();
    });
    function endDrag(ev) {
      if (!dragging) { return; }
      dragging = false;
      // 拖动结束后不要触发选点（否则每次拖地图都会落一个点）
      if (dragMoved) { svg.dataset.suppressClick = '1'; setTimeout(function () { delete svg.dataset.suppressClick; }, 0); }
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    // 抑制拖拽后的误点击
    svg.addEventListener('click', function (ev) {
      if (svg.dataset.suppressClick) { ev.stopImmediatePropagation(); }
    }, true);

    /* ---------------------------- 滚轮缩放 ---------------------------- */
    stage.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var c = toMapCoord(ev.clientX, ev.clientY);
      setZoom(zoom * (ev.deltaY < 0 ? 1.16 : 0.86), c ? c.x : null, c ? c.y : null);
    }, { passive: false });

    /* ---------------------------- 工具栏 ---------------------------- */
    el.querySelector('.vmap-toolbar').addEventListener('click', function (ev) {
      var btn = ev.target.closest('.vmap-btn');
      if (!btn) { return; }
      var act = btn.getAttribute('data-act');
      if (act === 'in') { setZoom(zoom * 1.3); }
      else if (act === 'out') { setZoom(zoom / 1.3); }
      else { resetView(); }
    });

    renderMarkers();
    renderPicked();
    applyView();

    return {
      setMarkers: function (list) { markers = list || []; renderMarkers(); },
      setPicked: function (p) { picked = p || null; renderPicked(); },
      getPicked: function () { return picked; },
      zoomIn: function () { setZoom(zoom * 1.3); },
      zoomOut: function () { setZoom(zoom / 1.3); },
      reset: resetView,
      destroy: function () { el.innerHTML = ''; el.classList.remove('vmap'); }
    };
  }

  window.ZQMap = { create: create, KINDS: KINDS };
})();
