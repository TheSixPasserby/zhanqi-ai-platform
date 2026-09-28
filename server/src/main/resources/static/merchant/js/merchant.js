/* ============================================================================
 *  商户工作台（电脑 H5 页面，Vue 2 + Element UI）
 *
 *  职责：商家自己经营相关的全部功能 —— 商品上下架、订单接单核销、营收统计、AI 文案。
 *  刻意不含任何「服务器地址 / 连接配置」入口：那些只在 PC 管理后台配置，
 *  商家打开页面就是同源加载，不需要知道服务器在哪。
 * ========================================================================== */
(function () {
  'use strict';

  var api = window.ZQ.api;
  var fmt = window.ZQ.fmt;
  var store = window.ZQ.store;
  var COLORS = window.ZQChartColors;

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
    data: function () {
      return {
        loading: false, saving: false, keyword: '', category: '', list: [],
        categories: { goods: '农产文创', study: '研学课程', homestay: '民宿住宿', experience: '农事体验' },
        formVisible: false, form: {}, tagsText: '',
        aiVariants: [], aiIndex: 0, aiGeneratedBy: '',
        covers: [
          '/assets/img/spot-rice.svg', '/assets/img/spot-radish.svg', '/assets/img/spot-buxie.svg',
          '/assets/img/craft.svg', '/assets/img/spot-study.svg', '/assets/img/spot-linpan.svg',
          '/assets/img/farm.svg', '/assets/img/spot-bookhouse.svg', '/assets/img/spot-center.svg'
        ],
        fmt: fmt
      };
    },
    created: function () { this.load(); },
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
          });
      },
      openForm: function (row) {
        if (row) {
          this.form = Object.assign({}, row);
          this.tagsText = (row.tags || []).join('，');
        } else {
          this.form = { category: 'goods', unit: '份', stock: 10, price: 0, cover: this.covers[0] };
          this.tagsText = '';
        }
        this.aiVariants = [];
        this.aiIndex = 0;
        this.formVisible = true;
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

  var tabOrders = {
    name: 'tab-orders',
    template: '#tpl-tab-orders',
    data: function () { return { loading: false, status: '', list: [], fmt: fmt }; },
    created: function () { this.load(); },
    methods: {
      load: function () {
        var self = this;
        this.loading = true;
        api.get('/api/shop/orders', { status: this.status }).then(function (res) {
          self.loading = false;
          if (!res.ok) { return; }
          self.list = res.orders || [];
        });
      },
      act: function (row, action) {
        var self = this;
        var url = '/api/shop/orders/' + row.id + '/' + action;
        var confirmText = {
          confirm: '确认接下这笔订单？',
          verify: '确认核销这笔订单？（表示现场服务已完成 / 已交付）',
          cancel: '拒绝这笔订单？库存会一并回滚。'
        }[action];

        var run = function () {
          api.post(url).then(function (res) {
            if (res.ok) { self.$message.success(res.message); self.load(); self.$emit('refresh'); }
          });
        };
        if (action === 'verify') {
          this.$confirm(confirmText, '核销订单', { type: 'warning' }).then(run).catch(function () { });
        } else if (action === 'cancel') {
          this.$confirm(confirmText, '拒绝订单', { type: 'warning' }).then(run).catch(function () { });
        } else {
          run();
        }
      }
    }
  };

  /* ---------------------------- 营收统计 ---------------------------- */

  var tabStat = {
    name: 'tab-stat',
    template: '#tpl-tab-stat',
    props: { kpi: { type: Object, default: function () { return {}; } } },
    data: function () { return { trend: [], productRank: [], categoryRevenue: [], fmt: fmt }; },
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
        });
      }
    }
  };

  /* ---------------------------- 根实例 ---------------------------- */

  new Vue({
    el: '#app',
    components: {
      'tab-home': tabHome, 'tab-goods': tabGoods, 'tab-orders': tabOrders, 'tab-stat': tabStat,
      'zq-line': window.ZQCharts.LineChart,
      'zq-donut': window.ZQCharts.Donut,
      'zq-bars': window.ZQCharts.Bars,
      'zq-spark': window.ZQCharts.Spark
    },
    data: function () {
      return {
        loading: false,
        tab: 'home',
        user: null,
        me: { name: '', profile: {} },
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
          { key: 'stat', name: '营收统计', icon: 'el-icon-pie-chart' }
        ]
      };
    },
    computed: {
      knownMerchants: function () {
        return this.knownAll.filter(function (a) { return a.role === 'merchant'; });
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
              self.me = { name: res.name, profile: res.profile || {} };
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
          if (res.ok) { self.me = { name: res.name, profile: res.profile || {} }; }
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
        }
      }
    }
  });
})();
