/* ============================================================================
 *  PC 管理后台（Vue 2 + Element UI）
 *
 *  职责边界（和另外两端的区别，看代码前先记住这一条）：
 *    · 管理后台 = 平台管理员 + 服务器管理员。既能管商家/买家/订单/商品，
 *      也能管服务器状态、连接配置、平台参数、AI 接口、数据库总览；
 *    · 游客端只放 AI 助手与游客自己的业务；商户工作台只放经营相关功能；
 *    · 所以「其他端连哪个地址」这类设置只出现在这里，另外两端不出现任何地址输入框。
 *
 *  工程约定：
 *    · 不用构建工具，Vue 与 Element UI 走本地 vendors 目录，改完刷新即生效；
 *    · 每个页面一个组件，模板放在 index.html 的 text/x-template 里，逻辑全部在本文件；
 *    · 所有请求走 window.ZQ.api，统一处理 401、统一弹中文错误提示。
 * ========================================================================== */
(function () {
  'use strict';

  var api = window.ZQ.api;
  var fmt = window.ZQ.fmt;
  var store = window.ZQ.store;
  var COLORS = window.ZQChartColors;

  /* ============================ 账号管理（商家 / 买家共用逻辑） ============================ */

  function accountComponent(kind, templateId) {
    var isMerchant = kind === 'merchant';
    var base = isMerchant ? '/api/admin/merchants' : '/api/admin/buyers';

    return {
      name: 'view-' + kind,
      template: templateId,
      data: function () {
        return {
          loading: false,
          saving: false,
          keyword: '',
          status: '',
          list: [],
          total: 0,
          activeCount: 0,
          formVisible: false,
          form: {},
          detailVisible: false,
          detailTab: 'info',
          current: null,
          products: [],
          orders: [],
          stamps: [],
          merchantTypes: [],
          fmt: fmt
        };
      },
      created: function () {
        this.load();
        if (isMerchant) { this.loadTypes(); }
      },
      methods: {
        loadTypes: function () {
          var self = this;
          api.get('/api/auth/options').then(function (res) {
            if (res.ok) { self.merchantTypes = res.shopTypes || []; }
          });
        },
        load: function () {
          var self = this;
          this.loading = true;
          api.get(base, { keyword: this.keyword, status: this.status }).then(function (res) {
            self.loading = false;
            if (!res.ok) { return; }
            self.list = res.list || [];
            self.total = res.total || 0;
            self.activeCount = res.activeCount || 0;
          });
        },
        openCreate: function () {
          this.form = { type: isMerchant ? '农产品农户' : '' };
          if (isMerchant) { this.loadTypes(); }
          this.formVisible = true;
        },
        edit: function (row) {
          this.form = Object.assign({}, row);
          if (isMerchant && !this.form.type) { this.form.type = '其他'; }
          this.formVisible = true;
        },
        save: function () {
          var self = this;
          var payload = Object.assign({}, this.form);
          if (payload.id) { delete payload.password; }
          else { payload.role = kind; }
          this.saving = true;
          var req = payload.id ? api.put(base + '/' + payload.id, payload) : api.post(base, payload);
          req.then(function (res) {
            self.saving = false;
            if (!res.ok) { return; }
            self.$message.success(res.message || '已保存');
            self.formVisible = false;
            self.load();
          });
        },
        detail: function (row) {
          var self = this;
          this.detailTab = 'info';
          api.get(base + '/' + row.id).then(function (res) {
            if (!res.ok) { return; }
            self.current = res.item;
            self.products = res.products || [];
            self.orders = res.orders || [];
            self.stamps = res.stamps || [];
            self.detailVisible = true;
          });
        },
        toggleStatus: function (row) {
          var self = this;
          var target = row.status === 'active' ? 'disabled' : 'active';
          var tip = target === 'disabled'
            ? '停用后该账号无法登录，已登录的会话会被立刻踢下线，确定继续？'
            : '确定启用该账号？';
          this.$confirm(tip, '账号状态变更', { type: 'warning' }).then(function () {
            api.post(base + '/' + row.id + '/status', { status: target }).then(function (res) {
              if (res.ok) { self.$message.success(res.message); self.load(); }
            });
          }).catch(function () { /* 取消 */ });
        },
        resetPwd: function (row) {
          var self = this;
          this.$prompt('请输入新密码（至少 6 位，直接确定则重置为 123456）', '重置密码', {
            inputPlaceholder: '123456'
          }).then(function (v) {
            api.post(base + '/' + row.id + '/reset-password', { password: (v.value || '').trim() }).then(function (res) {
              if (res.ok) { self.$message.success(res.message); self.load(); }
            });
          }).catch(function () { /* 取消 */ });
        },
        remove: function (row) {
          var self = this;
          this.$confirm(isMerchant
            ? '删除商家会同时下架其名下所有商品（历史订单保留），确定删除？'
            : '删除买家会同时清除其打卡记录（历史订单保留），确定删除？',
            '删除账号', { type: 'warning' }).then(function () {
            api.del(base + '/' + row.id).then(function (res) {
              if (res.ok) { self.$message.success(res.message); self.load(); }
            });
          }).catch(function () { /* 取消 */ });
        }
      }
    };
  }

  /* ============================ 运营概览 ============================ */

  var viewSummary = {
    name: 'view-summary',
    template: '#tpl-summary',
    data: function () {
      return { loading: false, trendKey: 'amount', kpi: {}, newIn7d: {}, trend: [], statusDist: [], merchantRank: [], buyerRank: [], fmt: fmt };
    },
    created: function () { this.load(); },
    computed: {
      statusItems: function () {
        var palette = { pending: COLORS.WARN, confirmed: COLORS.INFO, used: COLORS.BRAND, cancelled: '#C9C3B6' };
        return this.statusDist.map(function (s) {
          return { name: s.text || s.status, value: s.count, color: palette[s.status] || '#93A09A' };
        });
      },
      buyerItems: function () {
        return this.buyerRank.map(function (b) { return { name: b.name, amount: b.amount }; });
      }
    },
    methods: {
      load: function () {
        var self = this;
        this.loading = true;
        api.get('/api/admin/summary').then(function (res) {
          self.loading = false;
          if (!res.ok) { return; }
          self.kpi = res.kpi || {};
          self.newIn7d = res.newIn7d || {};
          self.trend = res.trend || [];
          self.statusDist = res.statusDist || [];
          self.merchantRank = res.merchantRank || [];
          self.buyerRank = res.buyerRank || [];
        });
      }
    }
  };

  /* ============================ 订单总览 ============================ */

  var viewOrders = {
    name: 'view-orders',
    template: '#tpl-orders',
    data: function () {
      return {
        loading: false, status: '', keyword: '', list: [], total: 0,
        statusText: { pending: '待确认', confirmed: '已确认', used: '已核销', cancelled: '已取消' },
        fmt: fmt
      };
    },
    created: function () { this.load(); },
    methods: {
      load: function () {
        var self = this;
        this.loading = true;
        api.get('/api/admin/orders', { status: this.status, keyword: this.keyword }).then(function (res) {
          self.loading = false;
          if (!res.ok) { return; }
          self.list = res.list || [];
          self.total = res.total || 0;
        });
      },
      cancel: function (row) {
        var self = this;
        this.$confirm('强制取消订单会按规则回滚库存，确定继续？', '强制取消订单', { type: 'warning' }).then(function () {
          api.post('/api/admin/orders/' + row.id + '/cancel').then(function (res) {
            if (res.ok) { self.$message.success(res.message); self.load(); }
          });
        }).catch(function () { /* 取消 */ });
      }
    }
  };

  /* ============================ 商品总览 ============================ */

  var viewProducts = {
    name: 'view-products',
    template: '#tpl-products',
    data: function () { return { loading: false, keyword: '', list: [], total: 0, fmt: fmt }; },
    created: function () { this.load(); },
    methods: {
      load: function () {
        var self = this;
        this.loading = true;
        api.get('/api/admin/products', { keyword: this.keyword }).then(function (res) {
          self.loading = false;
          if (!res.ok) { return; }
          self.list = res.list || [];
          self.total = res.total || 0;
        });
      }
    }
  };

  /* ============================ 内容数据管理（点位 / 活动 / 知识库） ============================ */

  var viewContent = {
    name: 'view-content',
    template: '#tpl-content',
    data: function () {
      return {
        tab: 'spots', loading: false, saving: false, list: [], formVisible: false,
        form: {}, tagsText: '',
        covers: [
          '/assets/img/spot-center.svg', '/assets/img/spot-linpan.svg', '/assets/img/spot-buxie.svg',
          '/assets/img/spot-rice.svg', '/assets/img/spot-museum.svg', '/assets/img/spot-study.svg',
          '/assets/img/spot-radish.svg', '/assets/img/spot-bookhouse.svg',
          '/assets/img/craft.svg', '/assets/img/farm.svg'
        ]
      };
    },
    computed: {
      tableLabel: function () {
        return { spots: '点位', activities: '活动', knowledge: '知识条目' }[this.tab];
      }
    },
    created: function () { this.load(); },
    methods: {
      switchTab: function () { this.load(); },
      load: function () {
        var self = this;
        this.loading = true;
        api.get('/api/admin/data/' + this.tab).then(function (res) {
          self.loading = false;
          if (!res.ok) { return; }
          self.list = res.list || [];
        });
      },
      openCreate: function () {
        this.form = this.tab === 'spots'
          ? { type: '自然人文', cover: this.covers[0], stamp: '纪念章', stampIcon: '印' }
          : (this.tab === 'activities'
            ? { tag: '节庆', cover: this.covers[0], date: new Date().toISOString().slice(0, 10) }
            : {});
        this.tagsText = '';
        this.formVisible = true;
      },
      edit: function (row) {
        this.form = Object.assign({}, row);
        this.tagsText = (row.tags || []).join('，');
        this.formVisible = true;
      },
      save: function () {
        var self = this;
        var payload = Object.assign({}, this.form);
        if (this.tab === 'knowledge') {
          payload.tags = this.tagsText.split(/[,，、\s]+/).filter(Boolean);
        }
        this.saving = true;
        var url = '/api/admin/data/' + this.tab;
        var req = payload.id ? api.put(url + '/' + payload.id, payload) : api.post(url, payload);
        req.then(function (res) {
          self.saving = false;
          if (!res.ok) { return; }
          self.$message.success(res.message || '已保存');
          self.formVisible = false;
          self.load();
        });
      },
      remove: function (row) {
        var self = this;
        var name = row.name || row.title;
        this.$confirm('确定删除「' + name + '」？删除后三端会立刻看不到它。', '删除确认', { type: 'warning' }).then(function () {
          api.del('/api/admin/data/' + self.tab + '/' + row.id).then(function (res) {
            if (res.ok) { self.$message.success(res.message); self.load(); }
          });
        }).catch(function () { /* 取消 */ });
      }
    }
  };

  /* ============================ 服务器管理 ============================ */

  var viewServer = {
    name: 'view-server',
    template: '#tpl-server',
    props: { server: { type: Object, default: null } },
    data: function () {
      return {
        tab: 'status',
        saving: false,
        testing: false,
        form: {},
        loaded: false,
        sessionList: [],
        sessionLoading: false,
        schemaList: [],
        schemaLoading: false,
        fmt: fmt
      };
    },
    computed: {
      st: function () {
        return this.server || { status: {}, links: {}, interfaces: [], tables: {}, discovery: {}, ai: {} };
      }
    },
    created: function () { this.loadSettings(); },
    methods: {
      onTab: function (tab) {
        if (tab.name === 'sessions') { this.loadSessions(); }
        if (tab.name === 'schema') { this.loadSchema(); }
        if (tab.name === 'links' || tab.name === 'site' || tab.name === 'ai') { this.loadSettings(); }
        if (tab.name === 'status') { this.$emit('refresh'); }
      },
      loadSettings: function () {
        var self = this;
        api.get('/api/admin/settings').then(function (res) {
          if (!res.ok) { return; }
          self.form = Object.assign({}, res.values || {});
          self.loaded = true;
        });
      },
      save: function () {
        var self = this;
        this.saving = true;
        api.put('/api/admin/settings', this.form).then(function (res) {
          self.saving = false;
          if (!res.ok) { return; }
          self.$message.success(res.message || '已保存');
          self.$emit('refresh');
          self.$emit('reload');
        });
      },
      testAi: function () {
        var self = this;
        this.testing = true;
        api.post('/api/admin/ai/test').then(function (res) {
          self.testing = false;
          if (!res.ok) { return; }
          self.$alert(res.message, res.connected ? '连接成功' : '未启用 / 连接失败', { type: res.connected ? 'success' : 'warning' });
        });
      },
      loadSessions: function () {
        var self = this;
        this.sessionLoading = true;
        api.get('/api/admin/sessions').then(function (res) {
          self.sessionLoading = false;
          if (!res.ok) { return; }
          self.sessionList = res.list || [];
        });
      },
      kick: function (row) {
        var self = this;
        api.del('/api/admin/sessions/' + encodeURIComponent(row.fullToken)).then(function (res) {
          if (res.ok) { self.$message.success(res.message); self.loadSessions(); }
        });
      },
      loadSchema: function () {
        var self = this;
        this.schemaLoading = true;
        api.get('/api/admin/schema').then(function (res) {
          self.schemaLoading = false;
          if (!res.ok) { return; }
          self.schemaList = res.list || [];
        });
      },
      roleText: function (role) {
        return { admin: '平台管理员', merchant: '商家', buyer: '买家（游客）' }[role] || role;
      },
      clientText: function (client) {
        return { admin: 'PC 管理后台', merchant: '商户工作台', visitor: '游客端', unknown: '未知' }[client] || (client || '未知');
      }
    }
  };

  /* ============================ 根实例 ============================ */

  var app = new Vue({
    el: '#app',
    components: {
      'view-summary': viewSummary,
      'view-merchants': accountComponent('merchant', '#tpl-merchants'),
      'view-buyers': accountComponent('buyer', '#tpl-buyers'),
      'view-orders': viewOrders,
      'view-products': viewProducts,
      'view-content': viewContent,
      'view-server': viewServer,
      'zq-line': window.ZQCharts.LineChart,
      'zq-donut': window.ZQCharts.Donut,
      'zq-bars': window.ZQCharts.Bars,
      'zq-spark': window.ZQCharts.Spark
    },
    data: function () {
      return {
        loading: false,
        view: 'summary',
        user: null,
        site: {},
        links: {},
        serverInfo: null,
        qr: null,
        qrDialog: false,
        loginForm: { account: '', password: '' },
        loginRules: {
          account: [{ required: true, message: '请输入管理员账号', trigger: 'blur' }],
          password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
        },
        loginLoading: false,
        knownAll: [],
        fmt: fmt,
        menus: [
          { key: 'summary', name: '运营概览', icon: 'el-icon-data-line', desc: '平台整体经营数据' },
          { key: 'merchants', name: '商家管理', icon: 'el-icon-shop', desc: '账号开通、资料、停用与删除' },
          { key: 'buyers', name: '买家管理', icon: 'el-icon-user', desc: '游客账号与消费数据' },
          { key: 'orders', name: '订单总览', icon: 'el-icon-tickets', desc: '全平台订单与强制取消' },
          { key: 'products', name: '商品总览', icon: 'el-icon-goods', desc: '全平台商品清单' },
          { key: 'content', name: '内容管理', icon: 'el-icon-notebook-1', desc: '点位、活动、AI 知识库' },
          { key: 'server', name: '服务器管理', icon: 'el-icon-cpu', desc: '运行状态、连接配置、平台与 AI 参数' }
        ],
        features: [
          '统一管理商家与买家账号，支持开通、停用、重置密码',
          '全平台订单与商品总览，异常订单可强制取消并回滚库存',
          '服务器状态、网卡与二维码一站式查看，手机端扫码即连',
          '连接地址、平台参数、AI 接口全部在这里配置'
        ]
      };
    },
    computed: {
      currentMenu: function () {
        var v = this.view;
        return this.menus.filter(function (m) { return m.key === v; })[0] || this.menus[0];
      },
      knownAdmins: function () {
        return this.knownAll.filter(function (a) { return a.role === 'admin'; });
      },
      entries: function () {
        return [
          { name: '游客端', path: this.links.mobileUrl || '/visitor/', desc: '手机浏览器 / 安卓 App', on: false },
          { name: '商户工作台', path: this.links.merchantUrl || '/merchant/', desc: '电脑浏览器', on: false },
          { name: 'PC 管理后台', path: this.links.adminUrl || '/admin/', desc: '当前页面', on: true }
        ];
      }
    },
    created: function () {
      // 把 api.js 的提示能力接到 Element UI 的 message 上
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
      /* ---------------- 启动 ---------------- */
      bootstrap: function () {
        var self = this;
        api.get('/api/server/info', null, { silent: true }).then(function (res) {
          if (!res.ok) { return; }
          self.site = {
            name: res.name, shortName: res.shortName, slogan: res.slogan, announcement: res.announcement
          };
          self.links = {
            base: res.baseUrl, ip: res.ip, port: res.port,
            adminUrl: res.adminUrl, merchantUrl: res.merchantUrl, mobileUrl: res.mobileUrl,
            localUrl: res.localUrl
          };
          document.title = (res.shortName || '战旗云') + ' · PC 管理后台';
        });
        this.loadKnown();

        // 已有登录态：验证令牌是否还有效
        if (store.token) {
          api.get('/api/auth/me', null, { silent: true }).then(function (res) {
            if (res.ok && res.role === 'admin') {
              self.user = { name: res.name, role: res.role, profile: res.profile };
              self.loadServer();
            } else {
              store.clear();
              self.user = null;
            }
          });
        }
      },
      loadKnown: function () {
        var self = this;
        api.get('/api/auth/known', { role: 'admin' }, { silent: true }).then(function (res) {
          if (res.ok) { self.knownAll = res.accounts || []; }
        });
      },
      loadServer: function () {
        var self = this;
        api.get('/api/admin/server', null, { silent: true }).then(function (res) {
          if (!res.ok) { return; }
          self.serverInfo = {
            status: res.status, links: res.links, interfaces: res.interfaces,
            tables: res.tables, discovery: res.discovery, ai: res.ai, qrMobile: res.qrMobile
          };
          self.links = Object.assign({}, self.links, res.links);
        });
      },
      reloadSite: function () { this.bootstrap(); },

      /* ---------------- 登录 ---------------- */
      doLogin: function () {
        var self = this;
        this.$refs.loginForm.validate(function (valid) {
          if (!valid) { return; }
          self.loginLoading = true;
          api.post('/api/auth/login', {
            account: self.loginForm.account,
            password: self.loginForm.password,
            expect: 'admin',
            client: 'admin'
          }).then(function (res) {
            self.loginLoading = false;
            if (!res.ok) { return; }
            store.save(res.token, res.role, res.name);
            self.user = { name: res.name, role: res.role };
            self.$message.success('欢迎回来，' + res.name);
            self.loadKnown();
            self.loadServer();
            self.refreshMe();
          });
        });
      },
      refreshMe: function () {
        var self = this;
        api.get('/api/auth/me', null, { silent: true }).then(function (res) {
          if (res.ok) { self.user = { name: res.name, role: res.role, profile: res.profile }; }
        });
      },
      quickLogin: function (account) {
        var self = this;
        api.post('/api/auth/quick-login', {
          account: account.account, token: account.token, expect: 'admin', client: 'admin'
        }).then(function (res) {
          if (!res.ok) { return; }
          store.save(res.token, res.role, res.name);
          self.user = { name: res.name, role: res.role };
          self.$message.success('已进入管理后台');
          self.loadKnown();
          self.loadServer();
        });
      },
      onUserCommand: function (cmd) {
        var self = this;
        if (cmd === 'logout') {
          api.post('/api/auth/logout').then(function () {
            store.clear();
            self.user = null;
            self.loginForm.password = '';
            self.loadKnown();
          });
        } else if (cmd === 'refresh') {
          this.$router = null;
          this.view = this.view; // 触发组件重建
          this.reloadCurrent();
        } else if (cmd === 'qr') {
          this.openQr();
        }
      },
      reloadCurrent: function () {
        // 通过切换 key 让当前视图组件重新 created，等价于刷新当前页
        var v = this.view;
        this.view = '';
        var self = this;
        this.$nextTick(function () { self.view = v; self.loadServer(); });
      },
      go: function (key) { this.view = key; },
      openQr: function () {
        var self = this;
        api.get('/api/admin/server/qrcode', null, { silent: true }).then(function (res) {
          if (!res.ok) { return; }
          self.qr = res;
          self.qrDialog = true;
        });
      }
    }
  });

  window.__admin = app;
})();
