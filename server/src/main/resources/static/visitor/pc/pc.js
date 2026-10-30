/* ============================================================================
 *  游客端 · 电脑版（宽屏独立页面）
 *
 *  和手机版的关系：
 *    · 同一套后端接口、同一套配色变量（assets/css/app.css），视觉保持一致；
 *    · 手机版在 /visitor/，电脑版在 /visitor/pc/，两边入口都做设备检测自动跳转；
 *    · 布局按鼠标 + 宽屏优化：顶部导航、左筛选右网格、详情用右侧抽屉，
 *      不使用手机版的底部 tabbar 与全屏页面堆叠。
 *
 *  约定：图标一律用 assets/img/icons.svg 的 <use>，不要用 emoji 或单字顶替。
 * ========================================================================== */
(function () {
  'use strict';

  var api = window.ZQ.api;
  var fmt = window.ZQ.fmt;
  var store = window.ZQ.store;
  var COLORS = window.ZQChartColors;

  var CATEGORY_TEXT = { goods: '农产文创', study: '研学课程', homestay: '民宿住宿', experience: '农事体验' };

  /* 订单 / 举报状态的中文兜底：优先用后端下发的 statusText，
     这里只在旧数据或字段缺失时兜底，避免页面出现英文状态码。 */
  var ORDER_STATUS_TEXT = {
    pending: '待确认', confirmed: '已确认', shipped: '已发货', checked_in: '已入住',
    completed: '已完成', used: '已核销', cancelled: '已取消', refunded: '已退款'
  };
  var REPORT_STATUS_TEXT = {
    pending: '待处理', resolved: '已处理', appealed: '上诉审核中', appeal_resolved: '上诉已处理'
  };
  var REPORT_ROLE_TEXT = { buyer: '买家', merchant: '商家', admin: '平台', system: '系统' };

  /* 举报分类兜底：正常情况以后端 GET /api/reports/categories 下发为准，
     这里只在接口异常/未就绪时保证页面仍可演示（与 Dict.REPORT_CATEGORY_TEXT 同口径）。 */
  var DEFAULT_REPORT_CATEGORIES = [
    { key: 'service', name: '商家服务态度问题', reasons: ['语气恶劣 / 不耐烦', '不回复消息', '拒绝提供服务', '态度歧视'] },
    { key: 'product', name: '商品问题', reasons: ['商品与描述不符', '质量问题 / 破损', '缺斤少两', '假冒伪劣'] },
    { key: 'logistics', name: '发货物流问题', reasons: ['迟迟不发货', '物流信息造假', '包裹丢失 / 损坏', '运费纠纷'] },
    { key: 'money', name: '钱款纠纷', reasons: ['拒绝退款', '多收费用', '押金不退', '价格欺诈'] },
    { key: 'fraud', name: '商家欺诈', reasons: ['虚假宣传', '收款不发货', '诱导线下交易', '其他欺诈行为'] }
  ];

  /** dataURL 的体积（字节）：后端按字符长度限制 400000，这里按 base64 反推真实字节数 */
  function dataUrlBytes(url) {
    var s = String(url || '');
    var i = s.indexOf(',');
    var b64 = i >= 0 ? s.slice(i + 1) : s;
    return Math.floor(b64.length * 3 / 4);
  }

  /** 本地日期 → YYYY-MM-DD（不能用 toISOString：东八区凌晨会退到前一天） */
  function localDate(d) {
    var pad = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** 日期加天数，返回 YYYY-MM-DD（民宿默认离店日期用） */
  function addDays(dateStr, n) {
    var d = new Date(String(dateStr || '') + 'T00:00:00');
    if (isNaN(d.getTime())) { return ''; }
    d.setDate(d.getDate() + (Number(n) || 0));
    return localDate(d);
  }

  new Vue({
    el: '#pc',
    data: function () {
      return {
        booted: false,
        loading: false,
        view: 'home',
        user: null,
        me: { name: '', profile: {} },
        pwdVisible: false,
        pwdSaving: false,
        pwdForm: { old: '', new: '', confirm: '' },
        site: {},
        links: {},
        authTab: 'login',
        loginForm: { account: '', password: '' },
        regForm: { account: '', password: '', confirm: '', name: '', phone: '' },
        known: [],
        spots: [],
        products: [],
        activities: [],
        orders: [],
        /* 订单状态页签：全部 + 后端状态字典（used 已核销仅历史数据，文案兜底兼容） */
        ordersFilter: 'all',
        orderTabs: [
          { key: 'all', text: '全部' },
          { key: 'pending', text: '待确认' },
          { key: 'confirmed', text: '已确认' },
          { key: 'shipped', text: '已发货' },
          { key: 'checked_in', text: '已入住' },
          { key: 'completed', text: '已完成' },
          { key: 'cancelled', text: '已取消' },
          { key: 'refunded', text: '已退款' }
        ],
        orderDetail: null,
        orderDetailLoading: false,
        orderLogs: [],
        orderLogistics: null,
        decisionReason: '',
        deciding: false,
        receiving: false,
        cancelling: false,
        stamps: [],
        category: '',
        keyword: '',
        currentSpot: null,
        spotGalleryIndex: 0,     // 点位图集当前第几张
        spotGalleryTimer: null,  // 点位图集自动轮播定时器（4.2 秒一张）
        speaking: false,
        showScript: false,
        voiceName: '',
        currentAct: null,
        actForm: { date: '', people: 2, phone: '', remark: '' },
        booking: false,
        currentProduct: null,
        detailLoading: false,
        productBuy: { qty: 1, bookDate: '', people: 2, address: '', remark: '', bookingSlot: '', checkOutDate: '', roomType: '' },
        buying: false,
        cart: [],
        cartOpen: false,
        // 主题：'light' | 'dark'。初值由 ZQTheme 决定（脚本在 head 里已应用过一次）
        themeMode: (window.ZQTheme ? window.ZQTheme.get() : 'light'),
        currentProductImageIndex: 0,
        address: '',
        remark: '',
        submitting: false,

        /* 商家主页 */
        merchantHome: null,
        merchantLoading: false,
        merchantBackView: 'shop',

        /* 聊天 */
        chatMerchant: null,
        chatMessages: [],
        chatMessagesLoading: false,
        chatText: '',
        chatSending: false,
        chatPeerTyping: false,
        chatPeerOnline: false,
        chatAttachOpen: false,
        chatPanelTab: 'product',
        chatProducts: [],
        chatThreads: [],
        chatThreadsLoading: false,
        chatComposing: false,
        chatPollTimer: null,
        chatTypingAt: 0,
        chatSendSeq: 0,   // 会话代次：切换商家时 +1，作废旧会话尚未返回的异步结果

        /* 图片预览与拍摄 */
        imagePreview: '',
        cameraOpen: false,
        cameraShot: '',
        cameraError: '',
        cameraStream: null,

        /* 举报中心 */
        reportTab: 'form',
        reportCategories: [],
        reportForm: { merchantId: '', category: '', reason: '', content: '', evidence: [] },
        reportSubmitting: false,
        reportList: [],
        reportLoading: false,
        reportPresetMerchant: null,
        toastList: [],
        ai: { question: '', answer: '', shown: '', streaming: false, sources: [], loading: false, mode: 'ask', planDays: 2, planPeople: 2, planPref: '亲子' },
        categories: CATEGORY_TEXT
      };
    },
    computed: {
      avatarUrl: function () {
        return window.ZQProfile.avatarOf(this.me.profile || {});
      },
      /* 没上传照片时用游客端默认艺术头像，不再用姓名首字 */
      avatarSrc: function () {
        return this.avatarUrl || window.ZQProfile.defaultFor('buyer');
      },
      profileInitial: function () {
        return window.ZQProfile.initials(this.me.name);
      },
      /**
       * 「猜你想问」：按当前问答里出现的关键词命中相关追问，不够 4 个用常见问题补齐。
       * 纯前端生成，不额外调接口 —— 演示时点一下就有下一步，不用自己想问题。
       */
      suggestions: function () {
        var text = (this.ai.question || '') + ' ' + (this.ai.answer || '');
        var pool = [
          { k: ['交通', '怎么去', '地址', '自驾', '地铁'], q: '从成都市区怎么过去？' },
          { k: ['吃', '餐', '菜', '美食', '小吃'], q: '村里有什么好吃的？' },
          { k: ['住', '民宿', '过夜', '房间'], q: '民宿怎么订？大概多少钱？' },
          { k: ['亲子', '孩', '小孩', '带娃'], q: '适合带老人小孩来吗？' },
          { k: ['非遗', '布鞋', '手作', '竹编', '豆瓣'], q: '非遗体验课怎么预约？' },
          { k: ['季节', '什么时候', '几月', '风景'], q: '什么季节来最好？' },
          { k: ['伴手礼', '特产', '买什么', '礼盒'], q: '有什么值得带的伴手礼？' },
          { k: ['门票', '开放', '营业', '时间'], q: '要门票吗？几点开门？' },
          { k: ['停车', '车位', '开车'], q: '停车方便吗？有充电桩吗？' },
          { k: ['宠物', '狗', '猫'], q: '可以带宠物进村吗？' }
        ];
        var out = [];
        for (var i = 0; i < pool.length; i++) {
          if (out.length >= 4) { break; }
          for (var j = 0; j < pool[i].k.length; j++) {
            if (text.indexOf(pool[i].k[j]) >= 0) { out.push(pool[i].q); break; }
          }
        }
        for (var k = 0; k < pool.length && out.length < 4; k++) {
          if (out.indexOf(pool[k].q) < 0) { out.push(pool[k].q); }
        }
        return out.slice(0, 4);
      },
      /** 当前商品的图集（后端 images 已含 cover 兜底；为空时退回 cover 单图） */
      /** 当前点位图集：后端 images 已含 cover 兜底；只有 1 张时不轮播 */
      spotImages: function () {
        var s = this.currentSpot;
        if (!s) { return []; }
        var list = (s.images || []).filter(function (x) { return !!x; });
        if (!list.length && s.cover) { list = [s.cover]; }
        return list;
      },
      spotGalleryImage: function () {
        var list = this.spotImages;
        if (!list.length) { return ''; }
        var i = Math.min(Math.max(0, this.spotGalleryIndex || 0), list.length - 1);
        return list[i];
      },

      currentProductImages: function () {
        var p = this.currentProduct;
        if (!p) { return []; }
        var list = (p.images || []).filter(function (x) { return !!x; });
        if (!list.length && p.cover) { list = [p.cover]; }
        return list;
      },
      currentProductImage: function () {
        var list = this.currentProductImages;
        if (!list.length) { return ''; }
        var i = Math.min(Math.max(0, this.currentProductImageIndex || 0), list.length - 1);
        return list[i];
      },

      cartCount: function () {
        return this.cart.reduce(function (s, x) { return s + x.qty; }, 0);
      },
      cartTotal: function () {
        return this.cart.reduce(function (s, x) { return s + x.qty * x.price; }, 0);
      },
      filteredProducts: function () {
        var self = this;
        var kw = this.keyword.trim();
        return this.products.filter(function (p) {
          if (self.category && p.category !== self.category) { return false; }
          if (kw && String(p.name).indexOf(kw) < 0) { return false; }
          return true;
        });
      },
      stampCount: function () {
        return (this.stamps || []).length;
      },
      stampPercent: function () {
        var total = this.spots.length || 1;
        return Math.round(this.stampCount / total * 100);
      },
      upcoming: function () {
        var today = new Date().toISOString().slice(0, 10);
        return this.activities.filter(function (a) { return !a.date || a.date >= today; });
      },
      categoryItems: function () {
        var map = {};
        this.orders.forEach(function (o) {
          if (o.status !== 'used' && o.status !== 'confirmed') { return; }
          var k = CATEGORY_TEXT[o.category] || '其他';
          map[k] = (map[k] || 0) + Number(o.amount || 0);
        });
        var palette = [COLORS.BRAND, COLORS.WARN, COLORS.INFO, COLORS.ACCENT];
        return Object.keys(map).map(function (k, i) {
          return { name: k, value: map[k], color: palette[i % palette.length] };
        });
      },

      /* ---------------- 订单筛选与详情 ---------------- */
      filteredOrders: function () {
        var f = this.ordersFilter;
        return (this.orders || []).filter(function (o) {
          if (f === 'all') { return true; }
          // 「已完成」页签顺带收历史 used（已核销）订单，旧数据不至于凭空消失
          if (f === 'completed') { return o.status === 'completed' || o.status === 'used'; }
          return o.status === f;
        });
      },
      orderTimeline: function () {
        var o = this.orderDetail;
        if (!o) { return []; }
        return [
          { text: '下单时间', at: o.createdAt },
          { text: '商家确认', at: o.confirmedAt },
          { text: '商家发货', at: o.shippedAt },
          { text: '完成时间', at: o.completedAt || o.verifiedAt },
          { text: '完成时间', at: o.completedAt },
          { text: '取消时间', at: o.cancelledAt },
          { text: '退款时间', at: o.refundedAt }
        ].filter(function (x) { return !!x.at; });
      },
      isBookingOrder: function () {
        var o = this.orderDetail;
        return !!o && ['study', 'homestay', 'experience'].indexOf(String(o.category)) >= 0;
      },
      /* 物流小卡车位置：progress 0–3 映射到路线 8%–92%，两端留出图标宽度 */
      logisticsTruckLeft: function () {
        var l = this.orderLogistics;
        if (!l || !l.nodes || !l.nodes.length) { return '8%'; }
        var p = Math.max(0, Math.min(3, Number(l.progress) || 0));
        return (8 + p / 3 * 84) + '%';
      },

      /* ---------------- 商品购买表单 ---------------- */
      today: function () { return localDate(new Date()); },
      currentProductMerchant: function () {
        var p = this.currentProduct;
        if (!p) { return null; }
        if (p.merchant && (p.merchant.id || p.merchant.name)) { return p.merchant; }
        if (p.merchantId) {
          return { id: p.merchantId, name: p.merchantName || '商家', avatar: '', type: '', intro: '', online: false };
        }
        return null;
      },
      productSlots: function () { return this.slotsOfProduct(this.currentProduct); },
      productRoomTypes: function () { return this.roomTypesOfProduct(this.currentProduct); },

      /* ---------------- 聊天 ---------------- */
      chatStateText: function () {
        if (!this.chatMerchant) { return '—'; }
        if (this.chatPeerTyping) { return '对方输入中'; }
        return this.chatPeerOnline ? '在线中' : '离线中';
      },
      chatProductList: function () {
        return (this.chatProducts || []).filter(function (p) { return p && p.status !== 'off'; });
      },
      chatOrderList: function () {
        var self = this;
        if (!this.chatMerchant) { return []; }
        return (this.orders || []).filter(function (o) { return o.merchantId === self.chatMerchant.id; });
      },

      /* ---------------- 举报中心 ---------------- */
      currentReportCategory: function () {
        var key = this.reportForm.category;
        var hit = null;
        (this.reportCategories || []).forEach(function (c) { if (c.key === key) { hit = c; } });
        return hit;
      },
      reportMerchantOptions: function () {
        var map = {};
        var list = [];
        function add(m) {
          if (!m || !m.id || map[m.id]) { return; }
          map[m.id] = 1;
          list.push({ id: m.id, name: m.name || m.merchantName || m.fullName || ('商家 ' + m.id) });
        }
        add(this.reportPresetMerchant);
        (this.products || []).forEach(function (p) {
          add(p.merchant || (p.merchantId ? { id: p.merchantId, name: p.merchantName } : null));
        });
        (this.orders || []).forEach(function (o) {
          add(o.merchant || (o.merchantId ? { id: o.merchantId, name: o.merchantName } : null));
        });
        (this.chatThreads || []).forEach(function (t) {
          add({ id: t.merchantId, name: t.merchantName });
        });
        return list;
      }
    },
    created: function () {
      var self = this;
      window.ZQ.notify.onToast = function (message, type) { self.toast(message, type); };
      window.ZQ.notify.onUnauthorized = function (message) {
        // 令牌失效会自动退回登录页，讲解必须同时停，否则会在登录页继续念
        self.stopSpeak();
        self.user = null;
        self.toast(message, 'error');
      };
      if (window.ZQSpeech) {
        window.ZQSpeech.preload();
        window.ZQSpeech.bind(function (speaking) { self.speaking = speaking; });
        this.voiceName = window.ZQSpeech.voiceLabel();
      }
      // 订阅主题变化：其它标签页/其它端改了主题，这里按钮选中态跟着更新
      if (window.ZQTheme) {
        this.themeMode = window.ZQTheme.get();
        this._themeOff = window.ZQTheme.onChange(function (mode) { self.themeMode = mode; });
      }
      this.bootstrap();
    },
    /* 抽屉一关（点遮罩、点叉、切换点位）就停朗读；
       切到别的视图同理 —— 这是「退出后还在念」的根治点。 */
    watch: {
      currentSpot: function (now) {
        if (!now) {
          this.stopSpeak();
          this.stopSpotGallery();   // 抽屉关了，轮播也停
        }
      },
      view: function () {
        this.stopSpeak();
        this.stopSpotGallery();
      },
    },
    beforeDestroy: function () {
      // 离开页面（刷新/关闭标签）时释放轮询与摄像头，避免后台占资源
      this.stopChatPoll();
      this.closeCamera();
      this.stopSpeak();
      this.stopSpotGallery();
      if (this._themeOff) { this._themeOff(); this._themeOff = null; }
    },
    methods: {
      /* ---------------------------- 基础 ---------------------------- */
      icon: function (name) { return '../../assets/img/icons.svg#' + name; },
      knownAvatar: function (a) {
        return window.ZQProfile.src(a, 'buyer');
      },
      spotIcon: function (spot) { return window.ZQSpotIcons.iconOf(spot); },
      asset: function (p) {
        if (!p) { return '../../assets/img/photos/spot-center.jpg'; }
        // dataURL（聊天图片 / 举报凭证）原样返回，不能加 "/" 前缀
        if (String(p).indexOf('data:') === 0) { return p; }
        return p.charAt(0) === '/' ? p : '/' + p;
      },
      /** 后端 JSON 列 / 旧数据字符串统一成数组（tags、timeSlots、roomTypes 用） */
      listOf: function (v) {
        if (!v) { return []; }
        if (Array.isArray(v)) { return v.filter(function (x) { return x !== null && x !== ''; }); }
        if (typeof v === 'string') {
          var s = v.trim();
          if (!s) { return []; }
          if (s.charAt(0) === '[') {
            try {
              var arr = JSON.parse(s);
              return Array.isArray(arr) ? arr : [];
            } catch (e) { /* 落到逗号分隔兜底 */ }
          }
          return s.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
        }
        return [];
      },
      /** 商家头像：自定义 dataURL/相对路径优先，否则用商户默认艺术头像 */
      merchantAvatar: function (m) {
        var mm = m || {};
        return window.ZQProfile.src({ avatar: mm.avatar }, 'merchant');
      },
      money: function (v) { return fmt.money(v); },
      date: function (v) { return fmt.date(v); },
      time: function (v) { return fmt.time(v); },
      toast: function (message, type) {
        var item = { text: message, type: type || 'ok', id: Date.now() + Math.random() };
        this.toastList.push(item);
        var self = this;
        setTimeout(function () {
          self.toastList = self.toastList.filter(function (t) { return t.id !== item.id; });
        }, 2600);
      },
      go: function (view) {
        if (view !== 'ai') { this.stopTyping(); }
        // 离开聊天必须停轮询并释放摄像头，否则会在后台一直请求、一直占用设备
        if (view !== 'chat') {
          this.stopChatPoll();
          this.closeCamera();
          this.chatAttachOpen = false;
        }
        this.view = view;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (view === 'orders' && this.user) { this.loadOrders(); }
        if (view === 'spots' && this.user) { this.loadStamps(); }
        if (view === 'mine' && this.user) { this.loadOrders(); this.loadStamps(); }
        if (view === 'chatList' && this.user) { this.loadChatThreads(); }
        if (view === 'reports' && this.user) {
          this.loadReportCategories();
          if (this.reportTab === 'mine') { this.loadReportMine(); }
        }
        // 从商家主页返回聊天：恢复轮询并拉一次最新消息
        if (view === 'chat' && this.user && this.chatMerchant) {
          this.loadChatMessages(true);
          this.startChatPoll();
        }
      },

      /* ---------------------------- 启动 ---------------------------- */
      bootstrap: function () {
        var self = this;
        api.get('/api/server/info', null, { silent: true }).then(function (res) {
          if (!res.ok) { return; }
          self.site = { name: res.name, shortName: res.shortName, slogan: res.slogan, announcement: res.announcement };
          self.links = { mobileUrl: res.mobileUrl, merchantUrl: res.merchantUrl, adminUrl: res.adminUrl };
          document.title = (res.shortName || '战旗云') + ' · 游客端';
          // 语音策略统一由服务端下发（app.speech.*），与手机版同一套参数
          if (res.speech && window.ZQSpeech) {
            window.ZQSpeech.configure(res.speech);
            self.voiceName = window.ZQSpeech.voiceLabel();
          }
        });
        this.loadSpots();
        this.loadProducts();
        this.loadActivities();
        this.loadKnown();

        if (store.token) {
          api.get('/api/auth/me', null, { silent: true }).then(function (res) {
            if (res.ok && res.role === 'buyer') {
              self.user = { role: res.role };
              self.me = { name: res.name, profile: res.profile || {}, userId: res.userId || '' };
              self.loadOrders();
              self.loadStamps();
            } else {
              store.clear();
              self.user = null;
            }
            self.booted = true;
          });
        } else {
          this.booted = true;
        }
      },

      /* ---------------------------- 数据 ---------------------------- */
      loadSpots: function () {
        var self = this;
        api.get('/api/tour/spots', null, { silent: true }).then(function (res) {
          if (res.ok) { self.spots = res.spots || []; }
        });
      },
      loadProducts: function () {
        var self = this;
        api.get('/api/shop/products', null, { silent: true }).then(function (res) {
          if (res.ok) { self.products = res.products || []; }
        });
      },
      loadActivities: function () {
        var self = this;
        api.get('/api/tour/activities', null, { silent: true }).then(function (res) {
          if (res.ok) { self.activities = res.activities || []; }
        });
      },

      /* ---------------------------- 活动详情与预约 ---------------------------- */
      actRange: function (a) {
        if (!a) { return ''; }
        var s = String(a.date || '');
        var e = String(a.endDate || '');
        return (!e || e === s) ? s : (s + ' 至 ' + e);
      },
      isActPast: function (a) {
        if (!a) { return false; }
        var end = String(a.endDate || a.date || '');
        var today = new Date().toISOString().slice(0, 10);
        return !!end && end < today;
      },
      bookingStatusText: function (s) {
        return { pending: '待村里确认', confirmed: '已确认', cancelled: '已取消' }[s] || s || '待确认';
      },
      openActivity: function (a) {
        var self = this;
        this.currentAct = a;
        this.booking = false;
        api.get('/api/tour/activities/' + a.id, null, { silent: true }).then(function (res) {
          if (!res.ok) { return; }
          var act = res.activity || {};
          self.currentAct = act;
          self.actForm = {
            date: act.date || '',
            people: act.myBooking ? act.myBooking.people : 2,
            phone: (act.myBooking && act.myBooking.phone) || (self.me.profile && self.me.profile.phone) || '',
            remark: (act.myBooking && act.myBooking.remark) || ''
          };
        });
      },
      bookActivity: function () {
        var self = this;
        if (!this.currentAct) { return; }
        if (!this.user) { this.toast('请先登录再预约', 'warn'); return; }
        if (!this.actForm.date) { this.toast('请选择参加日期', 'warn'); return; }
        this.booking = true;
        api.post('/api/tour/activities/' + this.currentAct.id + '/book', {
          date: this.actForm.date,
          people: Number(this.actForm.people) || 1,
          phone: this.actForm.phone,
          remark: this.actForm.remark
        }).then(function (res) {
          self.booking = false;
          if (!res.ok) { return; }
          self.toast(res.message || '预约成功');
          self.loadActivities();
          self.openActivity(self.currentAct);
        });
      },
      cancelBooking: function (b) {
        var self = this;
        api.post('/api/tour/bookings/' + b.id + '/cancel').then(function (res) {
          if (!res.ok) { return; }
          self.toast(res.message || '已取消预约');
          self.loadActivities();
          if (self.currentAct) { self.openActivity(self.currentAct); }
        });
      },
      loadOrders: function () {
        var self = this;
        if (!this.user) { return; }
        api.get('/api/shop/orders', null, { silent: true }).then(function (res) {
          if (res.ok) { self.orders = res.orders || []; }
        });
      },
      loadStamps: function () {
        var self = this;
        if (!this.user) { return; }
        api.get('/api/tour/stamps', null, { silent: true }).then(function (res) {
          if (res.ok) { self.stamps = res.stamps || []; }
        });
      },
      loadKnown: function () {
        var self = this;
        api.get('/api/auth/known', { role: 'buyer' }, { silent: true }).then(function (res) {
          if (res.ok) { self.known = res.accounts || []; }
        });
      },
      /** 登录接口只回 name/token，聊天与会话归属还需要 userId，这里静默补一次 */
      loadMe: function () {
        var self = this;
        if (!this.user) { return; }
        api.get('/api/auth/me', null, { silent: true }).then(function (res) {
          if (!res.ok) { return; }
          self.me = {
            name: res.name || self.me.name,
            profile: res.profile || self.me.profile || {},
            userId: res.userId || self.me.userId || ''
          };
        });
      },

      /* ---------------------------- 登录 ---------------------------- */
      doLogin: function () {
        var self = this;
        if (!this.loginForm.account || !this.loginForm.password) {
          this.toast('请填写账号和密码', 'warn');
          return;
        }
        this.loading = true;
        api.post('/api/auth/login', {
          account: this.loginForm.account, password: this.loginForm.password,
          expect: 'buyer', client: 'visitor'
        }).then(function (res) {
          self.loading = false;
          if (!res.ok) { return; }
          store.save(res.token, res.role, res.name);
          self.user = { role: res.role };
          self.me = { name: res.name, profile: res.profile || {}, userId: res.userId || '' };
          self.toast('欢迎回来，' + res.name);
          self.loadMe();
          self.loadKnown();
          self.loadOrders();
          self.loadStamps();
          self.view = 'home';
        });
      },
      quickLogin: function (account) {
        var self = this;
        api.post('/api/auth/quick-login', {
          account: account.account, token: account.token, expect: 'buyer', client: 'visitor'
        }).then(function (res) {
          if (!res.ok) { return; }
          store.save(res.token, res.role, res.name);
          self.user = { role: res.role };
          self.me = { name: res.name, profile: res.profile || {}, userId: res.userId || '' };
          self.toast('已进入');
          self.loadMe();
          self.loadOrders();
          self.loadStamps();
          self.view = 'home';
        });
      },
      doRegister: function () {
        var self = this;
        var f = this.regForm;
        if (!f.account || !f.password) { this.toast('请填写账号和密码', 'warn'); return; }
        if (f.password !== f.confirm) { this.toast('两次输入的密码不一致', 'warn'); return; }
        if (!f.name) { this.toast('请填写昵称', 'warn'); return; }
        this.loading = true;
        api.post('/api/auth/register', { role: 'buyer', account: f.account, password: f.password, name: f.name, phone: f.phone })
          .then(function (res) {
            self.loading = false;
            if (!res.ok) { return; }
            self.toast(res.message || '注册成功');
            self.authTab = 'login';
            self.loginForm.account = res.account || f.account;
            self.loginForm.password = '';
          });
      },
      logout: function () {
        var self = this;
        // 先停语音：退出请求是异步的，等它回来才停的话这段时间还在念
        this.stopSpeak();
        this.stopChatPoll();
        this.closeCamera();
        api.post('/api/auth/logout').then(function () {
          self.stopSpeak();
          store.clear();
          self.user = null;
          self.orders = [];
          self.stamps = [];
          self.chatMessages = [];
          self.chatThreads = [];
          self.chatMerchant = null;
          self.reportList = [];
          self.merchantHome = null;
          self.orderDetail = null;
          self.view = 'home';
        });
      },

      /* ------------------------ 点位图集轮播 ------------------------ */
      stepSpotImage: function (delta) {
        var n = this.spotImages.length;
        if (n <= 1) { return; }
        this.spotGalleryIndex = ((this.spotGalleryIndex + delta) % n + n) % n;
        this.startSpotGallery();   // 手动翻页后重新计时，别刚点完就被切走
      },
      /**
       * 定时切下一张。
       * 4.2 秒的理由与手机端一致：语音讲解一句话约 3–5 秒，图片节奏跟得上听众注意力。
       * 只有 1 张图时不启动（没意义且白耗 CPU）。
       */
      startSpotGallery: function () {
        var self = this;
        this.stopSpotGallery();
        if (this.spotImages.length <= 1) { return; }
        this.spotGalleryTimer = setInterval(function () {
          // 抽屉关了 / 换点位了 就自己停，避免后台空转
          if (!self.currentSpot || self.spotImages.length <= 1) {
            self.stopSpotGallery();
            return;
          }
          self.spotGalleryIndex = (self.spotGalleryIndex + 1) % self.spotImages.length;
        }, 4200);
      },
      stopSpotGallery: function () {
        if (this.spotGalleryTimer) {
          clearInterval(this.spotGalleryTimer);
          this.spotGalleryTimer = null;
        }
      },

      /* ---------------------------- 点位 ---------------------------- */
      openSpot: function (spot, autoSpeak) {
        var self = this;
        // 换点位/重开抽屉：先把上一段停掉，再刷新音色展示名（网络音色是异步补进来的）
        this.stopSpeak();
        this.showScript = false;
        if (window.ZQSpeech) { this.voiceName = window.ZQSpeech.voiceLabel(); }
        this.detailLoading = true;
        this.currentSpot = spot;
        this.spotGalleryIndex = 0;
        this.startSpotGallery();
        api.get('/api/tour/spots/' + spot.id, null, { silent: true }).then(function (res) {
          self.detailLoading = false;
          if (res.ok && res.spot) {
            self.currentSpot = res.spot;
            self.spotGalleryIndex = 0;
            self.startSpotGallery();
          }
          // 打卡后自动进详情并开讲：抽屉已经在眼前，直接起播
          if (autoSpeak) {
            setTimeout(function () { self.speak(self.currentSpot); }, 260);
          }
        });
      },
      checkin: function (spot) {
        var self = this;
        if (!this.user) { this.toast('请先登录再打卡', 'warn'); return; }
        api.post('/api/tour/spots/' + spot.id + '/checkin').then(function (res) {
          if (!res.ok) { return; }
          self.toast(res.message || '打卡成功');
          self.loadSpots();
          self.loadStamps();
          // 无论从列表还是详情打卡，都打开该点位的介绍抽屉并自动播报
          self.openSpot(spot, true);
        });
      },
      /* 语音讲解：统一走 ZQSpeech（音色优选 + 分句 + 可靠停止）。
         点一次播、再点一次停；spot.voice 是后端下发的语音包（auto/male/female），
         无声音时（浏览器吞掉语音、设备无音色）自动展开讲解文稿，不再让按钮干等。 */
      speak: function (spot) {
        var self = this;
        if (!spot || !spot.tts) { this.toast('该点位暂无讲解', 'warn'); return; }
        if (!window.ZQSpeech || !window.ZQSpeech.available()) {
          this.showScript = true;
          this.toast('当前浏览器不支持语音朗读，已展开讲解文稿', 'warn');
          return;
        }
        if (this.speaking) { this.stopSpeak(); return; }
        this.showScript = false;
        var pack = spot.voice || 'auto';
        var started = window.ZQSpeech.speak(spot.tts, {
          pack: pack,
          onFail: function () {
            self.showScript = true;
            self.speaking = false;
            self.toast('当前浏览器未能发声，已展开讲解文稿');
          }
        });
        if (!started) {
          this.showScript = true;
          this.toast('语音朗读启动失败，已展开讲解文稿', 'warn');
          return;
        }
        this.speaking = true;
      },
      stopSpeak: function () {
        if (window.ZQSpeech) { window.ZQSpeech.stop(); }
        this.speaking = false;
        this.showScript = false;
      },
      voiceLabel: function () { return this.voiceName || ''; },
      /* 语音包名称（自动/男声/女声）；点详情时展示，让用户知道管理员配置的是哪一套 */
      voicePackLabel: function () {
        var pack = this.currentSpot && this.currentSpot.voice;
        if (window.ZQSpeech && window.ZQSpeech.packLabel) { return window.ZQSpeech.packLabel(pack); }
        return '自动';
      },
      switchVoice: function () {
        if (!window.ZQSpeech || !window.ZQSpeech.available()) {
          this.toast('当前浏览器不支持语音朗读', 'warn');
          return;
        }
        var wasSpeaking = this.speaking;
        var spot = this.currentSpot;
        this.voiceName = window.ZQSpeech.cycleVoice() || this.voiceName;
        if (wasSpeaking && spot) {
          this.stopSpeak();
          this.speak(spot);
        }
        this.toast(this.voiceName ? '已切换音色：' + this.voiceName : '没有更多可用音色');
      },
      isChecked: function (spotId) {
        return this.stamps.some(function (s) { return s.spotId === spotId; });
      },

      /* ---------------------------- 商城 ---------------------------- */
      openProduct: function (p) {
        var self = this;
        this.detailLoading = true;
        this.currentProduct = p;
        this.currentProductImageIndex = 0;   // 换商品时图集回到第一张
        this.resetBuyForm(p);
        api.get('/api/shop/products/' + p.id, null, { silent: true }).then(function (res) {
          self.detailLoading = false;
          if (res.ok && res.product) {
            self.currentProduct = res.product;
            // 详情接口带回商家公开资料与场次/房型，重算一次表单默认值
            self.resetBuyForm(res.product);
          }
        });
      },
      /** 商品可预约场次：优先用后端下发，没有则按分类给默认（与 ShopService 保持一致） */
      slotsOfProduct: function (p) {
        if (!p) { return []; }
        var list = this.listOf(p.timeSlots);
        if (list.length) { return list; }
        if (p.category === 'experience') { return ['上午场 09:00-11:00', '下午场 14:00-16:00']; }
        return ['上午场 09:00', '下午场 14:00'];
      },
      roomTypesOfProduct: function (p) {
        var list = this.listOf(p && p.roomTypes);
        return list.length ? list : ['标准间', '大床房', '家庭房'];
      },
      resetBuyForm: function (p) {
        var today = this.today;
        this.productBuy = {
          qty: 1,
          bookDate: today,
          people: 2,
          address: this.address || '',
          remark: '',
          bookingSlot: (this.slotsOfProduct(p)[0] || ''),
          checkOutDate: addDays(today, 1),
          roomType: (this.roomTypesOfProduct(p)[0] || '')
        };
      },
      /** 商品图集翻页：循环，不因为到头了就卡住 */
      stepProductImage: function (delta) {
        var n = this.currentProductImages.length;
        if (n <= 1) { return; }
        this.currentProductImageIndex = ((this.currentProductImageIndex + delta) % n + n) % n;
      },

      addCartFromDetail: function () {
        var p = this.currentProduct;
        if (!p) { return; }
        var qty = Math.max(1, Number(this.productBuy.qty) || 1);
        if (Number(p.stock) >= 0 && qty > Number(p.stock)) {
          this.toast('库存不足，仅剩 ' + p.stock + ' ' + (p.unit || '份'), 'warn');
          return;
        }
        this.addCart(p, qty);
      },
      /**
       * 立即购买：四类商品共用 POST /api/shop/orders，
       * 差异只在需要携带的字段（地址 / 日期 / 场次 / 离店 / 房型 / 人数）。
       */
      buyProduct: function () {
        var self = this;
        var p = this.currentProduct;
        if (!this.user) { this.toast('请先登录再下单', 'warn'); return; }
        if (!p || this.buying) { return; }
        var f = this.productBuy;
        var category = p.category || 'goods';
        var qty = 1;
        var payload = { items: [], remark: String(f.remark || '').trim() };
        if (category === 'goods') {
          if (!String(f.address || '').trim()) { this.toast('请填写收货地址', 'warn'); return; }
          qty = Math.max(1, Number(f.qty) || 1);
          if (Number(p.stock) >= 0 && qty > Number(p.stock)) {
            this.toast('库存不足，仅剩 ' + p.stock + ' ' + (p.unit || '份'), 'warn');
            return;
          }
          payload.address = String(f.address).trim();
          payload.bookDate = '';
          payload.people = 1;
          payload.bookingSlot = '';
          payload.checkOutDate = '';
          payload.roomType = '';
        } else {
          if (!f.bookDate) {
            this.toast(category === 'homestay' ? '请选择入住日期' : '请选择预约日期', 'warn');
            return;
          }
          var people = Math.max(1, Number(f.people) || 1);
          qty = people;
          payload.bookDate = f.bookDate;
          payload.people = people;
          payload.address = '';
          if (category === 'homestay') {
            if (!f.checkOutDate) { this.toast('请选择离店日期', 'warn'); return; }
            if (String(f.checkOutDate) <= String(f.bookDate)) {
              this.toast('离店日期必须晚于入住日期', 'warn');
              return;
            }
            if (!f.roomType) { this.toast('请选择房型', 'warn'); return; }
            payload.bookingSlot = '';
            payload.checkOutDate = f.checkOutDate;
            payload.roomType = f.roomType;
          } else {
            if (!f.bookingSlot) { this.toast('请选择场次 / 时段', 'warn'); return; }
            payload.bookingSlot = f.bookingSlot;
            payload.checkOutDate = '';
            payload.roomType = '';
          }
        }
        payload.items = [{ productId: p.id, qty: qty }];
        this.buying = true;
        api.post('/api/shop/orders', payload).then(function (res) {
          self.buying = false;
          if (!res.ok) { return; }
          if (res.warnings && res.warnings.length) {
            self.toast('部分商品未下单：' + res.warnings[0], 'warn');
          } else {
            self.toast(res.message || '下单成功');
          }
          self.currentProduct = null;
          self.loadOrders();
          self.loadProducts();
          self.go('orders');
        });
      },
      /**
       * 加入购物车。
       *
       * 【准入】只有农产文创（goods）能进购物车；研学 / 民宿 / 农事体验必须走「立即预约」。
       * 原因：预约类要选日期、场次、房型、人数，这些是逐单逐项的信息，
       * 混进购物车一起结算必然错配。后端 createOrders 有同样的分类校验兜底。
       */
      addCart: function (p, qty) {
        if (!p) { return; }
        if (p.category && p.category !== 'goods') {
          this.toast('「' + p.name + '」需要预约，请打开详情选择日期后预约', 'warn');
          this.openProduct(p);
          return;
        }
        var n = Number(qty || 1);
        var hit = null;
        this.cart.forEach(function (c) { if (c.id === p.id) { hit = c; } });
        if (hit) { hit.qty += n; } else {
          this.cart.push({
            id: p.id, name: p.name, price: Number(p.price), cover: p.cover,
            unit: p.unit, qty: n, category: p.category || 'goods',
            stock: Number(p.stock) || 0,
            timeSlots: p.timeSlots || [], roomTypes: p.roomTypes || [],
          });
        }
        this.toast('已加入购物车');
      },
      changeQty: function (item, delta) {
        item.qty += delta;
        if (item.qty <= 0) {
          this.cart = this.cart.filter(function (c) { return c !== item; });
        }
      },
      /**
       * 结算清单：把购物车按「每个商品各自一份表单」铺开。
       *
       * 【为什么逐项】混合结算时农产要地址、研学要日期+场次+人数、民宿要入住/离店+房型。
       * 以前整抽屉只有一组「收货地址」，预约类根本没法填，或者三类共用一份值导致错配。
       * form 存在 cart 项上，改值即时生效（cart 本身在 data 里，Vue 会响应）。
       */
      checkoutLines: function () {
        var self = this;
        return (this.cart || []).map(function (c) {
          var isBooking = c.category && c.category !== 'goods';
          if (!c.form) {
            c.form = {
              address: self.address || '',
              bookDate: addDays(localDate(new Date()), 1),
              checkOutDate: addDays(localDate(new Date()), 2),
              roomType: (c.roomTypes && c.roomTypes[0]) || '标准间',
              bookingSlot: (c.timeSlots && c.timeSlots[0]) || '上午场',
              people: 2,
            };
          }
          return {
            key: c.id, productId: c.id, category: c.category || 'goods',
            isBooking: isBooking, name: c.name, cover: c.cover, price: c.price,
            qty: c.qty, unit: c.unit, stock: c.stock,
            timeSlots: c.timeSlots || [], roomTypes: c.roomTypes || [], form: c.form,
          };
        });
      },

      /** 逐项小计：民宿按晚数、预约类按人数、实物按数量 */
      lineSubtotal: function (L) {
        var f = L.form || {};
        if (!L.isBooking) { return Number(L.price) * Number(L.qty || 1); }
        if (L.category === 'homestay') {
          return Number(L.price) * Math.max(1, this.nightsBetween(f.bookDate, f.checkOutDate));
        }
        return Number(L.price) * Math.max(1, Number(f.people) || 1);
      },

      checkoutTotal: function () {
        var self = this;
        return (this.checkoutLines() || []).reduce(function (s, L) { return s + self.lineSubtotal(L); }, 0);
      },

      nightsBetween: function (a, b) {
        if (!a || !b) { return 1; }
        var t1 = new Date(String(a) + 'T00:00:00').getTime();
        var t2 = new Date(String(b) + 'T00:00:00').getTime();
        if (!isFinite(t1) || !isFinite(t2) || t2 <= t1) { return 1; }
        return Math.round((t2 - t1) / 86400000);
      },

      /** 逐项校验，返回第一条错误（带商品名，用户知道改哪一行） */
      validateCheckout: function () {
        var lines = this.checkoutLines();
        for (var i = 0; i < lines.length; i++) {
          var L = lines[i], f = L.form;
          if (!L.isBooking) {
            if (!String(f.address || '').trim()) { return '请填写「' + L.name + '」的收货地址'; }
            continue;
          }
          if (!f.bookDate) { return '请选择「' + L.name + '」的' + (L.category === 'homestay' ? '入住日期' : '预约日期'); }
          if (Number(f.people) < 1) { return '「' + L.name + '」的人数至少 1 人'; }
          if (L.category === 'homestay') {
            if (!f.checkOutDate) { return '请选择「' + L.name + '」的离店日期'; }
            if (String(f.checkOutDate) <= String(f.bookDate)) { return '「' + L.name + '」的离店日期必须晚于入住日期'; }
            if (!f.roomType) { return '请选择「' + L.name + '」的房型'; }
          } else if (!f.bookingSlot) {
            return '请选择「' + L.name + '」的场次 / 时段';
          }
        }
        return '';
      },

      checkout: function () {
        var self = this;
        if (!this.user) { this.toast('请先登录再下单', 'warn'); return; }
        if (!this.cart.length) { return; }
        var err = this.validateCheckout();
        if (err) { this.toast(err, 'warn'); return; }

        // 逐项提交：每件商品带自己那份参数，顶层不再传一份值给所有商品
        var payload = {
          items: this.checkoutLines().map(function (L) {
            var f = L.form || {};
            var one = { productId: L.productId, qty: L.isBooking ? Math.max(1, Number(f.people) || 1) : L.qty };
            if (!L.isBooking) {
              one.address = String(f.address || '').trim();
            } else {
              one.bookDate = f.bookDate;
              one.people = Math.max(1, Number(f.people) || 1);
              if (L.category === 'homestay') {
                one.checkOutDate = f.checkOutDate;
                one.roomType = f.roomType;
              } else {
                one.bookingSlot = f.bookingSlot;
              }
            }
            return one;
          }),
          remark: this.remark
        };
        this.submitting = true;
        api.post('/api/shop/orders', payload).then(function (res) {
          self.submitting = false;
          if (!res.ok) { return; }
          var failed = {};
          (res.warnings || []).forEach(function (w) {
            (self.cart || []).forEach(function (c) {
              if (w.indexOf(c.name) >= 0) { failed[c.id] = true; }
            });
          });
          self.cart = self.cart.filter(function (c) { return failed[c.id]; });
          if (res.warnings && res.warnings.length) {
            self.toast('部分商品未下单：' + res.warnings[0], 'warn');
          } else {
            self.toast(res.message || '下单成功');
          }
          if (!self.cart.length) { self.cartOpen = false; }
          self.loadOrders();
          self.loadProducts();
          self.go('orders');
        });
      },

      /* ---------------------------- 订单详情 / 物流 / 拒绝协商 ---------------------------- */
      orderStatusText: function (o) {
        if (!o) { return ''; }
        return o.statusText || ORDER_STATUS_TEXT[o.status] || o.status || '';
      },
      logRoleText: function (role) {
        return REPORT_ROLE_TEXT[role] || '系统';
      },
      /** 物流路线上四个站点的水平位置（8%–92%，给两端图标留空间） */
      routeStopLeft: function (i) {
        var nodes = (this.orderLogistics && this.orderLogistics.nodes) || [];
        var n = nodes.length;
        if (n <= 1) { return '50%'; }
        return (8 + (Number(i) || 0) / (n - 1) * 84) + '%';
      },
      openOrder: function (o) {
        if (!o || !o.id) { return; }
        this.decisionReason = '';
        this.orderDetail = o;
        this.orderLogs = o.logs || [];
        this.orderLogistics = o.logistics || null;
        this.loadOrderDetail(o.id, false);
      },
      loadOrderDetail: function (id, keepDecision) {
        var self = this;
        this.orderDetailLoading = true;
        api.get('/api/shop/orders/' + id, null, { silent: true }).then(function (res) {
          self.orderDetailLoading = false;
          if (!res.ok || !res.order) { return; }
          self.orderDetail = res.order;
          self.orderLogs = res.order.logs || [];
          self.orderLogistics = res.order.logistics || null;
          if (!keepDecision) { self.decisionReason = ''; }
        });
      },
      refreshOrderDetail: function () {
        var o = this.orderDetail;
        if (o && o.id) { this.loadOrderDetail(o.id, true); }
      },
      closeOrderDetail: function () {
        this.orderDetail = null;
        this.orderLogs = [];
        this.orderLogistics = null;
        this.decisionReason = '';
      },
      openOrderById: function (id) {
        var self = this;
        if (!id) { return; }
        var hit = null;
        (this.orders || []).forEach(function (o) { if (o.id === id) { hit = o; } });
        if (hit) { this.openOrder(hit); return; }
        api.get('/api/shop/orders/' + id, null, { silent: true }).then(function (res) {
          if (res.ok && res.order) { self.openOrder(res.order); }
          else { self.toast(res.error || '订单不存在', 'warn'); }
        });
      },
      /** 列表行的取消按钮（保留原有入口，仍只对 pending/confirmed 生效） */
      cancelOrder: function (o) {
        var self = this;
        if (!window.confirm('确定取消「' + o.productName + '」这笔订单吗？取消后库存会回滚。')) { return; }
        api.post('/api/shop/orders/' + o.id + '/cancel', { reason: '买家主动取消' }).then(function (res) {
          if (!res.ok) { return; }
          self.toast(res.message || '已取消');
          self.loadOrders();
          self.loadProducts();
          if (self.orderDetail && self.orderDetail.id === o.id) { self.refreshOrderDetail(); }
        });
      },
      cancelOrderDetail: function () {
        var self = this;
        var o = this.orderDetail;
        if (!o || this.cancelling) { return; }
        if (!window.confirm('确定取消这笔订单吗？取消后库存会回滚。')) { return; }
        this.cancelling = true;
        api.post('/api/shop/orders/' + o.id + '/cancel', { reason: '买家主动取消' }).then(function (res) {
          self.cancelling = false;
          if (!res.ok) { return; }
          self.toast(res.message || '订单已取消');
          self.loadOrders();
          self.loadProducts();
          self.refreshOrderDetail();
        });
      },
      /**
       * 对商家拒绝做决定：
       *   同意 → 关闭订单（后端回滚库存）；
       *   不同意 → 进入协商，订单保留，意见写进 orderLogs。
       * 「不同意」的意见按任务约定为选填，未填时给一句默认意见，避免商家看到空白协商。
       */
      /**
       * 买家确认收货 / 确认完成 —— 订单完成与货款结算的唯一入口。
       * 完成后后端会写结算流水并把金额累加到商家「已结算」，这里刷新详情即可看到结算信息。
       */
      receiveOrder: function () {
        var self = this;
        var o = this.orderDetail;
        if (!o || this.receiving) { return; }
        var tip = o.status === 'shipped' ? '确认已经收到货物？' : '确认这次体验/入住已完成？';
        if (!window.confirm(tip + ' 确认后订单完成，货款将结算给商家。')) { return; }
        this.receiving = true;
        api.post('/api/shop/orders/' + o.id + '/receive', {}).then(function (res) {
          self.receiving = false;
          if (!res.ok) { return; }
          self.toast(res.message || '已确认，订单完成');
          self.loadOrders();
          self.refreshOrderDetail();
        });
      },

      buyerDecision: function (agree) {
        var self = this;
        var o = this.orderDetail;
        if (!o || this.deciding) { return; }
        var reason = String(this.decisionReason || '').trim();
        if (!agree && !reason) {
          reason = '希望商家再考虑一下，我愿意继续协商。';
        }
        var body = { agree: !!agree };
        if (reason) { body.reason = reason; }
        this.deciding = true;
        api.post('/api/shop/orders/' + o.id + '/buyer-decision', body).then(function (res) {
          self.deciding = false;
          if (!res.ok) { return; }
          self.toast(res.message || (agree ? '订单已关闭' : '已进入协商'));
          self.decisionReason = '';
          self.loadOrders();
          self.loadProducts();
          self.refreshOrderDetail();
        });
      },

      /* ---------------------------- 个人资料 ---------------------------- */

      /** 头像更换入口（现在只在个人中心提供，顶部悬浮窗不再放这个动作） */
      pickAvatar: function () {
        if (this.$refs.pcAvatar) { this.$refs.pcAvatar.click(); }
      },

      onAvatarPick: function (e) {
        var self = this;
        var file = (e.target.files || [])[0];
        e.target.value = '';
        if (!file) { return; }
        window.ZQProfile.compress(file, function (dataUrl) {
          if (!dataUrl) { self.toast('图片读取失败，换一张试试', 'warn'); return; }
          window.ZQProfile.upload(dataUrl).then(function (res) {
            if (!res.ok) { return; }
            self.me = Object.assign({}, self.me, {
              profile: Object.assign({}, self.me.profile, { avatar: dataUrl })
            });
            self.toast('头像已更新');
          });
        });
      },

      openPwd: function () {
        this.pwdForm = { old: '', new: '', confirm: '' };
        this.pwdVisible = true;
      },

      savePwd: function () {
        var self = this;
        var f = this.pwdForm;
        if (!f.old) { return this.toast('请填写原密码', 'warn'); }
        if (!f.new || f.new.length < 6) { return this.toast('新密码至少 6 位', 'warn'); }
        if (f.new !== f.confirm) { return this.toast('两次输入的新密码不一致', 'warn'); }
        this.pwdSaving = true;
        api.post('/api/auth/password', { oldPassword: f.old, newPassword: f.new }).then(function (res) {
          self.pwdSaving = false;
          if (!res.ok) { return; }
          self.pwdVisible = false;
          self.toast(res.message || '密码已修改');
        });
      },

      /* ---------------------------- 商家主页 ---------------------------- */
      /** 把不同来源的商家信息（商品里的 merchant / 订单里的 merchant / 会话 thread）统一成一份 */
      normalizeMerchant: function (m) {
        if (!m) { return null; }
        if (typeof m === 'string') { return { id: m, name: '商家', avatar: '', type: '', intro: '', online: false }; }
        var src = m.merchant || m;
        var id = src.id || src.merchantId || m.merchantId;
        if (!id) { return null; }
        return {
          id: id,
          name: src.name || src.short || src.fullName || m.merchantName || m.name || ('商家 ' + id),
          avatar: src.avatar || m.merchantAvatar || m.avatar || '',
          type: src.type || '',
          intro: src.intro || '',
          phone: src.phone || m.merchantPhone || '',
          online: !!src.online
        };
      },
      openMerchant: function (merchantOrId) {
        var self = this;
        var id = (merchantOrId && typeof merchantOrId === 'object')
          ? (merchantOrId.id || merchantOrId.merchantId) : merchantOrId;
        if (!id) { this.toast('商家信息不存在', 'warn'); return; }
        if (this.view !== 'merchantHome') { this.merchantBackView = this.view; }
        this.merchantHome = null;
        this.merchantLoading = true;
        this.go('merchantHome');
        api.get('/api/shop/merchants/' + id, null, { silent: true }).then(function (res) {
          self.merchantLoading = false;
          if (res.ok && res.merchant) {
            self.merchantHome = { merchant: res.merchant, products: res.products || [] };
          } else {
            self.toast(res.error || '商家不存在或暂不可访问', 'warn');
          }
        });
      },
      threadAvatar: function (t) {
        return window.ZQProfile.src({ avatar: (t && t.merchantAvatar) || '' }, 'merchant');
      },

      /* ---------------------------- 主题 ---------------------------- */
      /**
       * 切换主题。真正的样式应用在 assets/js/theme.js 里（覆盖设计令牌），
       * 这里只负责落库 + 同步按钮选中态，避免各端各写一套。
       */
      setTheme: function (mode) {
        if (!window.ZQTheme) { return; }
        this.themeMode = window.ZQTheme.set(mode);
      },

      /* ---------------------------- 聊天 ---------------------------- */
      buyerId: function () {
        return (this.me && (this.me.userId || (this.me.profile && this.me.profile.id))) || '';
      },
      openChat: function (merchant) {
        var m = this.normalizeMerchant(merchant);
        if (!this.user) { this.toast('请先登录后再联系商家', 'warn'); this.go('mine'); return; }
        if (!m || !m.id) { this.toast('商家信息不存在', 'warn'); return; }

        // 切到另一个商家时必须先把上一个会话的状态清干净：不清会短暂显示「上一位商家」的
        // 消息与在线状态（点会话列表时尤其明显），看起来像串台。
        var switching = !this.chatMerchant || this.chatMerchant.id !== m.id;
        this.stopChatPoll();
        if (switching) {
          this.chatMessages = [];
          this.chatText = '';
          this.chatPeerTyping = false;
          this.chatProducts = [];
        }
        this.chatSendSeq++;                 // 作废上一个会话尚未返回的请求
        this.chatMerchant = m;
        this.chatPeerOnline = !!m.online;
        this.chatAttachOpen = false;
        this.chatPanelTab = 'product';
        this.view = 'chat';
        this.resetChatInput();
        window.scrollTo({ top: 0 });

        this.loadChatProducts(m.id);
        this.loadOrders();
        this.loadChatPeer(m);
        this.loadChatMessages(true);
        this.startChatPoll();
      },
      loadChatProducts: function (merchantId) {
        var self = this;
        var seq = this.chatSendSeq;
        api.get('/api/shop/merchants/' + merchantId, null, { silent: true }).then(function (res) {
          if (!res.ok || seq !== self.chatSendSeq) { return; }
          self.chatProducts = res.products || [];
          if (res.merchant) {
            var nm = self.normalizeMerchant(res.merchant);
            if (nm) { self.chatMerchant = Object.assign({}, self.chatMerchant, { name: nm.name, avatar: nm.avatar, type: nm.type }); }
          }
        });
      },
      loadChatPeer: function (m) {
        var self = this;
        var seq = this.chatSendSeq;
        api.get('/api/chat/peer', { merchantId: m.id }, { silent: true }).then(function (res) {
          if (!res.ok || seq !== self.chatSendSeq) { return; }
          if (typeof res.online === 'boolean') { self.chatPeerOnline = res.online; }
          if (res.merchant) {
            var nm = self.normalizeMerchant(res.merchant);
            if (nm) { self.chatMerchant = Object.assign({}, self.chatMerchant, { name: nm.name, avatar: nm.avatar, type: nm.type }); }
          }
        });
      },
      loadChatMessages: function (initial) {
        var self = this;
        var m = this.chatMerchant;
        if (!m || !this.user) { return; }
        // 记录发起时的会话，回来时如果已经切了商家就丢弃这批数据
        var seq = this.chatSendSeq;
        var box = this.$refs.chatBody;
        // 用户正在往上翻历史时不打断：只有原本就在底部才自动滚到底
        var atBottom = !box || (box.scrollHeight - box.scrollTop - box.clientHeight < 80);
        var params = { merchantId: m.id };
        var bid = this.buyerId();
        if (bid) { params.buyerId = bid; }
        api.get('/api/chat/messages', params, { silent: true }).then(function (res) {
          if (!res || !res.ok) { return; }
          if (seq !== self.chatSendSeq) { return; }   // 已切到别的商家，丢弃过期响应
          self.chatMessages = (res.messages || res.list || []).filter(self.isRenderable);
          // 后端字段：peerOnline / peerTyping；兼容早期写法
          if (typeof res.peerOnline === 'boolean') { self.chatPeerOnline = res.peerOnline; }
          else if (typeof res.online === 'boolean') { self.chatPeerOnline = res.online; }
          if (typeof res.peerTyping === 'boolean') { self.chatPeerTyping = res.peerTyping; }
          else if (typeof res.typing === 'boolean') { self.chatPeerTyping = res.typing; }
          if (res.merchant) {
            var nm = self.normalizeMerchant(res.merchant);
            if (nm) { self.chatMerchant = Object.assign({}, self.chatMerchant, { name: nm.name, avatar: nm.avatar, type: nm.type }); }
          }
          if (initial || atBottom) {
            self.$nextTick(function () { self.scrollChatToBottom(); });
          }
        });
      },
      scrollChatToBottom: function () {
        var box = this.$refs.chatBody;
        if (box) { box.scrollTop = box.scrollHeight; }
      },
      startChatPoll: function () {
        var self = this;
        this.stopChatPoll();
        this.chatPollTimer = setInterval(function () {
          if (self.view === 'chat' && self.chatMerchant) { self.loadChatMessages(false); }
        }, 3000);
      },
      stopChatPoll: function () {
        if (this.chatPollTimer) {
          clearInterval(this.chatPollTimer);
          this.chatPollTimer = null;
        }
      },
      /** 输入中状态：每 2.5 秒最多上报一次，避免每个字符都打接口 */
      onChatInput: function () {
        this.autoGrowChatInput();
        var m = this.chatMerchant;
        if (!m) { return; }
        var now = Date.now();
        if (now - this.chatTypingAt < 2500) { return; }
        this.chatTypingAt = now;
        var body = { merchantId: m.id, role: 'buyer' };
        var bid = this.buyerId();
        if (bid) { body.buyerId = bid; }
        api.post('/api/chat/typing', body, { silent: true });
      },

      /**
       * 输入框高度自适应（1–5 行）。
       *
       * 【为什么必须做】旧实现 textarea 固定 rows=1、CSS 也不放高度，
       * 用户敲第二行开始文字就被压进 1 行里靠内部滚动，看起来像「输入框里留了一条空白」；
       * 发送后也不会回落，占着高度让界面显得脏。
       */
      autoGrowChatInput: function () {
        var self = this;
        this.$nextTick(function () {
          var el = self.$refs.chatInput;
          if (!el) { return; }
          el.style.height = 'auto';
          // 单行基准 44px，最多 5 行（约 120px），超出后内部滚动
          var next = Math.min(el.scrollHeight, 120);
          el.style.height = Math.max(44, next) + 'px';
          el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
        });
      },

      /** 发送成功后把输入框复位成单行（内容已清空，高度不能留在多行） */
      resetChatInput: function () {
        var self = this;
        this.$nextTick(function () {
          var el = self.$refs.chatInput;
          if (!el) { return; }
          el.style.height = '44px';
          el.style.overflowY = 'hidden';
          el.scrollTop = 0;
        });
      },
      sendChatText: function () {
        if (this.chatComposing) { return; }
        var text = String(this.chatText || '').trim();
        if (!text || this.chatSending || !this.chatMerchant) { return; }
        var self = this;
        this.sendChatPayload({ type: 'text', text: text }, function (ok) {
          if (ok) {
            self.chatText = '';
            self.chatTypingAt = 0;
            self.resetChatInput();
          }
        });
      },
      sendChatPayload: function (extra, done) {
        var self = this;
        var m = this.chatMerchant;
        if (!m || this.chatSending) { return; }
        var seq = this.chatSendSeq;
        this.chatSending = true;
        var body = Object.assign({ merchantId: m.id }, extra || {});
        var bid = this.buyerId();
        if (bid) { body.buyerId = bid; }
        api.post('/api/chat/messages', body, { silent: true }).then(function (res) {
          if (seq !== self.chatSendSeq) { self.chatSending = false; return; }
          self.chatSending = false;
          if (!res.ok) {
            self.toast(res.error || '消息发送失败', 'error');
            if (typeof done === 'function') { done(false); }
            return;
          }
          if (res.message && self.isRenderable(res.message)) {
            self.chatMessages = self.chatMessages.concat([res.message]);
          } else if (res.message) {
            // 后端返回了但内容不可渲染（理论不会发生，防御性跳过）
            self.loadChatMessages(false);
          } else {
            self.loadChatMessages(false);
          }
          self.$nextTick(function () { self.scrollChatToBottom(); });
          if (typeof done === 'function') { done(true); }
        });
      },
      pickChatImage: function () {
        this.chatAttachOpen = false;
        if (this.$refs.chatImageInput) { this.$refs.chatImageInput.click(); }
      },
      onChatImagePick: function (e) {
        var self = this;
        var file = (e.target.files || [])[0];
        e.target.value = '';
        if (!file) { return; }
        this.compressImage(file, function (dataUrl) {
          if (!dataUrl) { self.toast('图片读取失败，换一张试试', 'warn'); return; }
          self.sendChatImage(dataUrl);
        });
      },
      sendChatImage: function (dataUrl) {
        if (!dataUrl) { return; }
        this.sendChatPayload({ type: 'image', media: dataUrl });
      },
      sendChatProduct: function (p) {
        if (!p) { return; }
        this.chatAttachOpen = false;
        this.sendChatPayload({ type: 'product', productId: p.id, text: p.name });
      },
      sendChatOrder: function (o) {
        if (!o) { return; }
        this.chatAttachOpen = false;
        this.sendChatPayload({ type: 'order', orderId: o.id, text: o.productName });
      },
      /**
       * 一条消息是否值得渲染。
       *
       * 【为什么要有】后端已挡「纯空白文本」，但历史脏数据 / type 未知的消息
       * 会走到模板的 v-else 分支渲染 m.text —— text 为 null 时就得到一个只有 padding 的空气泡，
       * 页面看起来像「发了条空白消息」。这里统一在进入列表前过滤掉。
       */
      isRenderable: function (m) {
        if (!m || typeof m !== 'object') { return false; }
        var type = m.type || 'text';
        if (type === 'image') { return !!(m.media || m.text); }
        if (type === 'product') { return !!(m.productId || (m.product && m.product.id) || String(m.text || '').trim()); }
        if (type === 'order') { return !!(m.orderId || (m.order && m.order.id) || String(m.text || '').trim()); }
        return !!String(m.text == null ? '' : m.text).trim();
      },

      msgSide: function (m) {
        return (m && m.fromRole === 'buyer') ? 'me' : 'peer';
      },
      msgAvatar: function (m) {
        if (m && m.fromRole === 'buyer') { return this.avatarSrc; }
        return this.merchantAvatar(this.chatMerchant);
      },
      openChatMessageProduct: function (m) {
        if (!m || !m.productId) { return; }
        var hit = null;
        var pool = (this.products || []).concat(this.chatProducts || []);
        pool.forEach(function (p) { if (p && p.id === m.productId) { hit = p; } });
        if (hit) { this.openProduct(hit); }
        else { this.toast('该商品已下架或不存在', 'warn'); }
      },
      openChatMessageOrder: function (m) {
        if (!m) { return; }
        this.openOrderById(m.orderId || (m.order && m.order.id));
      },
      loadChatThreads: function () {
        var self = this;
        if (!this.user) { return; }
        this.chatThreadsLoading = true;
        api.get('/api/chat/threads', null, { silent: true }).then(function (res) {
          self.chatThreadsLoading = false;
          if (!res.ok) { return; }
          self.chatThreads = (res.threads || res.list || []).map(function (t) {
            return {
              merchantId: t.merchantId || t.id,
              merchantName: t.merchantName || t.name || '商家',
              merchantAvatar: t.merchantAvatar || t.avatar || '',
              lastText: t.lastText || '',
              lastAt: t.lastAt || '',
              online: !!t.online,
              unread: Number(t.unread || 0)
            };
          });
        });
      },
      reportFromChat: function () {
        this.openReports(this.chatMerchant);
      },

      /* ---------------------------- 图片压缩 / 拍摄 ---------------------------- */
      /**
       * 前端压缩：最长边 900px、dataURL 不超过 400000 字符（后端上限，约 300KB 图片）。
       * 不引入任何图片库：canvas 重绘 + 质量递减，必要时再缩边长，直到满足后端限制。
       * 聊天图片、举报凭证、拍摄照片都走这里，保证 dataURL 能直接存库。
       */
      compressImage: function (file, done) {
        var self = this;
        if (!file || (file.type && file.type.indexOf('image/') !== 0)) { return done(null); }
        var reader = new FileReader();
        reader.onerror = function () { done(null); };
        reader.onload = function (e) { self.compressDataUrl(e.target.result, done); };
        reader.readAsDataURL(file);
      },
      compressDataUrl: function (dataUrl, done) {
        var MAX_CHARS = 400000;
        var MAX_EDGE = 900;
        var img = new Image();
        img.onerror = function () { done(null); };
        img.onload = function () {
          var edge = MAX_EDGE;
          var out = '';
          while (true) {
            var scale = Math.min(1, edge / Math.max(img.width, img.height));
            var cw = Math.max(1, Math.round(img.width * scale));
            var ch = Math.max(1, Math.round(img.height * scale));
            var canvas = document.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            var ctx = canvas.getContext('2d');
            // 先铺白底：PNG 透明背景转 JPEG 会变黑
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, cw, ch);
            ctx.drawImage(img, 0, 0, cw, ch);
            var q = 0.82;
            out = canvas.toDataURL('image/jpeg', q);
            while (out.length > MAX_CHARS && q > 0.4) {
              q = Math.round((q - 0.1) * 10) / 10;
              out = canvas.toDataURL('image/jpeg', q);
            }
            if (out.length <= MAX_CHARS || edge <= 480) { break; }
            edge = Math.round(edge * 0.8);
          }
          done(out);
        };
        img.src = dataUrl;
      },
      stopCameraStream: function () {
        if (this.cameraStream) {
          try {
            this.cameraStream.getTracks().forEach(function (t) { t.stop(); });
          } catch (e) { /* 忽略 */ }
          this.cameraStream = null;
        }
        var video = this.$refs.cameraVideo;
        if (video) { try { video.srcObject = null; } catch (e) { /* 忽略 */ } }
      },
      openCamera: function () {
        var self = this;
        var md = navigator.mediaDevices;
        if (!md || !md.getUserMedia) {
          this.toast('当前浏览器不支持拍摄，已改为从相册选择', 'warn');
          if (this.$refs.chatCameraInput) { this.$refs.chatCameraInput.click(); }
          return;
        }
        this.cameraOpen = true;
        this.cameraShot = '';
        this.cameraError = '';
        this.$nextTick(function () {
          md.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (stream) {
            self.cameraStream = stream;
            var video = self.$refs.cameraVideo;
            if (video) {
              video.srcObject = stream;
              if (video.play) { video.play(); }
            }
          }).catch(function (err) {
            // 摄像头被拒/无设备：关闭弹窗并回退到手机同款 file capture
            self.cameraError = '无法打开摄像头：' + ((err && err.message) || '权限被拒绝');
            self.cameraOpen = false;
            self.stopCameraStream();
            self.toast('摄像头不可用，已改为从相册选择/拍摄', 'warn');
            if (self.$refs.chatCameraInput) { self.$refs.chatCameraInput.click(); }
          });
        });
      },
      shootPhoto: function () {
        var self = this;
        var video = this.$refs.cameraVideo;
        if (!video || !video.videoWidth) {
          this.toast('摄像头还没准备好，请稍后再试', 'warn');
          return;
        }
        var scale = Math.min(1, 900 / Math.max(video.videoWidth, video.videoHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var raw = canvas.toDataURL('image/jpeg', 0.82);
        this.stopCameraStream();
        this.compressDataUrl(raw, function (out) {
          self.cameraShot = out || raw;
        });
      },
      retakePhoto: function () {
        this.cameraShot = '';
        this.openCamera();
      },
      sendCameraPhoto: function () {
        if (!this.cameraShot) { return; }
        this.sendChatImage(this.cameraShot);
        this.closeCamera();
      },
      closeCamera: function () {
        this.stopCameraStream();
        this.cameraOpen = false;
        this.cameraShot = '';
        this.cameraError = '';
      },

      /* ---------------------------- 举报中心 ---------------------------- */
      openReports: function (merchant) {
        var m = merchant ? this.normalizeMerchant(merchant) : null;
        this.reportPresetMerchant = m;
        this.reportTab = 'form';
        this.resetReportForm(m);
        this.go('reports');
      },
      resetReportForm: function (preset) {
        this.reportForm = {
          merchantId: preset ? preset.id : '',
          category: '',
          reason: '',
          content: '',
          evidence: []
        };
      },
      loadReportCategories: function () {
        var self = this;
        api.get('/api/reports/categories', null, { silent: true }).then(function (res) {
          if (res && res.ok) {
            var list = self.normalizeReportCategories(res);
            if (list.length) { self.reportCategories = list; return; }
          }
          if (!self.reportCategories.length) { self.reportCategories = DEFAULT_REPORT_CATEGORIES; }
        });
      },
      /** 兼容后端 { categories:[{key,text,reasons}] }，以及对象字典形态，避免联调期页面空白 */
      normalizeReportCategories: function (res) {
        var raw = res && (res.categories || res.list || res.items);
        if (!raw && Array.isArray(res)) { raw = res; }
        var out = [];
        function push(key, name, reasons) {
          if (!key) { return; }
          var list = (reasons || []).map(function (r) {
            return typeof r === 'string' ? r : (r.name || r.label || r.reason || r.text || r.title || '');
          }).filter(Boolean);
          out.push({ key: String(key), name: name || String(key), reasons: list });
        }
        if (Array.isArray(raw)) {
          raw.forEach(function (c) {
            if (typeof c === 'string') { push(c, c, []); return; }
            push(c.key || c.category || c.id || c.value || c.code,
              c.name || c.label || c.title || c.text || c.categoryText,
              c.reasons || c.list || c.children || c.causes || c.reasonList);
          });
        } else if (raw && typeof raw === 'object') {
          Object.keys(raw).forEach(function (k) {
            var v = raw[k];
            if (v && typeof v === 'object') {
              push(k, v.name || v.label || v.text || k, v.reasons || v.list);
            } else {
              push(k, String(v), []);
            }
          });
        }
        return out;
      },
      switchReportTab: function (tab) {
        this.reportTab = tab;
        if (tab === 'mine') { this.loadReportMine(); }
        else { this.loadReportCategories(); }
      },
      loadReportMine: function () {
        var self = this;
        if (!this.user) { return; }
        this.reportLoading = true;
        api.get('/api/reports/mine', null, { silent: true }).then(function (res) {
          self.reportLoading = false;
          if (!res.ok) { return; }
          self.reportList = res.reports || res.list || [];
          // 后端同时下发分类字典，顺手刷新，避免两处不一致
          var list = self.normalizeReportCategories(res);
          if (list.length) { self.reportCategories = list; }
        });
      },
      pickReportCategory: function (c) {
        if (!c) { return; }
        this.reportForm.category = c.key;
        this.reportForm.reason = (c.reasons && c.reasons[0]) || '';
      },
      reportStatusText: function (r) {
        if (!r) { return ''; }
        return r.statusText || REPORT_STATUS_TEXT[r.status] || r.status || '';
      },
      reportCategoryText: function (key) {
        var hit = null;
        (this.reportCategories || []).forEach(function (c) { if (c.key === key) { hit = c; } });
        if (hit) { return hit.name; }
        var map = {
          service: '商家服务态度问题', product: '商品问题', logistics: '发货物流问题',
          money: '钱款纠纷', fraud: '商家欺诈'
        };
        return map[key] || key || '其他问题';
      },
      /** 我的举报进度：由状态与时间字段推导，旧数据没有这些字段也不会错位 */
      reportSteps: function (r) {
        if (!r) { return []; }
        var handled = r.status === 'resolved' || r.status === 'appealed' || r.status === 'appeal_resolved';
        var steps = [
          { text: '提交举报', done: true, at: r.createdAt },
          { text: '平台受理', done: !!r.handledAt, at: r.handledAt || '' },
          { text: '处理并通知', done: !!r.result || !!r.notice, at: r.handledAt || '' }
        ];
        if (r.appealAt) {
          steps.push({ text: '商家上诉', done: true, at: r.appealAt });
          steps.push({ text: '上诉审核', done: r.status === 'appeal_resolved', at: r.appealHandledAt || '' });
        }
        // handled 为 true 但 handledAt 缺失时，至少把「平台受理」点亮，避免进度看着没动
        if (handled && !r.handledAt) { steps[1].done = true; }
        return steps;
      },
      onReportEvidencePick: function (e) {
        var self = this;
        var files = Array.prototype.slice.call(e.target.files || []);
        e.target.value = '';
        if (!files.length) { return; }
        var remain = 6 - this.reportForm.evidence.length;
        if (remain <= 0) { this.toast('最多上传 6 张凭证', 'warn'); return; }
        if (files.length > remain) {
          files = files.slice(0, remain);
          this.toast('最多上传 6 张凭证，已选取前 ' + remain + ' 张', 'warn');
        }
        var results = [];
        var left = files.length;
        files.forEach(function (file, idx) {
          self.compressImage(file, function (dataUrl) {
            results[idx] = dataUrl;
            left--;
            if (left > 0) { return; }
            var ok = results.filter(Boolean);
            if (ok.length < files.length) { self.toast('部分图片读取失败，已跳过', 'warn'); }
            self.reportForm.evidence = self.reportForm.evidence.concat(ok);
          });
        });
      },
      removeEvidence: function (i) {
        this.reportForm.evidence.splice(i, 1);
      },
      submitReport: function () {
        var self = this;
        var f = this.reportForm;
        if (this.reportSubmitting) { return; }
        if (!this.user) { this.toast('请先登录再举报', 'warn'); return; }
        if (!f.merchantId) { this.toast('请选择要举报的商家', 'warn'); return; }
        if (!f.category) { this.toast('请选择违规分类', 'warn'); return; }
        if (!String(f.content || '').trim()) { this.toast('请填写举报内容', 'warn'); return; }
        this.reportSubmitting = true;
        api.post('/api/reports', {
          merchantId: f.merchantId,
          category: f.category,
          reason: f.reason || '',
          content: String(f.content).trim(),
          evidence: f.evidence.slice()
        }).then(function (res) {
          self.reportSubmitting = false;
          if (!res.ok) { return; }
          self.toast(res.message || '举报已提交，平台会尽快处理');
          self.reportPresetMerchant = null;
          self.resetReportForm(null);
          self.reportTab = 'mine';
          self.loadReportMine();
        });
      },

      /* ---------------------------- AI ---------------------------- */
      askAi: function () {
        var self = this;
        if (this.ai.loading) { return; }
        var mode = this.ai.mode;
        var q = (this.ai.question || '').trim();
        // 问答模式必须有具体问题；排行程模式允许空着，直接按天数/人数/偏好生成
        if (mode !== 'plan' && !q) { this.toast('先输入一个问题', 'warn'); return; }
        var days = Math.max(1, Number(this.ai.planDays) || 2);
        var people = Math.max(1, Math.min(10, Number(this.ai.planPeople) || 2));
        var pref = this.ai.planPref || '亲子';
        if (mode === 'plan' && !q) {
          q = '帮我安排 ' + days + ' 天行程，' + people + ' 人出行，偏好' + pref;
          this.ai.question = q;
        }
        this.stopTyping();
        this.ai.loading = true;
        this.ai.answer = '';
        this.ai.shown = '';
        this.ai.streaming = false;
        this.ai.sources = [];
        var url = mode === 'plan' ? '/api/ai/plan' : '/api/ai/ask';
        var body = mode === 'plan'
          ? { days: days, people: people, preferences: [pref], question: q }
          : { question: q };
        api.post(url, body).then(function (res) {
          self.ai.loading = false;
          if (!res || !res.ok) {
            var err = (res && res.error) || 'AI 服务暂时不可用，请稍后再试。';
            self.ai.answer = err;
            self.typeOut(err);
            return;
          }
          var text = self.composeAnswer(res, mode);
          self.ai.answer = text;
          self.typeOut(text);
        });
      },

      /** 把后端返回拼成一段可直接逐字念出来的纯文本 */
      composeAnswer: function (res, mode) {
        if (mode !== 'plan') {
          return res.answer || '（没有返回内容）';
        }
        var plan = res.plan || res;
        var lines = [];
        var summary = res.summary || plan.summary || '';
        if (summary) { lines.push(summary, ''); }
        (plan.days || []).forEach(function (d) {
          lines.push('第 ' + d.day + ' 天 · ' + (d.date || ''));
          (d.items || []).forEach(function (it) {
            lines.push('  ' + (it.time ? it.time + '  ' : '') + it.title);
          });
          lines.push('');
        });
        return lines.join('\n').trim();
      },

      /* 与手机端同一套打字节奏：约 90 帧放完，26ms 一帧，长回答也不会等太久 */
      typeOut: function (text) {
        var self = this;
        this.stopTyping();
        this.ai.shown = '';
        this.ai.streaming = true;
        var step = Math.max(1, Math.ceil(text.length / 90));
        var cursor = 0;
        this._aiTimer = setInterval(function () {
          cursor = Math.min(text.length, cursor + step);
          self.ai.shown = text.slice(0, cursor);
          if (cursor >= text.length) {
            self.stopTyping();
            self.ai.streaming = false;
          }
        }, 26);
      },

      stopTyping: function () {
        if (this._aiTimer) {
          clearInterval(this._aiTimer);
          this._aiTimer = null;
        }
        this.ai.streaming = false;
      },

      presetAsk: function (text) {
        this.ai.question = text;
        this.askAi();
      }
    }
  });
})();
