/* ============================================================================
   游客端（H5 / 手机浏览器）主逻辑
   —— Vue 2.7 + ZQ 请求封装，零构建，与 PC 管理后台、商户工作台保持同一套写法。

   页面组织方式：
     · 四个顶层页面（首页 / 打卡 / 商城 / 我的）用 view 切换，底部 Tab 栏常驻；
     · 其余子页面从顶层推入（viewStack 记录来源，点返回能回到正确的位置）。
   这样比引入 vue-router 更轻，也避免了 H5 部署在子路径时路由 base 配错的问题。

   语音讲解：用浏览器内置的 speechSynthesis，零依赖、零成本、断网可用。
   购物车：存在本机（按端 + 按账号隔离），下单时一次性提交给后端。
   ============================================================================ */
(function () {
  'use strict';

  var ZQ = window.ZQ;
  var api = ZQ.api;
  var fmt = ZQ.fmt;

  var TOP_VIEWS = ['home', 'spots', 'shop', 'mine'];
  var CART_KEY = 'zhanqi.' + ZQ.store.ns + '.cart';

  /* ============================ 本地小工具 ============================ */

  function readCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function writeCart(list) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(list)); } catch (e) { /* 隐私模式忽略 */ }
    return list;
  }

  function todayStr() {
    var d = new Date();
    var p = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function dayAfter(n) {
    var d = new Date();
    d.setDate(d.getDate() + (n || 0));
    var p = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  var CATEGORY_TEXT = {
    goods: '农产文创', study: '研学课程', homestay: '民宿住宿', experience: '农事体验',
  };
  var BOOKING_CATS = ['study', 'homestay', 'experience'];
  var STATUS_TEXT = {
    pending: '待确认', confirmed: '已确认', used: '已核销', cancelled: '已取消',
  };
  var STATUS_CLASS = {
    pending: 'tag-warn', confirmed: 'tag-info', used: 'tag-ok', cancelled: 'tag-muted',
  };

  /* ================================ 应用 ================================ */

  new Vue({
    el: '#app',

    data: function () {
      return {
        booted: false,

        /* 站点信息 */
        site: {},

        /* 登录 */
        user: ZQ.store.user,
        authTab: 'login',
        loginForm: { account: '', password: '' },
        regForm: { account: '', name: '', phone: '', password: '', confirm: '' },
        known: [],
        knownLoading: true,
        loading: false,

        /* 连接（仅单独部署到别的域名时才用得到） */
        baseUrlInput: '',
        testing: false,
        connResult: null,

        /* 导航 */
        view: 'home',
        viewStack: [],

        /* 点位 */
        spots: [],
        stamps: [],
        collected: 0,
        total: 8,
        allDone: false,
        loadingSpots: true,
        spotTab: 'spots',
        current: {},
        speaking: false,
        showScript: false,

        /* 商城 */
        products: [],
        goods: [],
        loadingProducts: true,
        keyword: '',
        category: '',
        cats: [
          { key: '', text: '全部' },
          { key: 'goods', text: '农产文创' },
          { key: 'study', text: '研学课程' },
          { key: 'homestay', text: '民宿住宿' },
          { key: 'experience', text: '农事体验' },
        ],

        /* 商品详情 */
        product: {},
        qty: 1,
        people: 2,
        bookDate: '',
        address: '',
        remark: '',

        /* 预约页 */
        bookingCat: 'study',
        bookingList: [],
        loadingBooking: true,
        bookingCats: [
          { key: 'study', text: '研学课程' },
          { key: 'homestay', text: '民宿住宿' },
          { key: 'experience', text: '农事体验' },
          { key: '', text: '全部' },
        ],

        /* 活动 */
        activities: [],

        /* 订单 */
        orders: [],
        loadingOrders: true,
        orderStatusFilter: '',
        statuses: [
          { key: '', text: '全部' },
          { key: 'pending', text: '待确认' },
          { key: 'confirmed', text: '已确认' },
          { key: 'used', text: '已核销' },
          { key: 'cancelled', text: '已取消' },
        ],
        checkoutMode: false,
        submitting: false,

        /* 购物车 */
        cart: [],
        cartOpen: false,

        /* AI */
        ai: {},
        messages: [],
        thinking: false,
        draft: '',
        suggests: [
          '唐昌布鞋为什么叫千层底',
          '战旗村有哪些农事体验可以预约',
          '林盘是什么意思',
          '从成都市区怎么到战旗村',
          '推荐适合带孩子去的点位',
          '今天股市怎么样',
        ],

        /* 行程规划 */
        planDays: 1,
        planPeople: 2,
        prefOptions: ['非遗', '手工', '农事', '亲子', '美食', '摄影', '历史', '休闲'],
        planPrefs: [],
        planResult: null,
        loadingPlan: false,

        /* 提示 */
        toasts: [],
        today: todayStr(),
      };
    },

    computed: {
      greeting: function () {
        var h = new Date().getHours();
        if (h < 6) { return '夜深了'; }
        if (h < 11) { return '早上好'; }
        if (h < 14) { return '中午好'; }
        if (h < 18) { return '下午好'; }
        return '晚上好';
      },

      progressText: function () {
        if (this.total > 0 && this.collected >= this.total) { return '已集齐全部印章，恭喜通关'; }
        if (this.collected === 0) { return '还没开始，去第一个点位打卡吧'; }
        return '再集 ' + (this.total - this.collected) + ' 枚即可通关';
      },

      percent: function () {
        return this.total > 0 ? Math.round((this.collected / this.total) * 100) : 0;
      },

      ringStyle: function () {
        var p = this.percent;
        return { background: 'conic-gradient(#fff 0% ' + p + '%, rgba(255,255,255,.22) ' + p + '% 100%)' };
      },

      entries: function () {
        return [
          { key: 'spots', text: '点位打卡', glyph: '印', view: 'spots', tab: true, bg: '#E6F2ED', color: '#146B57' },
          { key: 'booking', text: '研学民宿', glyph: '宿', view: 'booking', bg: '#EAF1F9', color: '#2F6BA8' },
          { key: 'ai', text: 'AI 助手', glyph: 'AI', view: 'ai', bg: '#FBEDE7', color: '#BE5230' },
          { key: 'plan', text: '行程规划', glyph: '程', view: 'plan', bg: '#FCF4E2', color: '#B07A18' },
          { key: 'acts', text: '活动日历', glyph: '日', view: 'activities', bg: '#F1EEE7', color: '#5C6B65' },
          { key: 'orders', text: '我的订单', glyph: '单', view: 'orders', bg: '#E8F4EE', color: '#2C7A57' },
        ];
      },

      menus: function () {
        return [
          { key: 'orders', text: '我的订单', desc: '查看订单状态与取消', glyph: '单', view: 'orders', bg: '#E6F2ED', color: '#146B57' },
          { key: 'wall', text: '我的印章墙', desc: '集齐 8 枚印章领纪念品', glyph: '印', view: 'spots', tab: true, bg: '#FBEDE7', color: '#BE5230' },
          { key: 'ai', text: 'AI 文旅助手', desc: '问村内的事，有知识库出处', glyph: 'AI', view: 'ai', bg: '#EAF1F9', color: '#2F6BA8' },
          { key: 'plan', text: 'AI 行程规划', desc: '按偏好编排 1-3 天路线', glyph: '程', view: 'plan', bg: '#FCF4E2', color: '#B07A18' },
          { key: 'acts', text: '村内活动日历', desc: '非遗节庆与农事体验', glyph: '日', view: 'activities', bg: '#F1EEE7', color: '#5C6B65' },
          { key: 'shop', text: '去逛商城', desc: '农产文创好物', glyph: '购', view: 'shop', tab: true, bg: '#E8F4EE', color: '#2C7A57' },
        ];
      },

      isTopView: function () {
        return TOP_VIEWS.indexOf(this.view) >= 0 && !!this.user;
      },

      cartCount: function () {
        return this.cart.reduce(function (s, it) { return s + (Number(it.qty) || 0); }, 0);
      },

      cartTotal: function () {
        return this.cart.reduce(function (s, it) { return s + Number(it.price) * Number(it.qty); }, 0);
      },

      cartHasBooking: function () {
        return this.cart.some(function (it) { return BOOKING_CATS.indexOf(it.category) >= 0; });
      },

      isBooking: function () {
        return BOOKING_CATS.indexOf(this.product.category) >= 0;
      },

      productTotal: function () {
        var base = Number(this.product.price) || 0;
        return this.isBooking ? base * this.people : base * this.qty;
      },

      orderCount: function () {
        return this.orders.length;
      },

      spent: function () {
        return this.orders
          .filter(function (o) { return o.status !== 'cancelled'; })
          .reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0);
      },
    },

    created: function () {
      var self = this;

      // 把错误提示接到页面的 Toast 上，统一三端的提示样式
      ZQ.notify.onToast = function (msg) { self.toast(msg); };
      ZQ.notify.onUnauthorized = function (msg) {
        self.user = null;
        self.view = 'home';
        self.viewStack = [];
        self.toast(msg || '登录已过期，请重新登录');
      };

      this.cart = readCart();
      this.loadServerInfo();
      this.loadKnown();
    },

    methods: {
      /* ---------------------------- 基础工具 ---------------------------- */

      money: function (v) { return fmt.money(v); },
      time: function (v) { return fmt.time(v); },
      date: function (v) { return fmt.date(v); },
      ago: function (v) { return fmt.ago(v); },

      first: function (name) { return String(name || '游').slice(0, 1); },

      /** 图片地址：H5 与后端同源，直接用后端给的相对路径即可 */
      asset: function (path) {
        var p = String(path || '').trim();
        if (!p) { return '/assets/img/hero.svg'; }
        if (/^(https?:)?\/\//i.test(p) || p.indexOf('data:') === 0) { return p; }
        return p.charAt(0) === '/' ? p : '/' + p;
      },

      cover: function (cover, category) {
        if (cover) { return this.asset(cover); }
        var fb = { goods: '/assets/img/craft.svg', study: '/assets/img/spot-study.svg',
                   homestay: '/assets/img/spot-bookhouse.svg', experience: '/assets/img/spot-rice.svg' };
        return this.asset(fb[category] || '/assets/img/hero.svg');
      },

      /**
       * 图片加载失败时换成兜底插画。
       *
       * 为什么需要：数据里的图片路径属于「历史数据」，可能指向已经删掉或改名的文件
       * （本项目真实出现过：早先建商品时默认封面写成了 craft.jpg，实际文件是 craft.svg）。
       * 指望人工发现破图并不现实，所以让前端自己兜住 ——
       * 任何一张图挂了都退化成一张默认插画，界面永远不会出现裂图。
       *
       * 必须打标记：否则兜底图本身也加载失败时会无限触发 error，把页面卡死。
       */
      imgFail: function (e) {
        var el = e && e.target;
        if (!el || !el.dataset) { return; }
        if (el.dataset.imgFallback === "1") { return; }
        el.dataset.imgFallback = "1";
        el.src = "/assets/img/hero.svg";
      },

      categoryName: function (c) { return CATEGORY_TEXT[c] || c || '其他'; },

      day: function (d) { return String(d || '').slice(8, 10) || '--'; },
      month: function (d) { return String(d || '').slice(5, 7) || '--'; },

      rangeText: function (a) {
        var s = String(a.date || '');
        var e = String(a.endDate || '');
        if (!e || e === s) { return s || '待定'; }
        return s + ' 至 ' + e;
      },

      isPast: function (a) { return String(a.endDate || a.date) < this.today; },
      isOngoing: function (a) {
        return String(a.date) <= this.today && this.today <= String(a.endDate || a.date) && !this.isPast(a);
      },

      statusText: function (s) { return STATUS_TEXT[s] || s || '未知'; },
      statusClass: function (s) { return STATUS_CLASS[s] || 'tag-muted'; },
      canCancel: function (o) { return o.status === 'pending' || o.status === 'confirmed'; },

      toast: function (msg) {
        var self = this;
        this.toasts.push(String(msg));
        setTimeout(function () { self.toasts.shift(); }, 2600);
      },

      /**
       * 打卡成功后给一次震动反馈，手机上更有「盖章」的实感。
       *
       * 必须先判断用户交互状态：浏览器规定 navigator.vibrate 只能在用户手势之后调用，
       * 否则会被拒绝并在控制台留下一条 error（"Blocked call to navigator.vibrate..."）。
       * 那条报错不影响功能，但会污染控制台，让人误以为页面出了故障。
       */
      buzz: function () {
        try {
          if (!navigator.vibrate) { return; }
          if (navigator.userActivation && navigator.userActivation.isActive === false) { return; }
          navigator.vibrate(28);
        } catch (e) { /* 部分浏览器没有这个 API，忽略 */ }
      },

      /* ---------------------------- 导航 ---------------------------- */

      go: function (view, isTop) {
        if (TOP_VIEWS.indexOf(view) >= 0) {
          // 切顶层 Tab：清空返回栈，避免返回时回到已切走的页面
          this.view = view;
          this.viewStack = [];
        } else {
          this.view = view;
          this.viewStack.push(view);
        }
        window.scrollTo(0, 0);
        this.onEnter(view);
      },

      goBack: function () {
        this.viewStack.pop();
        var prev = this.viewStack[this.viewStack.length - 1];
        // 返回栈空了就回到对应顶层页
        this.view = prev || (this.user ? 'home' : 'home');
        window.scrollTo(0, 0);
      },

      /** 进入页面时按需加载数据，避免首屏一次性请求全部接口 */
      onEnter: function (view) {
        if (view === 'booking' && !this.bookingList.length) { this.loadBooking(); }
        if (view === 'orders' && !this.checkoutMode) { this.loadOrders(); }
        if (view === 'ai' && !Object.keys(this.ai).length) { this.loadAiStatus(); }
      },

      /* ---------------------------- 站点信息 ---------------------------- */

      loadServerInfo: function () {
        var self = this;
        api.get('/api/server/info', null, { silent: true }).then(function (res) {
          if (res && res.ok) {
            self.site = res;
          }
          self.booted = true;
          // 本地存有登录态时，先确认这个令牌还有效，再去拉业务数据。
          // 为什么必须先确认：令牌可能已经失效（会话过期、管理员重置了密码、
          // 账号被停用或删除……）。如果不确认就直接拉数据，会连着打四五个注定 401 的
          // 请求 —— 控制台一片红，用户也会看到一次莫名其妙的闪断。
          if (self.user) { self.verifySession(); }
          // 顶部标题也用平台名，保持与后台一致
          if (res && res.shortName) { document.title = res.shortName + ' · 游客端'; }
        });
      },

      /** 校验本地登录态：有效才继续加载业务数据，无效就干净地退回登录页 */
      verifySession: function () {
        var self = this;
        api.get('/api/auth/me', null, { silent: true }).then(function (res) {
          if (res && res.ok) {
            // 顺便刷新昵称等资料，避免后台改过名字后本地缓存对不上
            if (res.name) {
              ZQ.store.save(ZQ.store.token, res.role, res.name);
              self.user = ZQ.store.user;
            }
            self.loadAll();
          } else {
            ZQ.store.clear();
            self.user = null;
            self.stamps = [];
            self.orders = [];
          }
        });
      },

      /* ---------------------------- 认证 ---------------------------- */

      loadKnown: function () {
        var self = this;
        api.get('/api/auth/known', { role: 'buyer' }, { silent: true }).then(function (res) {
          if (res && res.ok) {
            self.known = (res.accounts || []).map(function (a) {
              return Object.assign({}, a, {
                lastLoginText: a.lastLoginAt ? fmt.ago(a.lastLoginAt) + '登录' : '',
              });
            });
          }
          self.knownLoading = false;
        });
      },

      afterAuth: function (res) {
        var self = this;
        if (!res || !res.ok) { return; }
        ZQ.store.save(res.token, res.role, res.name);
        this.user = ZQ.store.user;
        this.toast(res.message || '登录成功');
        this.view = 'home';
        this.viewStack = [];
        this.cart = readCart();
        setTimeout(function () { self.loadAll(); }, 200);
      },

      doLogin: function () {
        var self = this;
        var account = this.loginForm.account;
        var password = this.loginForm.password;
        if (!account) { return this.toast('请输入账号'); }
        if (!password) { return this.toast('请输入密码'); }

        this.loading = true;
        api.post('/api/auth/login', { account: account, password: password, client: 'visitor-h5', expect: 'buyer' })
          .then(function (res) { self.loading = false; self.afterAuth(res); });
      },

      doQuick: function (item) {
        var self = this;
        if (!item.token) {
          // 免密令牌可能被管理员重置密码清掉了，这时退回密码登录，别让卡片点了没反应
          this.loginForm.account = item.account;
          return this.toast('该账号需要重新输入密码登录');
        }
        this.loading = true;
        api.post('/api/auth/quick-login', { account: item.account, token: item.token, client: 'visitor-h5' })
          .then(function (res) { self.loading = false; self.afterAuth(res); });
      },

      doRegister: function () {
        var self = this;
        var f = this.regForm;
        if (!/^[A-Za-z][A-Za-z0-9_]{3,19}$/.test(f.account)) {
          return this.toast('账号需字母开头，4-20 位字母数字下划线');
        }
        if (!f.name) { return this.toast('请输入昵称'); }
        if (f.phone && !/^1\d{10}$/.test(f.phone)) { return this.toast('手机号格式不正确'); }
        if (!f.password || f.password.length < 6) { return this.toast('密码至少 6 位'); }
        if (f.password !== f.confirm) { return this.toast('两次输入的密码不一致'); }

        this.loading = true;
        api.post('/api/auth/register', {
          role: 'buyer', account: f.account, name: f.name, phone: f.phone, password: f.password,
        }).then(function (res) {
          self.loading = false;
          if (!res || !res.ok) { return; }
          self.toast('注册成功，请登录');
          self.loginForm.account = f.account;
          self.loginForm.password = '';
          self.regForm = { account: '', name: '', phone: '', password: '', confirm: '' };
          self.authTab = 'login';
          self.loadKnown();
        });
      },

      doLogout: function () {
        var self = this;
        if (!confirm('确定退出登录吗？退出后需要重新输入账号密码。')) { return; }
        api.post('/api/auth/logout', {}, { silent: true }).then(function () {
          ZQ.store.clear();
          self.user = null;
          self.view = 'home';
          self.viewStack = [];
          self.stamps = [];
          self.orders = [];
          self.toast('已退出登录');
          self.loadKnown();
        });
      },

      /* ---------------------------- 连接服务器 ---------------------------- */

      testConn: function () {
        var self = this;
        var url = String(this.baseUrlInput || '').trim().replace(/\/+$/, '');
        if (!url) { return this.toast('请先填写服务端地址'); }
        if (!/^https?:\/\//i.test(url)) { url = 'http://' + url; }

        this.testing = true;
        var prev = api.getBase();
        api.setBase(url);
        api.get('/api/server/info', null, { silent: true }).then(function (res) {
          self.testing = false;
          if (res && res.ok) {
            self.connResult = { ok: true, message: '已连上「' + (res.name || '战旗云') + '」，可以保存了。' };
          } else {
            api.setBase(prev);
            self.connResult = { ok: false, message: (res && res.error) || '连不上，请检查地址是否正确。' };
          }
        });
      },

      saveConn: function () {
        var self = this;
        var url = String(this.baseUrlInput || '').trim().replace(/\/+$/, '');
        if (!url) { return this.toast('请先填写服务端地址'); }
        if (!/^https?:\/\//i.test(url)) { url = 'http://' + url; }
        api.setBase(url);
        try { localStorage.setItem('zhanqi.base', url); } catch (e) { /* 忽略 */ }
        api.get('/api/server/info', null, { silent: true }).then(function (res) {
          if (res && res.ok) {
            self.toast('已连接');
            self.view = 'home';
            self.loadServerInfo();
          } else {
            self.connResult = { ok: false, message: (res && res.error) || '地址已保存，但暂时连不上。' };
          }
        });
      },

      /* ---------------------------- 首页数据 ---------------------------- */

      loadAll: function () {
        this.loadSpots();
        this.loadProducts();
        this.loadActivities();
        this.loadStamps();
        this.loadOrders();
      },

      loadSpots: function () {
        var self = this;
        this.loadingSpots = true;
        api.get('/api/tour/spots').then(function (res) {
          if (res && res.ok) {
            self.spots = res.spots || [];
            self.total = res.total || self.spots.length;
            self.collected = res.collected || 0;
          }
          self.loadingSpots = false;
        });
      },

      loadProducts: function () {
        var self = this;
        this.loadingProducts = true;
        var params = {};
        if (this.category) { params.category = this.category; }
        if (this.keyword) { params.keyword = this.keyword; }
        api.get('/api/shop/products', params).then(function (res) {
          if (res && res.ok) {
            self.products = (res.products || []).map(function (p) {
              return Object.assign({}, p, { categoryText: CATEGORY_TEXT[p.category] || p.category });
            });
            // 首页只展示农产文创类的前 4 件，避免首屏过长
            if (!self.category && !self.keyword) {
              self.goods = self.products.filter(function (p) { return p.category === 'goods'; }).slice(0, 4);
              if (!self.goods.length) { self.goods = self.products.slice(0, 4); }
            }
          }
          self.loadingProducts = false;
        });
      },

      switchCategory: function (key) {
        this.category = key;
        this.loadProducts();
      },

      loadActivities: function () {
        var self = this;
        api.get('/api/tour/activities').then(function (res) {
          if (res && res.ok) {
            // 首页只显示今天及以后的活动；活动日历页展示全部
            self.activities = res.activities || [];
          }
        });
      },

      loadStamps: function () {
        var self = this;
        if (!this.user) { this.stamps = []; return; }
        api.get('/api/tour/stamps').then(function (res) {
          if (res && res.ok) {
            self.stamps = res.stamps || [];
            self.allDone = !!res.allDone;
          }
        });
      },

      loadOrders: function () {
        var self = this;
        if (!this.user) { this.orders = []; this.loadingOrders = false; return; }
        this.loadingOrders = true;
        api.get('/api/shop/orders', { status: this.orderStatusFilter }).then(function (res) {
          if (res && res.ok) { self.orders = res.orders || []; }
          self.loadingOrders = false;
        });
      },

      /* ---------------------------- 点位打卡 ---------------------------- */

      openSpot: function (id) {
        var self = this;
        this.go('spotDetail');
        this.current = {};
        window.scrollTo(0, 0);
        api.get('/api/tour/spots/' + id).then(function (res) {
          if (res && res.ok) { self.current = res.spot || {}; }
        });
      },

      checkin: function (spot) {
        var self = this;
        if (!this.user) {
          this.toast('请先登录再打卡');
          return;
        }
        api.post('/api/tour/spots/' + spot.id + '/checkin', {}).then(function (res) {
          if (!res || !res.ok) { return; }
          self.toast(res.message || '打卡成功');
          if (!res.repeated) { self.buzz(); }

          // 局部更新，避免整页重请求导致列表跳动
          var target = self.spots.filter(function (s) { return s.id === spot.id; })[0];
          if (target) {
            target.checked = true;
            target.checkedAt = (res.stamp && res.stamp.at) || new Date().toISOString();
          }
          if (self.current.id === spot.id) {
            self.current.checked = true;
            self.current.checkedAt = target ? target.checkedAt : new Date().toISOString();
          }
          if (typeof res.collected === 'number') { self.collected = res.collected; }
          if (res.total) { self.total = res.total; }
          self.allDone = !!res.allDone;
          self.loadStamps();
        });
      },

      /* ---------------------------- 语音讲解 ---------------------------- */

      toggleSpeak: function () {
        if (this.speaking) {
          this.stopSpeak();
          return;
        }
        var text = this.current.tts || this.current.intro || '';
        if (!text) { return this.toast('这个点位还没有讲解内容'); }
        if (!window.speechSynthesis) {
          this.showScript = true;
          return this.toast('当前浏览器不支持语音朗读，已为你展开讲解文稿');
        }

        var self = this;
        try {
          window.speechSynthesis.cancel();
          var u = new SpeechSynthesisUtterance(text);
          u.lang = 'zh-CN';
          u.rate = 1;
          u.onend = function () { self.speaking = false; };
          u.onerror = function () { self.speaking = false; };
          window.speechSynthesis.speak(u);
          this.speaking = true;
        } catch (e) {
          this.showScript = true;
          this.toast('语音朗读启动失败，已为你展开讲解文稿');
        }
      },

      stopSpeak: function () {
        try { if (window.speechSynthesis) { window.speechSynthesis.cancel(); } } catch (e) { /* 忽略 */ }
        this.speaking = false;
      },

      waveStyle: function (n) {
        return { height: (5 + ((n * 29) % 20)) + 'px', animationDelay: ((n % 6) * 0.09) + 's' };
      },

      /* ---------------------------- 商品与订单 ---------------------------- */

      openProduct: function (id) {
        var self = this;
        this.go('productDetail');
        this.product = {};
        this.qty = 1;
        this.people = 2;
        this.bookDate = dayAfter(1);
        this.address = '';
        this.remark = '';
        window.scrollTo(0, 0);
        api.get('/api/shop/products/' + id).then(function (res) {
          if (res && res.ok && res.product) {
            self.product = Object.assign({}, res.product, {
              categoryText: CATEGORY_TEXT[res.product.category] || res.product.category,
            });
          }
        });
      },

      buyNow: function () {
        var self = this;
        if (this.product.stock <= 0) { return this.toast('该商品已售罄'); }
        if (!this.user) { return this.toast('请先登录再下单'); }
        if (this.isBooking && !this.bookDate) { return this.toast('请选择预约日期'); }
        if (!this.isBooking && !this.address) { return this.toast('请填写收货地址'); }

        this.submitting = true;
        api.post('/api/shop/orders', {
          items: [{ productId: this.product.id, qty: this.isBooking ? this.people : this.qty }],
          bookDate: this.isBooking ? this.bookDate : '',
          people: this.isBooking ? this.people : 1,
          address: this.isBooking ? '' : this.address,
          remark: this.remark,
        }).then(function (res) {
          self.submitting = false;
          if (!res || !res.ok) { return; }
          self.toast(res.message || '下单成功');
          self.go('orders');
          self.checkoutMode = false;
          self.loadOrders();
          self.loadProducts();
        });
      },

      cancelOrder: function (o) {
        var self = this;
        if (!confirm('确定取消「' + o.productName + '」这笔订单吗？取消后库存会回滚。')) { return; }
        api.post('/api/shop/orders/' + o.id + '/cancel', { reason: '买家主动取消' }).then(function (res) {
          if (res && res.ok) {
            self.toast(res.message || '已取消');
            self.loadOrders();
            self.loadProducts();
          }
        });
      },

      /* ---------------------------- 购物车 ---------------------------- */

      syncCart: function () { this.cart = readCart(); },

      addCart: function (p, qty) {
        if (p.stock <= 0) { return this.toast('该商品已售罄'); }
        var n = Math.max(1, Number(qty) || 1);
        var list = readCart();
        var exist = list.filter(function (it) { return it.productId === p.id; })[0];
        var limit = Number(p.stock) || 99;
        if (exist) {
          exist.qty = Math.min(exist.qty + n, limit);
        } else {
          list.push({
            productId: p.id, name: p.name, price: Number(p.price) || 0,
            unit: p.unit || '份', cover: p.cover || '', category: p.category || 'goods',
            stock: Number(p.stock) || 0, qty: Math.min(n, limit),
          });
        }
        writeCart(list);
        this.syncCart();
        this.toast('已加入购物车');
      },

      setQty: function (productId, qty) {
        var list = readCart();
        var item = list.filter(function (it) { return it.productId === productId; })[0];
        if (!item) { return; }
        var n = Number(qty) || 0;
        if (n <= 0) {
          list = list.filter(function (it) { return it.productId !== productId; });
        } else {
          item.qty = Math.min(n, item.stock || 99);
        }
        writeCart(list);
        this.syncCart();
      },

      removeCart: function (productId) {
        writeCart(readCart().filter(function (it) { return it.productId !== productId; }));
        this.syncCart();
      },

      clearCart: function () {
        writeCart([]);
        this.syncCart();
      },

      startCheckout: function () {
        if (!this.cart.length) { return this.toast('购物车是空的'); }
        this.cartOpen = false;
        this.checkoutMode = true;
        this.bookDate = dayAfter(1);
        this.people = 2;
        this.address = '';
        this.remark = '';
        this.go('orders');
      },

      submitCart: function () {
        var self = this;
        if (this.cartHasBooking && !this.bookDate) { return this.toast('请选择预约日期'); }
        if (!this.cartHasBooking && !this.address) { return this.toast('请填写收货地址'); }

        this.submitting = true;
        api.post('/api/shop/orders', {
          items: this.cart.map(function (it) { return { productId: it.productId, qty: it.qty }; }),
          bookDate: this.cartHasBooking ? this.bookDate : '',
          people: this.cartHasBooking ? this.people : 1,
          address: this.cartHasBooking ? '' : this.address,
          remark: this.remark,
        }).then(function (res) {
          self.submitting = false;
          if (!res || !res.ok) { return; }
          writeCart([]);
          self.syncCart();
          // 部分商品没下成时，把后端给的原因如实告诉用户，不假装全部成功
          if (res.warnings && res.warnings.length) {
            self.toast(res.warnings.join('；'));
          } else {
            self.toast(res.message || '下单成功');
          }
          self.checkoutMode = false;
          self.loadOrders();
          self.loadProducts();
        });
      },

      /* ---------------------------- 预约页 ---------------------------- */

      loadBooking: function () {
        var self = this;
        this.loadingBooking = true;
        var map = function (p) {
          return Object.assign({}, p, { categoryText: CATEGORY_TEXT[p.category] || p.category });
        };

        if (this.bookingCat) {
          api.get('/api/shop/products', { category: this.bookingCat }).then(function (res) {
            self.bookingList = (res && res.ok) ? (res.products || []).map(map) : [];
            self.loadingBooking = false;
          });
        } else {
          // 「全部」把三类预约项目合并展示，商城的实物商品不在本页出现
          Promise.all(BOOKING_CATS.map(function (c) {
            return api.get('/api/shop/products', { category: c }, { silent: true });
          })).then(function (results) {
            var merged = [];
            results.forEach(function (r) {
              if (r && r.ok) { merged = merged.concat(r.products || []); }
            });
            self.bookingList = merged.map(map);
            self.loadingBooking = false;
          });
        }
      },

      /* ---------------------------- AI 助手 ---------------------------- */

      loadAiStatus: function () {
        var self = this;
        api.get('/api/ai/status', null, { silent: true }).then(function (res) {
          if (res && res.ok) { self.ai = res; }
          else { self.ai = { mode: '本地知识库检索（零成本、断网可用）' }; }
        });
      },

      ask: function (preset) {
        var self = this;
        var question = String(typeof preset === 'string' ? preset : this.draft).trim();
        if (!question || this.thinking) { return; }

        this.draft = '';
        this.messages.push({ role: 'user', text: question, shown: question });
        this.thinking = true;
        this.scrollChat();

        api.post('/api/ai/ask', { question: question }).then(function (res) {
          self.thinking = false;

          if (!res || !res.ok) {
            var errText = (res && res.error) || 'AI 服务暂时不可用，请稍后再试。';
            self.messages.push({ role: 'assistant', text: errText, shown: errText, matched: true });
            self.scrollChat();
            return;
          }

          var answer = res.answer || '（没有返回内容）';
          var msg = {
            role: 'assistant',
            text: answer,
            shown: '',
            streaming: true,
            matched: res.matched !== false,
            sources: res.sources || [],
          };
          self.messages.push(msg);
          self.scrollChat();

          // 打字机效果：步长按总长度动态算，长回答也不会等太久
          var step = Math.max(1, Math.ceil(answer.length / 90));
          var cursor = 0;
          var timer = setInterval(function () {
            cursor = Math.min(answer.length, cursor + step);
            msg.shown = answer.slice(0, cursor);
            if (cursor >= answer.length) {
              clearInterval(timer);
              msg.streaming = false;
              self.scrollChat();
            } else {
              self.scrollChat();
            }
          }, 26);
        });
      },

      scrollChat: function () {
        var self = this;
        this.$nextTick(function () {
          var el = self.$refs.chat;
          if (el) { el.scrollTop = el.scrollHeight; }
          else { window.scrollTo(0, document.body.scrollHeight); }
        });
      },

      /* ---------------------------- 行程规划 ---------------------------- */

      togglePref: function (p) {
        var i = this.planPrefs.indexOf(p);
        if (i >= 0) { this.planPrefs.splice(i, 1); } else { this.planPrefs.push(p); }
      },

      generatePlan: function () {
        var self = this;
        this.loadingPlan = true;
        this.planResult = null;
        api.post('/api/ai/plan', {
          days: this.planDays, people: this.planPeople, preferences: this.planPrefs,
        }).then(function (res) {
          self.loadingPlan = false;
          if (res && res.ok) {
            self.planResult = res;
          } else {
            self.toast((res && res.error) || '生成失败，请稍后再试');
          }
        });
      },
    },

    mounted: function () {
      // 若本页被单独部署到别的域名，启动时先恢复上次保存的后端地址
      var self = this;
      try {
        var saved = localStorage.getItem('zhanqi.base');
        if (saved) { api.setBase(saved); }
        this.baseUrlInput = saved || (ZQ.api.getBase() || window.location.origin);
      } catch (e) {
        this.baseUrlInput = window.location.origin;
      }

      // 离开页面时停掉语音，避免在别的页面继续朗读
      window.addEventListener('beforeunload', function () { self.stopSpeak(); });
    },
  });
})();
