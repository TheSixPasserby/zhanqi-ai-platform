/* ============================================================================
 *  商户工作台（电脑 H5 页面，Vue 2 + Element UI）
 *
 *  职责：商家自己经营相关的全部功能 —— 商品上下架、订单接单/拒绝/发货/完成、
 *  消息客服、用户举报与上诉、营收统计、AI 文案。
 *  刻意不含任何「服务器地址 / 连接配置」入口：那些只在 PC 管理后台配置，
 *  商家打开页面就是同源加载，不需要知道服务器在哪。
 * ========================================================================== */
(function () {
  'use strict';

  var api = window.ZQ.api;
  var fmt = window.ZQ.fmt;
  var store = window.ZQ.store;
  var COLORS = window.ZQChartColors;

  /* ---------------------------- 通用小工具 ---------------------------- */

  /*
   * 订单类型 / 拒绝状态 / 物流公司等展示字典。
   *
   * 订单状态中文名以后端 statusText 为准，这里只做离线兜底；
   * 「拒绝状态」与「订单类型」是本次新增字段，后端不额外下发中文，
   * 所以前端保留一份映射，避免页面上直接露出 waiting_buyer 这种英文枚举。
   */
  var ORDER_TYPE_TEXT = {
    goods: '实物商品', study: '研学课程', homestay: '民宿住宿', experience: '农事体验'
  };
  var ORDER_STATUS_TEXT = {
    pending: '待确认', confirmed: '已确认', shipped: '已发货', checked_in: '已入住',
    completed: '已完成', used: '已核销', cancelled: '已取消', refunded: '已退款'
  };
  var REJECT_STATUS_TEXT = {
    waiting_buyer: '待买家决定',
    buyer_agreed: '买家已同意关闭',
    buyer_disagreed: '买家不同意，协商中'
  };
  var REPORT_CATEGORY_TEXT = {
    service: '商家服务态度问题', product: '商品问题', logistics: '发货物流问题',
    money: '钱款纠纷', fraud: '商家欺诈'
  };
  var REPORT_STATUS_TEXT = {
    pending: '待处理', resolved: '已处理', appealed: '上诉审核中', appeal_resolved: '上诉已处理'
  };
  var SHIP_COMPANIES = ['顺丰', '中通', '圆通', '韵达', '京东', '邮政', '其他'];

  /**
   * 把「数组 / JSON 字符串 / 逗号分隔文本」统一成数组。
   * 后端 JSON 列（tags、evidence、timeSlots…）可能返回数组，也可能因为历史数据是字符串，
   * 前端两处都要兼容，否则一遇到老数据就报错或渲染成 "[object Object]"。
   */
  function asList(value) {
    if (!value) { return []; }
    if (Array.isArray(value)) { return value; }
    if (typeof value === 'string') {
      var s = value.trim();
      if (!s) { return []; }
      if (s.charAt(0) === '[') {
        try {
          var arr = JSON.parse(s);
          return Array.isArray(arr) ? arr : [];
        } catch (e) {
          return [];
        }
      }
      return s.split(/[,，、\s]+/).filter(Boolean);
    }
    return [];
  }

  /**
   * 只按逗号/顿号换行分段，保留段内空格。
   * 场次「上午场 09:00」、房型「大床房（含早）」本身就带空格，
   * 不能像标签那样用空白字符分割，否则保存后会变成两个错值。
   */
  function splitCommaList(value) {
    return String(value || '')
      .split(/[,，、\n]+/)
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
  }

  /** 只保留 data:image/ 字符串，用于举报凭证、聊天图片的展示 */
  function evidenceList(value) {
    return asList(value).filter(function (x) {
      return typeof x === 'string' && x.indexOf('data:image/') === 0;
    });
  }

  /**
   * 通用图片压缩：按最长边等比缩放后转 JPEG dataURL。
   * 头像走 profile.js 的正方形裁剪；聊天图片与举报凭证是内容图，等比缩放更合适。
   * 不压的话手机照片动辄几 MB，dataURL 还要再膨胀 1/3，请求体和数据库都扛不住。
   */
  function compressImage(file, maxSide, quality, done) {
    if (!file) { return done(null); }
    if (file.type && file.type.indexOf('image/') !== 0) { return done(null); }
    var reader = new FileReader();
    reader.onerror = function () { done(null); };
    reader.onload = function (e) {
      var img = new Image();
      img.onerror = function () { done(null); };
      img.onload = function () {
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        // 先铺白底：PNG 透明背景转 JPEG 会变黑
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        done(canvas.toDataURL('image/jpeg', quality || 0.72));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /** 从订单详情接口的返回里取出订单对象（兼容 order / data / 直接平铺三种写法） */
  function orderDetailOf(res) {
    if (!res || !res.ok) { return null; }
    var d = res.order || res.detail || res.data || null;
    if (d && typeof d === 'object' && d.id) { return d; }
    var copy = Object.assign({}, res);
    delete copy.ok;
    return copy.id ? copy : null;
  }

  /** 从举报详情接口的返回里取出举报对象（兼容 report / detail / 直接平铺三种写法） */
  function reportDetailOf(res) {
    if (!res || !res.ok) { return null; }
    var d = res.report || res.detail || res.data || null;
    if (d && typeof d === 'object' && d.id) { return d; }
    var copy = Object.assign({}, res);
    delete copy.ok;
    return copy.id ? copy : null;
  }

  /** 订单类型：优先 category，历史订单只有 type=shop/booking，做一次兜底映射 */
  function orderKind(order) {
    var k = String((order && (order.category || order.type)) || '');
    if (k === 'shop') { return 'goods'; }
    if (k === 'booking') { return 'study'; }
    return k || 'goods';
  }

  function orderTypeText(order) {
    var kind = orderKind(order);
    if (ORDER_TYPE_TEXT[kind]) { return ORDER_TYPE_TEXT[kind]; }
    return (order && order.categoryText) || '商品';
  }

  function orderStatusText(order) {
    if (!order) { return '—'; }
    return order.statusText || ORDER_STATUS_TEXT[order.status] || order.status || '—';
  }

  function rejectStatusText(order) {
    if (!order || !order.rejectStatus) { return '拒绝原因已记录'; }
    return REJECT_STATUS_TEXT[order.rejectStatus] || order.rejectStatus;
  }

  /* ---------------------------- 工作台概览 ---------------------------- */

  var tabHome = {
    name: 'tab-home',
    template: '#tpl-tab-home',
    props: { kpi: { type: Object, default: function () { return {}; } } },
    data: function () {
      return { trendKey: 'amount', trend: [], productRank: [], categoryRevenue: [], pendingOrders: [], fmt: fmt };
    },
    created: function () { this.load(); },
    computed: {
      categoryItems: function () {
        var palette = [COLORS.BRAND, COLORS.WARN, COLORS.INFO, COLORS.ACCENT];
        return this.categoryRevenue.map(function (c, i) {
          return { name: c.name, value: c.amount, color: palette[i % palette.length] };
        });
      }
    },
    methods: {
      load: function () {
        var self = this;
        api.get('/api/stat/merchant').then(function (res) {
          if (!res.ok) { return; }
          self.trend = res.trend || [];
          self.productRank = res.productRank || [];
          self.categoryRevenue = res.categoryRevenue || [];
          self.pendingOrders = res.pendingOrders || [];
        });
      }
    }
  };

  /* ---------------------------- 商品管理 ---------------------------- */

  var tabGoods = {
    name: 'tab-goods',
    template: '#tpl-tab-goods',
    // focusGoods：从聊天里的「商品卡片」跳过来时携带的商品 id，加载后自动打开编辑弹窗
    props: { focusGoods: { type: String, default: '' } },
    data: function () {
      return {
        loading: false, saving: false, keyword: '', category: '', list: [],
        categories: { goods: '农产文创', study: '研学课程', homestay: '民宿住宿', experience: '农事体验' },
        formVisible: false, form: {}, tagsText: '', timeSlotsText: '', roomTypesText: '',
        // 地图选点：instance 是 ZQMap 控件，标记点用于「参考坐标」——把村内点位画出来当参照物，
        // 商家选位时能对着真实村落布局点，而不是对着一张空白网格瞎猜。
        pickMapInstance: null,
        pickMarkers: [],
        aiVariants: [], aiIndex: 0, aiGeneratedBy: '',
        covers: [
          '/assets/img/photos/goods-rice.jpg', '/assets/img/photos/spot-radish.jpg', '/assets/img/photos/goods-buxie.jpg',
          '/assets/img/photos/spot-bamboo.jpg', '/assets/img/photos/spot-study.jpg', '/assets/img/photos/goods-homestay.jpg',
          '/assets/img/photos/goods-ninebowls.jpg', '/assets/img/photos/spot-bookhouse.jpg', '/assets/img/photos/spot-center.jpg'
        ],
        fmt: fmt
      };
    },
    created: function () { this.load(); },
    computed: {
      /** 只有预约类商品（研学 / 民宿 / 农事体验）才展示并提交场次与房型 */
      isBooking: function () {
        var c = this.form && this.form.category;
        return c === 'study' || c === 'homestay' || c === 'experience';
      }
    },
    methods: {
      load: function () {
        var self = this;
        this.loading = true;
        api.get('/api/shop/products', { scope: 'mine', keyword: this.keyword, category: this.category })
          .then(function (res) {
            self.loading = false;
            if (!res.ok) { return; }
            self.list = res.products || [];
            if (res.categories) { self.categories = res.categories; }
            // 从聊天商品卡片跳转过来：定位到对应商品并直接打开编辑（只消费一次）
            if (self.focusGoods) {
              var hit = self.list.filter(function (p) {
                return String(p.id) === String(self.focusGoods);
              })[0];
              if (hit) { self.openForm(hit); }
              self.$emit('goods-opened');
            }
          });
      },
      openForm: function (row) {
        if (row) {
          this.form = Object.assign({}, row);
          this.tagsText = asList(row.tags).join('，');
          this.timeSlotsText = asList(row.timeSlots).join('，');
          this.roomTypesText = asList(row.roomTypes).join('，');
        } else {
          this.form = { category: 'goods', unit: '份', stock: 10, price: 0, cover: this.covers[0] };
          this.tagsText = '';
          this.timeSlotsText = '';
          this.roomTypesText = '';
        }
        this.aiVariants = [];
        this.aiIndex = 0;
        this.formVisible = true;
        this.initPickMap();
      },

      /* ------------------------ 地图选点（商品位置） ------------------------ */
      /**
       * 初始化选点地图。
       * 弹窗刚打开时 DOM 还没渲染，所以要等两帧（$nextTick + setTimeout）。
       * 底图上同时画出村内点位作为参照，商家能对着真实布局选位。
       */
      initPickMap: function () {
        var self = this;
        this.$nextTick(function () {
          setTimeout(function () {
            var box = self.$refs.pickMap;
            if (!box || !window.ZQMap) { return; }
            if (self.pickMapInstance) { self.pickMapInstance.destroy(); self.pickMapInstance = null; }
            self.pickMarkers = (self.$parent && self.$parent.spots ? self.$parent.spots : []) || [];
            if (!self.pickMarkers.length) {
              // 商家端没有 spots 数据时，用接口取一次（只为画参照点，失败不影响选点）
              api.get('/api/tour/spots', null, { silent: true }).then(function (res) {
                if (res && res.ok && res.spots) { self.pickMarkers = res.spots; self.rebuildPickMap(); }
              });
            }
            self.pickMapInstance = window.ZQMap.create({
              el: box,
              markers: (self.pickMarkers || []).filter(function (s) { return s.mapX != null && s.mapY != null; })
                .map(function (s) {
                  return { key: 'sp-' + s.id, kind: 'spot', name: s.name, x: Number(s.mapX), y: Number(s.mapY) };
                }),
              selectable: true,
              showLegend: false,
              picked: (self.form && self.form.mapX != null && self.form.mapY != null)
                ? { x: Number(self.form.mapX), y: Number(self.form.mapY) } : null,
              onPick: function (x, y) {
                if (x == null) {
                  self.form.mapX = null;
                  self.form.mapY = null;
                } else {
                  self.form.mapX = x;
                  self.form.mapY = y;
                }
              },
            });
          }, 80);
        });
      },
      rebuildPickMap: function () {
        if (!this.pickMapInstance) { return; }
        this.pickMapInstance.setMarkers((this.pickMarkers || []).filter(function (s) { return s.mapX != null && s.mapY != null; })
          .map(function (s) {
            return { key: 'sp-' + s.id, kind: 'spot', name: s.name, x: Number(s.mapX), y: Number(s.mapY) };
          }));
      },
      clearMapPick: function () {
        this.form.mapX = null;
        this.form.mapY = null;
        if (this.pickMapInstance) { this.pickMapInstance.setPicked(null); }
      },
      save: function () {
        var self = this;
        if (!this.form.name || this.form.price === undefined || this.form.price === '') {
          this.$message.error('请填写商品名称与价格');
          return;
        }
        var payload = Object.assign({}, this.form);
        payload.tags = this.tagsText.split(/[,，、\s]+/).filter(Boolean);
        payload.price = Number(payload.price || 0);
        payload.stock = Number(payload.stock || 0);
        // 地图坐标：选了就提交数字，没选显式传 null（让后端清空，而不是保留旧值）
        payload.mapX = (this.form.mapX == null || this.form.mapX === '') ? null : Number(this.form.mapX);
        payload.mapY = (this.form.mapY == null || this.form.mapY === '') ? null : Number(this.form.mapY);
        // 预约类商品才提交场次/房型；留空时数组为空，后端按分类给默认值
        if (this.isBooking) {
          payload.timeSlots = splitCommaList(this.timeSlotsText);
          payload.roomTypes = splitCommaList(this.roomTypesText);
        }
        this.saving = true;
        var req = payload.id
          ? api.put('/api/shop/products/' + payload.id, payload)
          : api.post('/api/shop/products', payload);
        req.then(function (res) {
          self.saving = false;
          if (!res.ok) { return; }
          self.$message.success(res.message || '已保存');
          self.formVisible = false;
          self.load();
          self.$emit('refresh');
        });
      },
      toggle: function (row) {
        var self = this;
        api.post('/api/shop/products/' + row.id + '/toggle').then(function (res) {
          if (res.ok) { self.$message.success(res.message); self.load(); self.$emit('refresh'); }
        });
      },
      remove: function (row) {
        var self = this;
        this.$confirm('确定删除「' + row.name + '」？删除后商城立刻看不到它。', '删除商品', { type: 'warning' })
          .then(function () {
            api.del('/api/shop/products/' + row.id).then(function (res) {
              if (res.ok) { self.$message.success(res.message); self.load(); self.$emit('refresh'); }
            });
          }).catch(function () { /* 取消 */ });
      },
      askAi: function () {
        var self = this;
        api.post('/api/ai/copywrite', {
          name: this.form.name,
          keywords: this.tagsText.split(/[,，、\s]+/).filter(Boolean),
          price: this.form.price,
          unit: this.form.unit,
          tone: '朴实'
        }).then(function (res) {
          if (!res.ok) { return; }
          self.aiVariants = res.variants || [];
          self.aiGeneratedBy = res.generatedBy === 'local-template' ? '本地模板（未接大模型）' : '本地模板 + 大模型';
          self.aiIndex = 0;
          self.$message.success('文案已生成，可切换三种风格');
        });
      },
      applyAi: function () {
        if (this.aiVariants.length) {
          this.form.desc = this.aiVariants[this.aiIndex];
          this.$message.success('已填入商品介绍，记得点保存');
        }
      }
    }
  };

  /* ---------------------------- 订单管理 ---------------------------- */

  var LOGISTICS_STATUS_TEXT = {
    pending: '待揽收', created: '已揽收', collected: '已揽收', transit: '运输中',
    in_transit: '运输中', shipping: '运输中', delivering: '派送中',
    out_for_delivery: '派送中', signed: '已签收', delivered: '已签收'
  };

  var tabOrders = {
    name: 'tab-orders',
    template: '#tpl-tab-orders',
    // focusOrder：从聊天订单卡片 / 其他页面跳过来时携带的订单 id，加载后自动打开详情
    props: { focusOrder: { type: String, default: '' } },
    data: function () {
      return {
        loading: false, status: '', list: [], fmt: fmt,
        // 「已核销 used」只保留给历史数据展示，不再作为可筛选状态页签
        statusOptions: [
          { key: '', label: '全部' },
          { key: 'pending', label: '待确认' },
          { key: 'confirmed', label: '已确认' },
          { key: 'shipped', label: '已发货' },
          { key: 'checked_in', label: '已入住' },
          { key: 'completed', label: '已完成' },
          { key: 'cancelled', label: '已取消' },
          { key: 'refunded', label: '已退款' }
        ],
        shipCompanies: SHIP_COMPANIES,
        detailVisible: false, detail: {}, detailLoading: false,
        logisticsNodes: [], orderLogs: [],
        rejectVisible: false, rejectTarget: null, rejectReason: '', rejecting: false,
        shipVisible: false, shipTarget: null,
        shipForm: { company: SHIP_COMPANIES[0], trackingNo: '' }, shipping: false
      };
    },
    created: function () { this.load(); },
    computed: {
      buyerAvatar: function () {
        return window.ZQProfile.src({ avatar: this.detail.buyerAvatar || '' }, 'visitor');
      }
    },
    methods: {
      load: function () {
        var self = this;
        this.loading = true;
        api.get('/api/shop/orders', { status: this.status }).then(function (res) {
          self.loading = false;
          if (!res.ok) { return; }
          self.list = res.orders || [];
          // 从聊天/别处跳转过来：按订单 id 自动打开详情，只消费一次
          if (self.focusOrder) {
            var hit = self.list.filter(function (o) {
              return String(o.id) === String(self.focusOrder);
            })[0];
            if (hit) { self.openDetail(hit); }
            self.$emit('order-opened');
          }
        });
      },

      /* ------------------ 判断与文案 ------------------ */

      hasBooking: function (order) {
        if (!order) { return false; }
        return orderKind(order) !== 'goods'
          || !!(order.bookDate || order.bookingSlot || order.checkOutDate || order.roomType || order.people);
      },
      bookingText: function (order) {
        var parts = [];
        if (order.bookDate) { parts.push((orderKind(order) === 'homestay' ? '入住 ' : '预约 ') + order.bookDate); }
        if (order.bookingSlot) { parts.push(order.bookingSlot); }
        if (order.checkOutDate) { parts.push('离店 ' + order.checkOutDate); }
        if (order.roomType) { parts.push(order.roomType); }
        if (order.people) { parts.push(order.people + ' 人'); }
        return parts.join(' · ') || '—';
      },
      typeTextOf: function (order) { return orderTypeText(order); },
      isGoods: function (order) { return orderKind(order) === 'goods'; },
      statusTextOf: function (order) { return orderStatusText(order); },
      rejectStatusText: function (order) { return rejectStatusText(order); },
      confirmLabel: function (order) { return orderKind(order) === 'goods' ? '接单' : '确认'; },

      // 各类型订单可执行的动作：已完成 / 已取消 / 已退款 / 历史已核销 一律只读
      canConfirm: function (order) { return !!order && order.status === 'pending'; },
      canReject: function (order) { return !!order && order.status === 'pending'; },
      canShip: function (order) {
        return !!order && order.status === 'confirmed' && orderKind(order) === 'goods';
      },
      canCheckin: function (order) {
        return !!order && order.status === 'confirmed' && orderKind(order) === 'homestay';
      },
      // 商家没有「完成订单」权限：订单完成 = 买家确认收货，且会触发货款结算。
      // 这里显式保留一个恒为 false 的判定，让模板里的引用不会因为字段缺失而报错。
      canComplete: function () { return false; },
      // 商家只读等待买家确认收货的状态（用于在列表里给出「等待买家确认收货」的提示）
      waitingBuyerReceive: function (order) {
        if (!order) { return false; }
        var kind = orderKind(order);
        if (order.status === 'shipped') { return kind === 'goods'; }
        if (order.status === 'checked_in') { return kind === 'homestay'; }
        if (order.status === 'confirmed') { return kind === 'study' || kind === 'experience'; }
        return false;
      },

      /* ------------------ 状态动作 ------------------ */

      /**
       * 统一提交状态动作。
       * 成功后刷新列表与看板；如果详情抽屉正开着，同步刷新抽屉里的数据，
       * 避免出现「列表已发货、抽屉还显示待确认」这种同一页面两份真相。
       */
      postAction: function (row, action, body, fallbackMessage) {
        var self = this;
        return api.post('/api/shop/orders/' + row.id + '/' + action, body || {}).then(function (res) {
          if (!res.ok) { return false; }
          self.$message.success(res.message || fallbackMessage || '操作成功');
          self.load();
          self.$emit('refresh');
          if (self.detailVisible && self.detail && self.detail.id === row.id) {
            self.refreshDetail();
          }
          return true;
        });
      },
      doConfirm: function (row) {
        var self = this;
        this.$confirm('确认接下「' + (row.productName || '该订单') + '」这笔订单？', '确认订单', { type: 'warning' })
          .then(function () { self.postAction(row, 'confirm', null, '已确认接单'); })
          .catch(function () { });
      },
      doCheckin: function (row) {
        var self = this;
        this.$confirm('确认为该订单办理入住？办理后状态变为「已入住」。', '办理入住', { type: 'warning' })
          .then(function () { self.postAction(row, 'checkin', null, '已办理入住'); })
          .catch(function () { });
      },
      // 商家端不再提供「完成订单」：该动作只能由买家在用户端确认收货触发，
      // 并同时完成货款结算。保留注释说明，避免后来者又把它加回来。

      /* ------------------ 拒绝 ------------------ */

      openReject: function (row) {
        this.rejectTarget = row;
        this.rejectReason = '';
        this.rejectVisible = true;
      },
      submitReject: function () {
        var self = this;
        var reason = String(this.rejectReason || '').trim();
        if (reason.length < 2 || reason.length > 200) {
          this.$message.warning('请填写 2–200 字的拒绝原因');
          return;
        }
        this.rejecting = true;
        api.post('/api/shop/orders/' + this.rejectTarget.id + '/reject', { reason: reason }).then(function (res) {
          self.rejecting = false;
          if (!res.ok) { return; }
          self.$message.success(res.message || '已提交拒绝原因，等待买家决定');
          self.rejectVisible = false;
          self.load();
          self.$emit('refresh');
          if (self.detailVisible) { self.refreshDetail(); }
        });
      },

      /* ------------------ 发货 ------------------ */

      openShip: function (row) {
        this.shipTarget = row;
        this.shipForm = { company: SHIP_COMPANIES[0], trackingNo: '' };
        this.shipVisible = true;
      },
      submitShip: function () {
        var self = this;
        var company = String(this.shipForm.company || '').trim();
        var trackingNo = String(this.shipForm.trackingNo || '').trim();
        if (!company) { this.$message.warning('请选择或填写快递公司'); return; }
        if (!trackingNo) { this.$message.warning('请填写运单号'); return; }
        this.shipping = true;
        api.post('/api/shop/orders/' + this.shipTarget.id + '/ship', {
          company: company, trackingNo: trackingNo
        }).then(function (res) {
          self.shipping = false;
          if (!res.ok) { return; }
          self.$message.success(res.message || '已发货');
          self.shipVisible = false;
          self.load();
          self.$emit('refresh');
          if (self.detailVisible) { self.refreshDetail(); }
        });
      },

      /* ------------------ 详情抽屉 ------------------ */

      openDetail: function (row) {
        var self = this;
        this.detail = Object.assign({}, row);
        this.logisticsNodes = asList(row.logisticsNodes);
        this.orderLogs = [];
        this.detailVisible = true;
        this.detailLoading = true;
        api.get('/api/shop/orders/' + row.id, null, { silent: true }).then(function (res) {
          var d = orderDetailOf(res);
          if (d) {
            self.detail = Object.assign({}, row, d);
            // 详情接口已经带回操作留痕与物流快照，优先直接用，少两次请求
            if (d.logs) { self.orderLogs = asList(d.logs); }
            else { self.loadOrderLogs(row.id); }
            if (d.logistics) { self.applyLogistics(d.logistics); }
            if (!self.logisticsNodes.length) { self.logisticsNodes = asList(d.logisticsNodes); }
          }
          self.detailLoading = false;
        });
        this.loadOrderExtras(row.id);
      },
      refreshDetail: function () {
        var id = this.detail && this.detail.id;
        if (!id) { return; }
        var self = this;
        api.get('/api/shop/orders/' + id, null, { silent: true }).then(function (res) {
          var d = orderDetailOf(res);
          if (d) {
            self.detail = Object.assign({}, self.detail, d);
            if (d.logs) { self.orderLogs = asList(d.logs); }
            else { self.loadOrderLogs(id); }
            if (d.logistics) { self.applyLogistics(d.logistics); }
          }
        });
        this.loadOrderExtras(id);
      },
      /** 把物流接口返回的「公司 / 单号 / 当前状态 / 节点」合并进详情 */
      applyLogistics: function (info) {
        if (!info) { return; }
        this.logisticsNodes = asList(info.nodes);
        if (info.company) { this.$set(this.detail, 'logisticsCompany', info.company); }
        if (info.trackingNo) { this.$set(this.detail, 'trackingNo', info.trackingNo); }
        if (info.status) { this.$set(this.detail, 'logisticsStatus', info.status); }
        if (info.statusText) { this.$set(this.detail, 'logisticsText', info.statusText); }
        if (info.shippedAt) { this.$set(this.detail, 'shippedAt', info.shippedAt); }
      },
      loadOrderExtras: function (orderId) {
        var self = this;
        api.get('/api/shop/orders/' + orderId + '/logistics', null, { silent: true }).then(function (res) {
          if (!res || !res.ok) { return; }
          self.applyLogistics(res.logistics || res);
        });
      },
      /**
       * 兼容分支：详情接口没有带 logs 时才单独请求 /logs。
       * 当前后端详情已内嵌 logs，正常路径不会多发这次请求，
       * 既避免重复请求，也避免该接口尚未部署时页面上出现一条 404。
       */
      loadOrderLogs: function (orderId) {
        var self = this;
        api.get('/api/shop/orders/' + orderId + '/logs', null, { silent: true }).then(function (res) {
          if (!res || !res.ok) { return; }
          self.orderLogs = asList(res.logs || res.items);
        });
      },
      nodeTime: function (node) {
        return fmt.time(node && (node.time || node.at || node.createdAt));
      },
      nodeText: function (node) {
        if (!node) { return '物流更新'; }
        return node.text || node.desc || node.content || node.statusText || node.status || '物流更新';
      },
      logisticsStatusText: function (status) {
        if (!status) { return '—'; }
        return LOGISTICS_STATUS_TEXT[status] || status;
      },
      logRoleText: function (role) {
        return { buyer: '买家', merchant: '商家', admin: '管理员', system: '系统' }[role] || '系统';
      },
      contactBuyer: function () {
        var buyerId = this.detail && this.detail.buyerId;
        if (!buyerId) {
          this.$message.warning('该订单缺少买家信息，无法发起聊天');
          return;
        }
        this.$emit('open-chat', {
          buyerId: buyerId,
          buyerName: this.detail.buyerName || '买家',
          orderId: this.detail.id
        });
      }
    }
  };

  /* ---------------------------- 消息客服 ---------------------------- */

  /**
   * 一条消息是否值得渲染。
   * 后端已挡纯空白文本，但历史脏数据 / 未知 type 会走到模板 v-else 渲染 m.text，
   * text 为 null 时就是一个只有 padding 的空气泡 —— 这里在进列表前统一过滤。
   */
  function isRenderableMessage(m) {
    if (!m || typeof m !== 'object') { return false; }
    var type = m.type || 'text';
    if (type === 'image') { return !!(m.media || m.text); }
    if (type === 'product') { return !!(m.productId || (m.product && m.product.id) || String(m.text || '').trim()); }
    if (type === 'order') { return !!(m.orderId || (m.order && m.order.id) || String(m.text || '').trim()); }
    return !!String(m.text == null ? '' : m.text).trim();
  }

  /** 后端一条聊天消息 → 前端渲染结构；fromRole 是判断消息方向的唯一依据 */
  function normalizeMessage(m) {
    var role = m.fromRole || m.role || (m.fromMerchant ? 'merchant' : '');
    return Object.assign({}, m, {
      type: m.type || 'text',
      fromRole: role,
      self: role === 'merchant',
      text: m.text || '',
      media: m.media || '',
      createdAt: m.createdAt || m.at || '',
      id: m.id || m.seq || ((m.createdAt || '') + '_' + role + '_' + String(m.text || '').slice(0, 12))
    });
  }

  var tabChat = {
    name: 'tab-chat',
    template: '#tpl-tab-chat',
    props: {
      me: { type: Object, default: function () { return { profile: {} }; } },
      // seed：{ buyerId, buyerName }，由订单详情「联系用户」或聊天卡片传入
      seed: { type: Object, default: null }
    },
    data: function () {
      return {
        fmt: fmt,
        threads: [], loadingThreads: false,
        buyerId: '', buyerName: '', peerAvatarData: '', online: false, typing: false,
        messages: [], loadingMessages: false, lastCount: 0,
        draft: '', sending: false, uploading: false,
        lastTypingAt: 0, timer: null
      };
    },
    computed: {
      merchantId: function () {
        return this.me.merchantId || (this.me.profile && this.me.profile.id) || '';
      },
      selfAvatar: function () {
        return window.ZQProfile.src(this.me.profile || {}, 'merchant');
      },
      peerAvatar: function () {
        return window.ZQProfile.src({ avatar: this.peerAvatarData }, 'visitor');
      },
      peerStatusText: function () {
        if (!this.buyerId) { return '请选择会话'; }
        if (this.typing) { return '对方正在输入…'; }
        return this.online ? '在线中' : '离线中';
      },
      imagePreview: function () {
        return this.messages.filter(function (m) {
          return m.type === 'image' && m.media;
        }).map(function (m) { return m.media; });
      }
    },
    created: function () {
      var self = this;
      this.loadThreads(true);
      if (this.seed && this.seed.buyerId) { this.applySeed(this.seed); }
      // 3.5 秒轮询：消息、在线状态、会话列表一起刷新（演示用，生产可换 WebSocket）
      this.timer = setInterval(function () { self.tick(); }, 3500);
    },
    beforeDestroy: function () {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    },
    watch: {
      seed: function (val) {
        if (val && val.buyerId) { this.applySeed(val); }
      }
    },
    methods: {
      applySeed: function (seed) {
        this.buyerId = String(seed.buyerId);
        this.buyerName = seed.buyerName || '买家';
        this.peerAvatarData = seed.avatar || '';
        this.online = !!seed.online;
        this.typing = false;
        this.messages = [];
        this.lastCount = 0;
        this.loadMessages(true, false);
      },
      loadThreads: function (quiet) {
        var self = this;
        if (!quiet) { this.loadingThreads = true; }
        api.get('/api/chat/threads', null, { silent: true }).then(function (res) {
          self.loadingThreads = false;
          if (!res || !res.ok) { return; }
          var raw = res.threads || [];
          self.threads = raw.map(function (t) {
            var lastText = t.lastText || '';
            if (!lastText) {
              lastText = t.lastType === 'image' ? '[图片]'
                : t.lastType === 'product' ? '[商品]'
                  : t.lastType === 'order' ? '[订单]' : '暂无消息';
            }
            return {
              buyerId: String(t.buyerId || ''),
              buyerName: t.buyerName || t.name || '买家',
              avatar: t.avatar || '',
              lastText: lastText,
              lastAt: t.lastAt || '',
              unread: Number(t.unread || 0),
              online: !!t.online
            };
          });
          for (var i = 0; i < self.threads.length; i++) {
            if (self.threads[i].buyerId === self.buyerId) {
              self.online = self.threads[i].online;
              if (self.threads[i].avatar) { self.peerAvatarData = self.threads[i].avatar; }
              break;
            }
          }
        });
      },
      pickThread: function (thread) {
        if (!thread || !thread.buyerId) { return; }
        this.buyerId = thread.buyerId;
        this.buyerName = thread.buyerName;
        this.peerAvatarData = thread.avatar;
        this.online = thread.online;
        this.typing = false;
        this.messages = [];
        this.lastCount = 0;
        this.loadMessages(true, false);
      },
      tick: function () {
        if (document.hidden) { return; }
        this.loadThreads(true);
        if (this.buyerId) { this.loadMessages(false, true); }
      },
      loadMessages: function (scroll, quiet) {
        if (!this.buyerId) { return; }
        var self = this;
        if (!quiet) { this.loadingMessages = true; }
        api.get('/api/chat/messages', { merchantId: this.merchantId, buyerId: this.buyerId }, { silent: true })
          .then(function (res) {
            self.loadingMessages = false;
            if (!res || !res.ok) { return; }
            var list = (res.messages || []).map(normalizeMessage).filter(isRenderableMessage);
            self.online = res.peerOnline !== undefined ? !!res.peerOnline
              : (res.buyer ? !!res.buyer.online : self.online);
            self.typing = !!res.peerTyping;
            if (res.buyer) {
              if (res.buyer.name) { self.buyerName = res.buyer.name; }
              if (res.buyer.avatar) { self.peerAvatarData = res.buyer.avatar; }
            }
            var grew = list.length !== self.lastCount;
            self.messages = list;
            self.lastCount = list.length;
            if (scroll || grew) { self.scrollBottom(); }
            self.syncThreadPreview(list);
          });
      },
      syncThreadPreview: function (list) {
        var last = list && list.length ? list[list.length - 1] : null;
        if (!last) { return; }
        for (var i = 0; i < this.threads.length; i++) {
          if (this.threads[i].buyerId === this.buyerId) {
            this.threads[i].lastAt = last.createdAt;
            this.threads[i].lastText = last.type === 'image' ? '[图片]'
              : last.type === 'product' ? '[商品]'
                : last.type === 'order' ? '[订单]' : (last.text || '');
            return;
          }
        }
      },
      scrollBottom: function () {
        var self = this;
        this.$nextTick(function () {
          var el = self.$refs.body;
          if (el) { el.scrollTop = el.scrollHeight; }
        });
      },
      onDraftInput: function () {
        if (!this.buyerId) { return; }
        var now = Date.now();
        if (now - this.lastTypingAt < 2500) { return; }
        this.lastTypingAt = now;
        api.post('/api/chat/typing', { merchantId: this.merchantId, buyerId: this.buyerId }, { silent: true });
      },
      send: function () {
        var text = String(this.draft || '').trim();
        if (!this.buyerId) { this.$message.warning('请先选择买家会话'); return; }
        if (!text) { return; }
        var self = this;
        this.postMessage({ type: 'text', text: text }, function () { self.draft = ''; });
      },
      /** 发送一条消息：成功后清输入框（图片/文本共用），并刷新会话摘要 */
      postMessage: function (payload, onSuccess) {
        if (this.sending) { return; }
        var self = this;
        this.sending = true;
        payload.merchantId = this.merchantId;
        payload.buyerId = this.buyerId;
        api.post('/api/chat/messages', payload).then(function (res) {
          self.sending = false;
          if (!res || !res.ok) { return; }
          if (onSuccess) { onSuccess(); }
          if (res.message && typeof res.message === 'object' && isRenderableMessage(res.message)) {
            // 后端返回了完整消息对象：直接追加，省一次轮询等待
            self.messages.push(normalizeMessage(res.message));
            self.lastCount = self.messages.length;
            self.scrollBottom();
            self.syncThreadPreview(self.messages);
          } else {
            self.loadMessages(true, true);
          }
          self.loadThreads(true);
        });
      },
      onPickImage: function (e) {
        var self = this;
        var file = (e.target.files || [])[0];
        e.target.value = '';
        if (!file) { return; }
        if (!this.buyerId) { this.$message.warning('请先选择买家会话'); return; }
        this.uploading = true;
        compressImage(file, 900, 0.72, function (dataUrl) {
          if (!dataUrl) {
            self.uploading = false;
            self.$message.error('图片读取失败，换一张试试');
            return;
          }
          // 后端限制单张 dataURL ≤ 400000 字符；超了再压一次
          if (dataUrl.length > 400000) {
            compressImage(file, 640, 0.6, function (small) {
              self.uploading = false;
              if (!small || small.length > 400000) {
                self.$message.error('图片太大，请换一张小一点的');
                return;
              }
              self.postMessage({ type: 'image', media: small, text: '' });
            });
            return;
          }
          self.uploading = false;
          self.postMessage({ type: 'image', media: dataUrl, text: '' });
        });
      },
      threadAvatar: function (thread) {
        return window.ZQProfile.src({ avatar: thread && thread.avatar }, 'visitor');
      },
      productNameOf: function (m) {
        return (m.product && m.product.name) || ('商品 #' + (m.productId || ''));
      },
      orderNameOf: function (m) {
        return (m.order && m.order.productName) || ('订单 #' + (m.orderId || ''));
      }
    }
  };

  /* ---------------------------- 用户举报 / 上诉 ---------------------------- */

  var tabReports = {
    name: 'tab-reports',
    template: '#tpl-tab-reports',
    data: function () {
      return {
        loading: false, list: [], statusFilter: '', fmt: fmt,
        filters: [
          { key: '', label: '全部' },
          { key: 'pending', label: '待处理' },
          { key: 'resolved', label: '已处理' },
          { key: 'appealed', label: '上诉审核中' }
        ],
        detailVisible: false, detail: null,
        appealVisible: false, appealTarget: null,
        appealForm: { content: '' }, appealEvidence: [], appealSubmitting: false
      };
    },
    computed: {
      filtered: function () {
        var filter = this.statusFilter;
        if (!filter) { return this.list; }
        return this.list.filter(function (r) {
          if (filter === 'appealed') { return r.status === 'appealed' || r.appealStatus === 'pending'; }
          if (filter === 'resolved') { return r.status === 'resolved' || r.status === 'appeal_resolved'; }
          return r.status === filter;
        });
      }
    },
    created: function () { this.load(); },
    methods: {
      load: function () {
        var self = this;
        this.loading = true;
        api.get('/api/reports/merchant').then(function (res) {
          self.loading = false;
          if (!res || !res.ok) { return; }
          self.list = res.reports || res.list || [];
        });
      },
      categoryText: function (report) {
        if (!report) { return '其他问题'; }
        return report.categoryText || REPORT_CATEGORY_TEXT[report.category] || '其他问题';
      },
      statusText: function (report) {
        if (!report) { return '待处理'; }
        return report.statusText || REPORT_STATUS_TEXT[report.status] || report.status || '待处理';
      },
      evidenceOf: function (report, field) {
        return evidenceList(report && report[field || 'evidence']);
      },
      /** 只有「已处理且尚未上诉」才允许上诉；appealStatus=pending 表示正在审核 */
      canAppeal: function (report) {
        return !!report && report.status === 'resolved' && !report.appealAt
          && !report.appealContent && report.appealStatus !== 'pending';
      },
      openDetail: function (row) {
        var self = this;
        this.detail = Object.assign({}, row);
        this.detailVisible = true;
        api.get('/api/reports/' + row.id, null, { silent: true }).then(function (res) {
          var d = reportDetailOf(res);
          if (d) { self.detail = Object.assign({}, row, d); }
        });
      },
      openAppeal: function (row) {
        this.detailVisible = false;
        this.appealTarget = row;
        this.appealForm = { content: '' };
        this.appealEvidence = [];
        this.appealVisible = true;
      },
      onAppealPick: function (e) {
        var self = this;
        var files = Array.prototype.slice.call(e.target.files || []);
        e.target.value = '';
        if (!files.length) { return; }
        var remain = 3 - this.appealEvidence.length;
        if (remain <= 0) { this.$message.warning('最多上传 3 张凭证'); return; }
        files = files.slice(0, remain);
        var index = 0;
        var next = function () {
          if (index >= files.length) { return; }
          var file = files[index++];
          compressImage(file, 1000, 0.72, function (dataUrl) {
            if (!dataUrl) { self.$message.error('有图片读取失败，已跳过'); next(); return; }
            if (dataUrl.length > 400000) { self.$message.warning('有图片超过大小限制，已跳过'); next(); return; }
            self.appealEvidence.push(dataUrl);
            next();
          });
        };
        next();
      },
      removeEvidence: function (index) {
        this.appealEvidence.splice(index, 1);
      },
      submitAppeal: function () {
        var self = this;
        var content = String(this.appealForm.content || '').trim();
        if (!content) { this.$message.warning('请填写上诉理由'); return; }
        if (content.length > 1000) { this.$message.warning('上诉理由不要超过 1000 字'); return; }
        this.appealSubmitting = true;
        api.post('/api/reports/' + this.appealTarget.id + '/appeal', {
          content: content, evidence: this.appealEvidence.slice()
        }).then(function (res) {
          self.appealSubmitting = false;
          if (!res || !res.ok) { return; }
          self.$message.success(res.message || '上诉已提交，等待平台复核');
          self.appealVisible = false;
          self.load();
        });
      }
    }
  };

  /* ---------------------------- 营收统计 ---------------------------- */

  var tabStat = {
    name: 'tab-stat',
    template: '#tpl-tab-stat',
    props: { kpi: { type: Object, default: function () { return {}; } } },
    data: function () {
      return { trend: [], productRank: [], categoryRevenue: [], settlements: [], loadingSettle: false, fmt: fmt };
    },
    created: function () { this.load(); this.loadSettlements(); },
    computed: {
      categoryItems: function () {
        var palette = [COLORS.BRAND, COLORS.WARN, COLORS.INFO, COLORS.ACCENT];
        return this.categoryRevenue.map(function (c, i) {
          return { name: c.name, value: c.amount, color: palette[i % palette.length] };
        });
      },
      /**
       * 「已完成」数量：优先用后端新口径 completedCount；
       * 老版本接口只有 useCount（已核销），做一次兼容，避免升级瞬间统计归零。
       */
      completedCount: function () {
        var k = this.kpi || {};
        if (k.completedCount !== undefined && k.completedCount !== null) { return k.completedCount; }
        return k.useCount || 0;
      }
    },
    methods: {
      load: function () {
        var self = this;
        api.get('/api/stat/merchant').then(function (res) {
          if (!res.ok) { return; }
          self.trend = res.trend || [];
          self.productRank = res.productRank || [];
          self.categoryRevenue = res.categoryRevenue || [];
        });
      },
      /** 结算流水：正数入账、负数冲减，只含当前商家自己的记录 */
      loadSettlements: function () {
        var self = this;
        this.loadingSettle = true;
        api.get('/api/stat/settlements', null, { silent: true }).then(function (res) {
          self.loadingSettle = false;
          if (!res || !res.ok) { return; }
          self.settlements = res.list || [];
        });
      }
    }
  };

  /* ---------------------------- 个人中心 ---------------------------- */

  var tabProfile = {
    name: 'tab-profile',
    template: '#tpl-tab-profile',
    props: {
      me: { type: Object, default: function () { return { profile: {} }; } },
      kpi: { type: Object, default: function () { return {}; } }
    },
    data: function () {
      return {
        saving: false,
        pwdForm: { old: '', new: '', confirm: '' },
        // 主题：初值由 ZQTheme 决定（head 里已应用过一次）
        themeMode: (window.ZQTheme ? window.ZQTheme.get() : 'light'),
        themeOptions: (window.ZQTheme ? window.ZQTheme.options : [])
      };
    },
    created: function () {
      var self = this;
      if (window.ZQTheme) {
        this.themeMode = window.ZQTheme.get();
        this._themeOff = window.ZQTheme.onChange(function (mode) { self.themeMode = mode; });
      }
    },
    beforeDestroy: function () {
      if (this._themeOff) { this._themeOff(); this._themeOff = null; }
    },
    computed: {
      avatar: function () {
        return window.ZQProfile.avatarOf(this.me.profile || {});
      },
      avatarSrc: function () {
        return window.ZQProfile.src(this.me.profile || {}, 'merchant');
      },
      initial: function () {
        return window.ZQProfile.initials(this.me.profile.short || this.me.name);
      }
    },
    methods: {
      /** 切换主题：样式应用在 ZQTheme，这里只同步选中态 */
      setTheme: function (mode) {
        if (!window.ZQTheme) { return; }
        this.themeMode = window.ZQTheme.set(mode);
      },
      pickAvatar: function () { this.$refs.avatarInput.click(); },
      onAvatarPick: function (e) {
        var self = this;
        var file = (e.target.files || [])[0];
        e.target.value = '';
        if (!file) { return; }
        window.ZQProfile.compress(file, function (dataUrl) {
          if (!dataUrl) { return self.$message.error('图片读取失败，换一张试试'); }
          window.ZQProfile.upload(dataUrl).then(function (res) {
            if (!res.ok) { return; }
            // 直接写回同一个 profile 对象，顶栏头像会跟着更新
            self.$set(self.me, 'profile', Object.assign({}, self.me.profile, { avatar: dataUrl }));
            self.$message.success('头像已更新');
          });
        });
      },
      savePwd: function () {
        var self = this;
        var f = this.pwdForm;
        if (!f.old) { return this.$message.warning('请填写原密码'); }
        if (!f.new || f.new.length < 6) { return this.$message.warning('新密码至少 6 位'); }
        if (f.new !== f.confirm) { return this.$message.warning('两次输入的新密码不一致'); }
        this.saving = true;
        api.post('/api/auth/password', { oldPassword: f.old, newPassword: f.new }).then(function (res) {
          self.saving = false;
          if (!res.ok) { return; }
          self.$message.success(res.message || '密码已修改');
          self.pwdForm = { old: '', new: '', confirm: '' };
        });
      }
    }
  };

  /* ---------------------------- 根实例 ---------------------------- */

  // 图表组件必须【全局】注册：tab-home / tab-stat 是根实例的子组件，
  // 而 Vue 2 的局部 components 只在注册它的那个实例的模板里可见，
  // 子组件模板里的 <zq-line> / <zq-bars> / <zq-donut> 会解析不到，
  // 结果是卡片有标题、图表区一片空白，且生产版 vue.min.js 不给任何警告。
  Vue.component('zq-line', window.ZQCharts.LineChart);
  Vue.component('zq-donut', window.ZQCharts.Donut);
  Vue.component('zq-bars', window.ZQCharts.Bars);
  Vue.component('zq-spark', window.ZQCharts.Spark);

  new Vue({
    el: '#app',
    components: {
      'tab-home': tabHome, 'tab-goods': tabGoods, 'tab-orders': tabOrders,
      'tab-chat': tabChat, 'tab-reports': tabReports,
      'tab-stat': tabStat, 'tab-profile': tabProfile
    },
    data: function () {
      return {
        loading: false,
        tab: 'home',
        user: null,
        me: { name: '', profile: {}, merchantId: '' },
        // 跨 tab 跳转用的一次性参数：聊天目标买家、待打开订单、待编辑商品
        chatSeed: null, orderFocus: '', goodsFocus: '',
        site: {},
        kpi: {},
        authTab: 'login',
        allowRegister: true,
        merchantTypes: ['农产品农户', '非遗手艺人', '民宿经营者', '餐饮农家乐', '文创商户', '其他'],
        loginForm: { account: '', password: '' },
        loginRules: {
          account: [{ required: true, message: '请输入商家账号', trigger: 'blur' }],
          password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
        },
        regForm: { account: '', password: '', confirm: '', shopName: '', name: '', shopType: '农产品农户', phone: '' },
        knownAll: [],
        fmt: fmt,
        menus: [
          { key: 'home', name: '工作台概览', icon: 'el-icon-data-line' },
          { key: 'goods', name: '商品管理', icon: 'el-icon-goods' },
          { key: 'orders', name: '订单管理', icon: 'el-icon-tickets' },
          { key: 'chat', name: '消息客服', icon: 'el-icon-chat-dot-round' },
          { key: 'reports', name: '用户举报', icon: 'el-icon-warning-outline' },
          { key: 'stat', name: '营收统计', icon: 'el-icon-pie-chart' },
          { key: 'profile', name: '个人中心', icon: 'el-icon-user' }
        ]
      };
    },
    computed: {
      knownMerchants: function () {
        return this.knownAll.filter(function (a) { return a.role === 'merchant'; });
      },
      avatarUrl: function () {
        return window.ZQProfile.avatarOf(this.me.profile || {});
      },
      avatarSrc: function () {
        return window.ZQProfile.src(this.me.profile || {}, 'merchant');
      },
      initial: function () {
        return window.ZQProfile.initials(this.me.profile.short || this.me.name);
      }
    },
    created: function () {
      var self = this;
      window.ZQ.notify.onToast = function (message, type) {
        self.$message({ message: message, type: type === 'success' ? 'success' : 'error', showClose: true });
      };
      window.ZQ.notify.onUnauthorized = function (message) {
        self.user = null;
        self.$message.error(message);
      };
      this.bootstrap();
    },
    methods: {
      knownAvatar: function (a) {
        return window.ZQProfile.src(a, 'merchant');
      },
      bootstrap: function () {
        var self = this;
        api.get('/api/server/info', null, { silent: true }).then(function (res) {
          if (!res.ok) { return; }
          self.site = { name: res.name, shortName: res.shortName };
          document.title = (res.shortName || '战旗云') + ' · 商户工作台';
        });
        api.get('/api/auth/options', null, { silent: true }).then(function (res) {
          if (!res.ok) { return; }
          self.merchantTypes = res.shopTypes || self.merchantTypes;
          self.allowRegister = res.allowRegister !== false;
        });
        this.loadKnown();

        if (store.token) {
          api.get('/api/auth/me', null, { silent: true }).then(function (res) {
            if (res.ok && res.role === 'merchant') {
              self.user = { role: res.role };
              self.me = { name: res.name, profile: res.profile || {}, merchantId: res.merchantId || '' };
              self.loadKpi();
            } else {
              store.clear();
              self.user = null;
            }
          });
        }
      },
      loadKnown: function () {
        var self = this;
        api.get('/api/auth/known', { role: 'merchant' }, { silent: true }).then(function (res) {
          if (res.ok) { self.knownAll = res.accounts || []; }
        });
      },
      loadKpi: function () {
        var self = this;
        api.get('/api/stat/merchant', null, { silent: true }).then(function (res) {
          if (res.ok) { self.kpi = res.kpi || {}; }
        });
      },
      doLogin: function () {
        var self = this;
        this.$refs.loginForm.validate(function (valid) {
          if (!valid) { return; }
          self.loading = true;
          api.post('/api/auth/login', {
            account: self.loginForm.account,
            password: self.loginForm.password,
            expect: 'merchant',
            client: 'merchant'
          }).then(function (res) {
            self.loading = false;
            if (!res.ok) { return; }
            store.save(res.token, res.role, res.name);
            self.user = { role: res.role };
            self.$message.success('欢迎回来，' + res.name);
            self.loadKnown();
            self.refreshMe();
            self.loadKpi();
          });
        });
      },
      quickLogin: function (account) {
        var self = this;
        api.post('/api/auth/quick-login', {
          account: account.account, token: account.token, expect: 'merchant', client: 'merchant'
        }).then(function (res) {
          if (!res.ok) { return; }
          store.save(res.token, res.role, res.name);
          self.user = { role: res.role };
          self.$message.success('已进入工作台');
          self.loadKnown();
          self.refreshMe();
          self.loadKpi();
        });
      },
      refreshMe: function () {
        var self = this;
        api.get('/api/auth/me', null, { silent: true }).then(function (res) {
          if (res.ok) {
            self.me = { name: res.name, profile: res.profile || {}, merchantId: res.merchantId || '' };
          }
        });
      },
      doRegister: function () {
        var self = this;
        if (!this.regForm.account || !this.regForm.password) {
          this.$message.error('请填写账号和密码');
          return;
        }
        if (this.regForm.password !== this.regForm.confirm) {
          this.$message.error('两次输入的密码不一致');
          return;
        }
        this.loading = true;
        api.post('/api/auth/register', Object.assign({ role: 'merchant' }, this.regForm)).then(function (res) {
          self.loading = false;
          if (!res.ok) { return; }
          self.$message.success(res.message);
          self.authTab = 'login';
          self.loginForm.account = res.account;
          self.loginForm.password = '';
        });
      },
      loadAll: function () { this.loadKpi(); },
      /** 订单详情「联系用户」→ 切到消息客服并定位该买家 */
      openChat: function (payload) {
        this.chatSeed = Object.assign({ at: Date.now() }, payload || {});
        this.tab = 'chat';
      },
      /** 聊天订单卡片 → 切到订单管理并自动打开该订单详情 */
      openOrder: function (orderId) {
        if (!orderId) { return; }
        this.orderFocus = String(orderId);
        this.tab = 'orders';
      },
      /** 聊天商品卡片 → 切到商品管理并自动打开该商品编辑弹窗 */
      openGoods: function (productId) {
        this.goodsFocus = productId ? String(productId) : '';
        this.tab = 'goods';
      },
      onCommand: function (cmd) {
        var self = this;
        if (cmd === 'logout') {
          api.post('/api/auth/logout').then(function () {
            store.clear();
            self.user = null;
            self.loginForm.password = '';
            self.loadKnown();
          });
        } else if (cmd === 'refresh') {
          this.loadKpi();
          this.$message.success('已刷新');
        } else if (cmd === 'profile') {
          this.tab = 'profile';
        }
      }
    }
  });
})();
