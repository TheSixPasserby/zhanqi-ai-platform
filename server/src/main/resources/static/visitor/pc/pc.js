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

  new Vue({
    el: '#pc',
    data: function () {
      return {
        booted: false,
        loading: false,
        view: 'home',
        user: null,
        me: { name: '', profile: {} },
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
        stamps: [],
        category: '',
        keyword: '',
        currentSpot: null,
        currentProduct: null,
        detailLoading: false,
        cart: [],
        cartOpen: false,
        address: '',
        remark: '',
        submitting: false,
        toastList: [],
        ai: { question: '', answer: '', sources: [], loading: false, mode: 'ask', planDays: 2, planPref: '亲子' },
        categories: CATEGORY_TEXT
      };
    },
    computed: {
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
      }
    },
    created: function () {
      var self = this;
      window.ZQ.notify.onToast = function (message, type) { self.toast(message, type); };
      window.ZQ.notify.onUnauthorized = function (message) {
        self.user = null;
        self.toast(message, 'error');
      };
      this.bootstrap();
    },
    methods: {
      /* ---------------------------- 基础 ---------------------------- */
      icon: function (name) { return '../../assets/img/icons.svg#' + name; },
      asset: function (p) {
        if (!p) { return '../../assets/img/photos/spot-center.jpg'; }
        return p.charAt(0) === '/' ? p : '/' + p;
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
        this.view = view;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (view === 'orders' && this.user) { this.loadOrders(); }
        if (view === 'spots' && this.user) { this.loadStamps(); }
        if (view === 'mine' && this.user) { this.loadOrders(); this.loadStamps(); }
      },

      /* ---------------------------- 启动 ---------------------------- */
      bootstrap: function () {
        var self = this;
        api.get('/api/server/info', null, { silent: true }).then(function (res) {
          if (!res.ok) { return; }
          self.site = { name: res.name, shortName: res.shortName, slogan: res.slogan, announcement: res.announcement };
          self.links = { mobileUrl: res.mobileUrl, merchantUrl: res.merchantUrl, adminUrl: res.adminUrl };
          document.title = (res.shortName || '战旗云') + ' · 游客端';
        });
        this.loadSpots();
        this.loadProducts();
        this.loadActivities();
        this.loadKnown();

        if (store.token) {
          api.get('/api/auth/me', null, { silent: true }).then(function (res) {
            if (res.ok && res.role === 'buyer') {
              self.user = { role: res.role };
              self.me = { name: res.name, profile: res.profile || {} };
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
          self.me = { name: res.name, profile: res.profile || {} };
          self.toast('欢迎回来，' + res.name);
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
          self.toast('已进入');
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
        api.post('/api/auth/logout').then(function () {
          store.clear();
          self.user = null;
          self.orders = [];
          self.stamps = [];
          self.view = 'home';
        });
      },

      /* ---------------------------- 点位 ---------------------------- */
      openSpot: function (spot) {
        var self = this;
        this.detailLoading = true;
        this.currentSpot = spot;
        api.get('/api/tour/spots/' + spot.id, null, { silent: true }).then(function (res) {
          self.detailLoading = false;
          if (res.ok && res.spot) { self.currentSpot = res.spot; }
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
        });
      },
      speak: function (spot) {
        if (!spot || !spot.tts) { this.toast('该点位暂无讲解', 'warn'); return; }
        if (!('speechSynthesis' in window)) { this.toast('当前浏览器不支持语音朗读', 'warn'); return; }
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(spot.tts);
        u.lang = 'zh-CN';
        u.rate = 0.95;
        window.speechSynthesis.speak(u);
      },
      isChecked: function (spotId) {
        return this.stamps.some(function (s) { return s.spotId === spotId; });
      },

      /* ---------------------------- 商城 ---------------------------- */
      openProduct: function (p) {
        var self = this;
        this.detailLoading = true;
        this.currentProduct = p;
        api.get('/api/shop/products/' + p.id, null, { silent: true }).then(function (res) {
          self.detailLoading = false;
          if (res.ok && res.product) { self.currentProduct = res.product; }
        });
      },
      addCart: function (p, qty) {
        var n = Number(qty || 1);
        var hit = null;
        this.cart.forEach(function (c) { if (c.id === p.id) { hit = c; } });
        if (hit) { hit.qty += n; } else {
          this.cart.push({ id: p.id, name: p.name, price: Number(p.price), cover: p.cover, unit: p.unit, qty: n });
        }
        this.toast('已加入购物车');
      },
      changeQty: function (item, delta) {
        item.qty += delta;
        if (item.qty <= 0) {
          this.cart = this.cart.filter(function (c) { return c !== item; });
        }
      },
      checkout: function () {
        var self = this;
        if (!this.user) { this.toast('请先登录再下单', 'warn'); return; }
        if (!this.cart.length) { return; }
        if (!this.address.trim()) { this.toast('请填写收货地址', 'warn'); return; }
        var payload = {
          items: this.cart.map(function (c) { return { productId: c.id, qty: c.qty }; }),
          address: this.address.trim(),
          remark: this.remark
        };
        this.submitting = true;
        api.post('/api/shop/orders', payload).then(function (res) {
          self.submitting = false;
          if (!res.ok) { return; }
          self.toast(res.message || '下单成功');
          self.cart = [];
          self.cartOpen = false;
          self.loadOrders();
          self.loadProducts();
          self.go('orders');
        });
      },

      cancelOrder: function (o) {
        var self = this;
        if (!window.confirm('确定取消「' + o.productName + '」这笔订单吗？取消后库存会回滚。')) { return; }
        api.post('/api/shop/orders/' + o.id + '/cancel', { reason: '买家主动取消' }).then(function (res) {
          if (!res.ok) { return; }
          self.toast(res.message || '已取消');
          self.loadOrders();
          self.loadProducts();
        });
      },

      /* ---------------------------- AI ---------------------------- */
      askAi: function () {
        var self = this;
        var q = (this.ai.question || '').trim();
        if (!q) { this.toast('先输入一个问题', 'warn'); return; }
        this.ai.loading = true;
        this.ai.answer = '';
        this.ai.sources = [];
        var url = this.ai.mode === 'plan' ? '/api/ai/plan' : '/api/ai/ask';
        var body = this.ai.mode === 'plan'
          ? { days: Number(this.ai.planDays), people: 2, preferences: [this.ai.planPref] }
          : { question: q };
        api.post(url, body).then(function (res) {
          self.ai.loading = false;
          if (!res.ok) { return; }
          if (self.ai.mode === 'plan') {
            self.ai.answer = res.summary || (res.plan && res.plan.summary) || '';
            self.ai.sources = res.days || res.plan || [];
          } else {
            self.ai.answer = res.answer || '';
            self.ai.sources = res.sources || [];
          }
        });
      },
      presetAsk: function (text) {
        this.ai.question = text;
        this.askAi();
      }
    }
  });
})();
