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
        stamps: [],
        category: '',
        keyword: '',
        currentSpot: null,
        currentAct: null,
        actForm: { date: '', people: 2, phone: '', remark: '' },
        booking: false,
        currentProduct: null,
        detailLoading: false,
        cart: [],
        cartOpen: false,
        address: '',
        remark: '',
        submitting: false,
        toastList: [],
        ai: { question: '', answer: '', shown: '', streaming: false, sources: [], loading: false, mode: 'ask', planDays: 2, planPref: '亲子' },
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
      knownAvatar: function (a) {
        return window.ZQProfile.src(a, 'buyer');
      },
      spotIcon: function (spot) { return window.ZQSpotIcons.iconOf(spot); },
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
        if (view !== 'ai') { this.stopTyping(); }
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
      openSpot: function (spot, autoSpeak) {
        var self = this;
        this.detailLoading = true;
        this.currentSpot = spot;
        api.get('/api/tour/spots/' + spot.id, null, { silent: true }).then(function (res) {
          self.detailLoading = false;
          if (res.ok && res.spot) { self.currentSpot = res.spot; }
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

      /* ---------------------------- 个人资料 ---------------------------- */

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

      /* ---------------------------- AI ---------------------------- */
      askAi: function () {
        var self = this;
        var q = (this.ai.question || '').trim();
        if (!q) { this.toast('先输入一个问题', 'warn'); return; }
        this.stopTyping();
        this.ai.loading = true;
        this.ai.answer = '';
        this.ai.shown = '';
        this.ai.streaming = false;
        this.ai.sources = [];
        var mode = this.ai.mode;
        var url = mode === 'plan' ? '/api/ai/plan' : '/api/ai/ask';
        var body = mode === 'plan'
          ? { days: Number(this.ai.planDays), people: 2, preferences: [this.ai.planPref] }
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
