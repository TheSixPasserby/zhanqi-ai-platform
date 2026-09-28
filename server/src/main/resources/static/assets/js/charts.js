/* ============================================================================
   纯 SVG 图表组件（Vue 2 全局组件，管理后台 / 工作台共用）
   不引任何图表库：4 个组件加起来不到 200 行，页面加载更快，
   而且配色能直接复用设计令牌，跟整体视觉完全一致。
   ============================================================================ */
(function () {
  'use strict';

  var BRAND = '#146B57';
  var BRAND2 = '#1D9E75';
  var ACCENT = '#BE5230';
  var WARN = '#B07A18';
  var INFO = '#2F6BA8';

  var chartCss = document.createElement('style');
  chartCss.textContent = [
    '.zq-chart { width: 100%; display: block; overflow: visible; }',
    '.zq-chart .grid { stroke: #E8E4DA; stroke-width: 1; }',
    '.zq-chart .axis { fill: #93A09A; font-size: 11px; font-family: inherit; }',
    '.zq-chart .line { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }',
    '.zq-chart .dot { stroke: #fff; stroke-width: 2; transition: r .18s ease; }',
    '.zq-chart .dot:hover { r: 6; }',
    '.zq-chart .draw { animation: zqDraw 1.05s cubic-bezier(.3,.7,.3,1) both; }',
    '.zq-chart .grow { transform-origin: left center; animation: zqGrow .8s cubic-bezier(.22,.68,.32,1) both; animation-delay: calc(var(--i, 0) * 70ms); }',
    '.zq-chart .fade { animation: zqFade .6s ease both; animation-delay: calc(var(--i, 0) * 60ms); }',
    '@keyframes zqDraw { from { stroke-dashoffset: 2400; } to { stroke-dashoffset: 0; } }',
    '@keyframes zqGrow { from { transform: scaleX(0); opacity: .3; } to { transform: scaleX(1); opacity: 1; } }',
    '@keyframes zqFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }',
    '.zq-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 12px; font-size: 12.5px; color: #5C6B65; }',
    '.zq-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 6px; }',
    '.zq-tip { position: absolute; padding: 6px 10px; background: #1F2A26; color: #fff; font-size: 12px;',
    '  border-radius: 8px; pointer-events: none; transform: translate(-50%, -120%); white-space: nowrap; z-index: 5; }',
    '.zq-wrap { position: relative; }'
  ].join('\n');
  document.head.appendChild(chartCss);

  /** 折线图：近 7 日走势（订单数 / 营收） */
  var LineChart = {
    name: 'zq-line',
    props: {
      data: { type: Array, default: function () { return []; } },
      valueKey: { type: String, default: 'amount' },
      labelKey: { type: String, default: 'date' },
      color: { type: String, default: BRAND },
      height: { type: Number, default: 210 },
      unit: { type: String, default: '' },
      money: { type: Boolean, default: false }
    },
    data: function () { return { hover: -1 }; },
    computed: {
      width: function () { return 700; },
      pad: function () { return { l: 46, r: 16, t: 16, b: 26 }; },
      values: function () {
        var self = this;
        return this.data.map(function (d) { return Number(d[self.valueKey] || 0); });
      },
      max: function () {
        var m = Math.max.apply(null, this.values.concat([1]));
        return m <= 0 ? 1 : m * 1.18;
      },
      innerW: function () { return this.width - this.pad.l - this.pad.r; },
      innerH: function () { return this.height - this.pad.t - this.pad.b; },
      points: function () {
        var self = this;
        var n = this.data.length;
        if (!n) { return []; }
        var step = n > 1 ? this.innerW / (n - 1) : 0;
        return this.data.map(function (d, i) {
          var v = Number(d[self.valueKey] || 0);
          return {
            x: self.pad.l + step * i,
            y: self.pad.t + self.innerH - (v / self.max) * self.innerH,
            value: v,
            label: String(d[self.labelKey] || '').slice(5),
            raw: d
          };
        });
      },
      linePath: function () {
        return this.points.map(function (p, i) {
          return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
        }).join(' ');
      },
      areaPath: function () {
        if (!this.points.length) { return ''; }
        var bottom = this.pad.t + this.innerH;
        var first = this.points[0];
        var last = this.points[this.points.length - 1];
        return this.linePath + ' L' + last.x.toFixed(1) + ' ' + bottom
          + ' L' + first.x.toFixed(1) + ' ' + bottom + ' Z';
      },
      gridLines: function () {
        var out = [];
        for (var i = 0; i <= 3; i++) {
          out.push(this.pad.t + (this.innerH / 3) * i);
        }
        return out;
      },
      gradientId: function () { return 'zqgrad' + this._uid; }
    },
    methods: {
      fmt: function (v) {
        if (this.money) { return '¥' + Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 0 }); }
        return Number(v).toLocaleString('zh-CN') + this.unit;
      },
      onMove: function (e) {
        if (!this.points.length) { return; }
        var rect = this.$refs.svg.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width * this.width;
        var best = 0;
        var dist = Infinity;
        this.points.forEach(function (p, i) {
          var d = Math.abs(p.x - x);
          if (d < dist) { dist = d; best = i; }
        });
        this.hover = best;
      }
    },
    template: [
      '<div class="zq-wrap">',
      '  <svg class="zq-chart" ref="svg" :viewBox="\'0 0 \' + width + \' \' + height"',
      '       :style="{ height: height + \'px\' }" preserveAspectRatio="none"',
      '       @mousemove="onMove" @mouseleave="hover = -1">',
      '    <defs>',
      '      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">',
      '        <stop offset="0%" :stop-color="color" stop-opacity=".26"/>',
      '        <stop offset="100%" :stop-color="color" stop-opacity="0"/>',
      '      </linearGradient>',
      '    </defs>',
      '    <line v-for="(y, i) in gridLines" :key="\'g\' + i" class="grid"',
      '          :x1="pad.l" :x2="width - pad.r" :y1="y" :y2="y"/>',
      '    <path :d="areaPath" :fill="\'url(#\' + gradientId + \')\'" class="fade"/>',
      '    <path :d="linePath" class="line draw" :stroke="color"',
      '          stroke-dasharray="2400" :style="{ animationDelay: \'.1s\' }"/>',
      '    <g v-for="(p, i) in points" :key="\'p\' + i" class="fade" :style="{ \'--i\': i }">',
      '      <circle class="dot" :cx="p.x" :cy="p.y" :r="hover === i ? 6 : 4" :fill="color"/>',
      '      <text class="axis" :x="p.x" :y="height - 8" text-anchor="middle">{{ p.label }}</text>',
      '    </g>',
      '  </svg>',
      '  <div v-if="hover >= 0 && points[hover]" class="zq-tip"',
      '       :style="{ left: (points[hover].x / width * 100) + \'%\', top: (points[hover].y / height * 100) + \'%\' }">',
      '    {{ points[hover].raw[labelKey] }} · {{ fmt(points[hover].value) }}',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  /** 环形图：订单状态分布 */
  var Donut = {
    name: 'zq-donut',
    props: {
      items: { type: Array, default: function () { return []; } },
      size: { type: Number, default: 168 },
      thickness: { type: Number, default: 22 }
    },
    computed: {
      total: function () {
        return this.items.reduce(function (s, x) { return s + Number(x.value || 0); }, 0);
      },
      radius: function () { return this.size / 2 - this.thickness / 2 - 2; },
      circumference: function () { return 2 * Math.PI * this.radius; },
      arcs: function () {
        var self = this;
        var total = this.total || 1;
        var acc = 0;
        return this.items.map(function (item) {
          var ratio = Number(item.value || 0) / total;
          var arc = {
            color: item.color,
            dash: (ratio * self.circumference).toFixed(2) + ' ' + self.circumference.toFixed(2),
            offset: (-acc * self.circumference).toFixed(2),
            name: item.name,
            value: Number(item.value || 0),
            percent: total ? Math.round(ratio * 100) : 0
          };
          acc += ratio;
          return arc;
        });
      }
    },
    template: [
      '<div class="flex items-center gap-16" style="flex-wrap:wrap">',
      '  <svg class="zq-chart" :viewBox="\'0 0 \' + size + \' \' + size" :style="{ width: size + \'px\', height: size + \'px\' }">',
      '    <g :transform="\'rotate(-90 \' + size / 2 + \' \' + size / 2 + \')\'">',
      '      <circle :cx="size / 2" :cy="size / 2" :r="radius" fill="none" stroke="#F1EEE7" :stroke-width="thickness"/>',
      '      <circle v-for="(a, i) in arcs" :key="\'a\' + i" :cx="size / 2" :cy="size / 2" :r="radius"',
      '              fill="none" :stroke="a.color" :stroke-width="thickness" stroke-linecap="butt"',
      '              :stroke-dasharray="a.dash" :stroke-dashoffset="a.offset"',
      '              class="fade" :style="{ \'--i\': i }"><title>{{ a.name }}：{{ a.value }}</title></circle>',
      '    </g>',
      '    <text :x="size / 2" :y="size / 2 - 2" text-anchor="middle"',
      '          style="font-size:24px;font-weight:600;fill:#1F2A26;font-family:inherit">{{ total }}</text>',
      '    <text :x="size / 2" :y="size / 2 + 18" text-anchor="middle"',
      '          style="font-size:11px;fill:#93A09A;font-family:inherit">订单总数</text>',
      '  </svg>',
      '  <div style="min-width:140px">',
      '    <div v-for="(a, i) in arcs" :key="\'l\' + i" class="flex items-center justify-between gap-12"',
      '         style="padding:4px 0;font-size:13px">',
      '      <span class="flex items-center"><i :style="{ background: a.color, width: \'9px\', height: \'9px\',',
      '            borderRadius: \'3px\', marginRight: \'7px\', display: \'inline-block\' }"></i>{{ a.name }}</span>',
      '      <span class="mono muted">{{ a.value }} · {{ a.percent }}%</span>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n')
  };

  /** 横向条形排行 */
  var Bars = {
    name: 'zq-bars',
    props: {
      items: { type: Array, default: function () { return []; } },
      valueKey: { type: String, default: 'amount' },
      color: { type: String, default: BRAND },
      money: { type: Boolean, default: true },
      unit: { type: String, default: '' }
    },
    computed: {
      max: function () {
        var self = this;
        return Math.max.apply(null, this.items.map(function (x) { return Number(x[self.valueKey] || 0); }).concat([1]));
      }
    },
    methods: {
      widthOf: function (item) {
        return Math.max(4, Number(item[this.valueKey] || 0) / this.max * 100) + '%';
      },
      fmt: function (v) {
        var n = Number(v || 0);
        if (this.money) { return '¥' + n.toLocaleString('zh-CN', { maximumFractionDigits: 0 }); }
        return n.toLocaleString('zh-CN') + this.unit;
      }
    },
    template: [
      '<div>',
      '  <div v-for="(item, i) in items" :key="i" style="padding:9px 0">',
      '    <div class="flex items-center justify-between" style="font-size:13px;margin-bottom:5px">',
      '      <span class="nowrap" style="overflow:hidden;text-overflow:ellipsis;max-width:62%">',
      '        <span class="dim mono" style="margin-right:6px">{{ i + 1 }}</span>{{ item.name }}</span>',
      '      <span class="mono" style="color:#5C6B65">{{ fmt(item[valueKey]) }}</span>',
      '    </div>',
      '    <div style="height:7px;background:#F1EEE7;border-radius:6px;overflow:hidden">',
      '      <div class="grow" :style="{ width: widthOf(item), height: \'100%\', background: color,',
      '            borderRadius: \'6px\', \'--i\': i }"></div>',
      '    </div>',
      '  </div>',
      '  <div v-if="!items.length" class="empty" style="padding:22px">暂无数据</div>',
      '</div>'
    ].join('\n')
  };

  /** 迷你趋势线：用在 KPI 卡片里 */
  var Spark = {
    name: 'zq-spark',
    props: {
      data: { type: Array, default: function () { return []; } },
      valueKey: { type: String, default: 'amount' },
      color: { type: String, default: BRAND2 },
      height: { type: Number, default: 34 }
    },
    computed: {
      points: function () {
        var self = this;
        var values = this.data.map(function (d) { return Number(d[self.valueKey] || 0); });
        var max = Math.max.apply(null, values.concat([1]));
        var w = 124;
        var step = values.length > 1 ? (w - 4) / (values.length - 1) : 0;
        return values.map(function (v, i) {
          return { x: 2 + i * step, y: self.height - 3 - (v / max) * (self.height - 8) };
        });
      },
      path: function () {
        return this.points.map(function (p, i) {
          return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
        }).join(' ');
      }
    },
    template: [
      '<svg class="zq-chart" :viewBox="\'0 0 124 \' + height"',
      '     :style="{ height: height + \'px\' }" preserveAspectRatio="none">',
      '  <path :d="path" class="line draw" :stroke="color" stroke-width="2"',
      '        stroke-dasharray="600" fill="none"/>',
      '</svg>'
    ].join('\n')
  };

  window.ZQChartColors = { BRAND: BRAND, BRAND2: BRAND2, ACCENT: ACCENT, WARN: WARN, INFO: INFO };
  window.ZQCharts = { LineChart: LineChart, Donut: Donut, Bars: Bars, Spark: Spark };
})();
