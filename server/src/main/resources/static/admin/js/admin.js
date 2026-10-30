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
          isMerchant: isMerchant,
          fmt: fmt
        };
      },
      created: function () {
        this.load();
        if (isMerchant) { this.loadTypes(); }
      },
      methods: {
        /** 列表/详情里的头像：用户上传过的用照片，否则按角色给默认艺术头像 */
        avatarOfAccount: function (row) {
          return window.ZQProfile.src(row, isMerchant ? 'merchant' : 'buyer');
        },
        /**
         * 账号状态文案。商家新增了「临时停用（suspended + suspendUntil）」：
         * 到期由服务端自动恢复，所以这里要显示截止日期，别让运营以为被永久停用。
         */
        statusTextOf: function (row) {
          if (row.status === 'active') { return '正常'; }
          if (row.status === 'suspended') {
            return row.suspendUntil ? '停用至 ' + fmt.date(row.suspendUntil) : '临时停用';
          }
          return '已停用';
        },
        statusClass: function (row) {
          if (row.status === 'active') { return 'active'; }
          return row.status === 'suspended' ? 'suspended' : 'disabled';
        },
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
          var creating = !payload.id;

          // 新增前的必填校验：明确说出缺哪一项，别让用户对着「请填写商家姓名」猜。
          // （编辑走 PUT，后端只校验店铺名与电话，不要求重填账号密码。）
          if (creating) {
            var trimmed = function (v) { return String(v == null ? '' : v).trim(); };
            var missing = '';
            if (!trimmed(payload.account)) { missing = '登录账号'; }
            else if (trimmed(payload.password).length < 6) { missing = '密码（至少 6 位）'; }
            else if (isMerchant && !trimmed(payload.short)) { missing = '店铺名称'; }
            else if (!trimmed(isMerchant ? payload.contact : payload.name)) {
              missing = isMerchant ? '联系人姓名' : '昵称';
            }
            if (missing) {
              this.$message.warning('还有一项没填：' + missing);
              return;
            }
            payload.role = kind;
          } else {
            delete payload.password; // 编辑时不改密码，密码走「重置密码」
          }

          // 【字段映射】同一条数据在两套接口里用了不同的键名：
          //   创建（Accounts.create）  ← name / shopName / shopType
          //   列表、详情、更新          → contact / short / type
          // 以前少了这层适配，表单明明填了「联系人姓名」，后端读 name 仍是空，
          // 于是必然报「请填写联系人姓名」——新增商家永远失败。改键名前请先看两边的实现。
          if (isMerchant && creating) {
            payload.name = trimmed(payload.contact);
            payload.shopName = trimmed(payload.short);
            payload.shopType = payload.type;
            delete payload.contact;
            delete payload.short;
            delete payload.type;
          }

          this.saving = true;
          var req = creating ? api.post(base, payload) : api.put(base + '/' + payload.id, payload);
          req.then(function (res) {
            self.saving = false;
            if (!res.ok) { return; } // 失败原因已由 api.js 统一弹出中文提示
            self.$message.success(res.message || (creating ? '已新增' : '已保存'));
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
      return {
        loading: false,
        trendKey: 'amount',
        trendDays: 7,
        kpi: {}, newIn7d: {}, trend: [], trend30: [], statusDist: [], merchantRank: [], buyerRank: [], fmt: fmt
      };
    },
    created: function () { this.load(); },
    computed: {
      /** 趋势图当前展示的区间：7 天看近期波动，30 天看整月走势 */
      trendData: function () {
        return this.trendDays === 30 ? this.trend30 : this.trend;
      },
      trendColor: function () {
        return this.trendKey === 'amount' ? '#146B57'
          : (this.trendKey === 'orders' ? '#2F6BA8' : '#BE5230');
      },
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
          self.trend30 = res.trend30 || [];
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
        // 与后端 Dict.STATUS_TEXT 保持一致：新增 shipped / checked_in / completed / refunded；
        // used（已核销）仅作为历史数据兼容保留，不再作为可流转状态。
        statusText: {
          pending: '待确认', confirmed: '已确认', shipped: '已发货', checked_in: '已入住',
          completed: '已完成', used: '已核销', cancelled: '已取消', refunded: '已退款'
        },
        detailVisible: false, detail: {}, detailSaving: false, refunding: false,
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
      /** 打开订单详情：拉全量字段（含买卖双方电话）后再展示 */
      openDetail: function (row) {
        var self = this;
        api.get('/api/admin/orders/' + row.id).then(function (res) {
          if (!res.ok) { return; }
          self.detail = res.order || {};
          self.detailVisible = true;
        });
      },
      saveDetail: function () {
        var self = this;
        var d = this.detail;
        this.detailSaving = true;
        api.put('/api/admin/orders/' + d.id, {
          status: d.status, address: d.address, remark: d.remark,
          bookDate: d.bookDate, people: d.people
        }).then(function (res) {
          self.detailSaving = false;
          if (!res.ok) { return; }
          self.$message.success(res.message || '订单已更新');
          self.detailVisible = false;
          self.load();
        });
      },
      cancel: function (row) {
        var self = this;
        this.$confirm('强制取消订单会按规则回滚库存，确定继续？', '强制取消订单', { type: 'warning' }).then(function () {
          api.post('/api/admin/orders/' + row.id + '/cancel').then(function (res) {
            if (res.ok) { self.$message.success(res.message); self.load(); }
          });
        }).catch(function () { /* 取消 */ });
      },
      /**
       * 退款按钮的显示口径：本项目没有独立支付流水，下单即视为已付款；
       * 后端只拒绝「已取消 / 已退款」的订单，前端保持一致，
       * 这样商家尚未接单（pending）就产生纠纷时也能直接退款。
       */
      canRefund: function (row) {
        if (!row) { return false; }
        return ['refunded', 'cancelled'].indexOf(row.status) < 0;
      },
      /**
       * 管理员退款：本平台没有真实支付通道，退款只登记业务状态并通知买家。
       * 页面文案必须说清楚，避免运营误以为钱已经原路退回。
       */
      refund: function (row) {
        var self = this;
        this.$confirm(
          '退款后订单会标记为「已退款」，金额与时间会记录并通知买家。'
          + '本平台未接入真实支付通道，退款仅登记业务状态，请线下完成资金退回。确定继续？',
          '退款确认', { type: 'warning', confirmButtonText: '确认退款' }
        ).then(function () {
          self.refunding = true;
          api.post('/api/admin/orders/' + row.id + '/refund', {}).then(function (res) {
            self.refunding = false;
            if (!res.ok) { return; }
            self.$message.success(res.message || '退款已登记');
            self.load();
            // 详情弹窗开着时要重新拉一次，否则金额/状态还是退款前的
            if (self.detailVisible && String(self.detail.id) === String(row.id)) {
              self.openDetail({ id: row.id });
            }
          });
        }).catch(function () { /* 取消 */ });
      }
    }
  };

  /* ============================ 商品总览 ============================ */

  var viewProducts = {
    name: 'view-products',
    template: '#tpl-products',
    data: function () {
      return {
        loading: false, keyword: '', list: [], total: 0,
        editVisible: false, saving: false, form: {}, tagsText: '',
        fmt: fmt
      };
    },
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
      },
      openEdit: function (row) {
        var self = this;
        api.get('/api/admin/products/' + row.id).then(function (res) {
          if (!res.ok) { return; }
          self.fillForm(res.product || {});
          self.editVisible = true;
        });
      },
      /**
       * 把服务端商品详情灌进表单。
       * 价格/库存保持「原生数字输入 + 保存时显式 parse」，不在加载阶段悄悄 Number() 转换，
       * 避免把空值变成 0，掩盖真实的数据问题。
       */
      fillForm: function (product) {
        this.form = Object.assign({}, product);
        this.tagsText = (product.tags || []).join('，');
      },
      /**
       * 保存后重新 GET 详情回填：确认价格/库存/状态真的落库，而不是只改了前端内存。
       * 弹窗保持打开，运营可以当场核对服务端回读值。
       */
      syncDetail: function (id) {
        var self = this;
        api.get('/api/admin/products/' + id, null, { silent: true }).then(function (res) {
          if (!res || !res.ok || !res.product) { return; }
          self.fillForm(res.product);
        });
      },
      save: function () {
        var self = this;
        var f = this.form;
        var name = String(f.name == null ? '' : f.name).trim();
        // 显式 parse：原生 input 的 v-model 拿到的是字符串，直接丢给后端靠隐式转换容易出偏差。
        // 前端先转 Number 并挡掉空值/负数/小数库存，报错信息比后端的「参数非法」更好懂。
        var price = Number(String(f.price == null ? '' : f.price).trim());
        var stock = Number(String(f.stock == null ? '' : f.stock).trim());
        if (!name) { return this.$message.warning('商品名称不能为空'); }
        if (!isFinite(price) || price < 0) { return this.$message.warning('价格必须是 ≥0 的数字，例如 68 或 77.5'); }
        if (!isFinite(stock) || stock < 0 || Math.floor(stock) !== stock) { return this.$message.warning('库存必须是 ≥0 的整数'); }

        this.saving = true;
        api.put('/api/admin/products/' + f.id, {
          name: name, category: f.category, price: price, unit: f.unit,
          stock: stock, status: f.status,
          tags: String(this.tagsText || '').split(/[,，、\s]+/).filter(Boolean),
          intro: f.intro, desc: f.desc
        }).then(function (res) {
          self.saving = false;
          if (!res.ok) { return; }
          self.$message.success((res.message || '商品已更新') + '，已回读服务端数据');
          // 保持弹窗打开并回读详情，便于运营当场核对价格/库存/状态是否持久化
          self.syncDetail(f.id);
          self.load();
        });
      },
      /** 列表行内快捷上下架：只传 status，不碰其它字段，避免覆盖商家刚改过的价格 */
      toggleStatus: function (row) {
        var self = this;
        var target = row.status === 'on' ? 'off' : 'on';
        var tip = target === 'off'
          ? '下架后游客端商城立即看不到该商品（历史订单不受影响），确定下架？'
          : '上架后该商品会重新出现在游客端商城，确定上架？';
        this.$confirm(tip, target === 'off' ? '下架商品' : '上架商品', { type: 'warning' }).then(function () {
          api.put('/api/admin/products/' + row.id, { status: target }).then(function (res) {
            if (!res.ok) { return; }
            self.$message.success(res.message || (target === 'off' ? '已下架' : '已上架'));
            self.load();
          });
        }).catch(function () { /* 取消 */ });
      },
      /** 已下架的整行加浅色底，列表上一眼能区分 */
      rowClassName: function (row) {
        return row.status === 'off' ? 'row-off' : '';
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
        aiForm: { enabled: false, baseUrl: '', apiKey: '', model: 'deepseek-chat', systemPrompt: '', hasKey: false, keyMasked: '' },
        aiSaving: false, aiTesting: false,
        bookVisible: false, bookingActivity: {}, bookings: [], bookingSaving: false,
        covers: [
          '/assets/img/photos/spot-center.jpg', '/assets/img/photos/spot-linpan.jpg', '/assets/img/photos/spot-buxie.jpg',
          '/assets/img/photos/spot-rice.jpg', '/assets/img/photos/spot-museum.jpg', '/assets/img/photos/spot-study.jpg',
          '/assets/img/photos/spot-radish.jpg', '/assets/img/photos/spot-bookhouse.jpg',
          '/assets/img/photos/goods-douban.jpg', '/assets/img/photos/goods-ninebowls.jpg'
        ],
        /* 印章图标字典：与 assets/img/icons.svg 里的 <symbol id> 一一对应。
           以前是「印章单字」自由输入，游客端实际按图标 key 渲染，导致后台存汉字、
           前端只能按类型兜底；改成下拉后，后台存的就是 icons.svg 里真实存在的 key。 */
        stampIcons: [
          { key: 'i-stamp', name: '印章（默认）' },
          { key: 'i-info', name: '信息牌' },
          { key: 'i-home', name: '院落' },
          { key: 'i-craft', name: '非遗手作' },
          { key: 'i-rice', name: '稻穗' },
          { key: 'i-museum', name: '博物馆' },
          { key: 'i-book', name: '书院' },
          { key: 'i-radish', name: '萝卜' },
          { key: 'i-jar', name: '酱缸' },
          { key: 'i-tea', name: '茶' },
          { key: 'i-bamboo', name: '竹编' },
          { key: 'i-path', name: '林盘小径' },
          { key: 'i-market', name: '集市' },
          { key: 'i-leaf', name: '树叶' }
        ],
        /* 语音讲解包：传给语音模块的音色偏好，auto = 跟随设备最优中文音色 */
        voicePacks: [
          { value: 'auto', label: '自动（跟随设备最优音色）' },
          { value: 'male', label: '男声' },
          { value: 'female', label: '女声' }
        ]
      };
    },
    computed: {
      tableLabel: function () {
        return { spots: '点位', activities: '活动', knowledge: '知识条目' }[this.tab];
      }
    },
    created: function () { this.load(); if (this.tab === 'knowledge') { this.loadAi(); } },
    methods: {
      switchTab: function () { this.load(); if (this.tab === 'knowledge') { this.loadAi(); } },

      /* ---------- 活动人员管理（本模块统一维护全部预约信息） ---------- */
      openBookings: function (row) {
        var self = this;
        this.bookingActivity = row;
        this.bookings = [];
        this.bookVisible = true;
        api.get('/api/admin/activities/' + row.id + '/bookings').then(function (res) {
          if (!res.ok) { return; }
          self.bookingActivity = res.activity || row;
          self.bookings = res.list || [];
        });
      },
      saveBooking: function (b) {
        var self = this;
        this.bookingSaving = true;
        api.put('/api/admin/data/activityBookings/' + b.id, {
          userName: b.userName, phone: b.phone, people: b.people,
          date: b.date, remark: b.remark, status: b.status
        }).then(function (res) {
          self.bookingSaving = false;
          if (!res.ok) { return; }
          self.$message.success('人员信息已保存');
          self.openBookings(self.bookingActivity);
          self.load();
        });
      },
      removeBooking: function (b) {
        var self = this;
        this.$confirm('删除这条预约记录？删除后人数统计会同步减少。', '删除预约', { type: 'warning' }).then(function () {
          api.del('/api/admin/data/activityBookings/' + b.id).then(function (res) {
            if (res.ok) {
              self.$message.success(res.message);
              self.openBookings(self.bookingActivity);
              self.load();
            }
          });
        }).catch(function () { /* 取消 */ });
      },

      /* ---------- 大模型 API 配置（「AI 知识库」标签右侧那张卡） ----------
         保存走 PUT /api/admin/ai/config：密钥只写不读，读回来的是掩码，
         所以输入框里的 apiKey 只在「用户真的改了」时才会有值。 */
      loadAi: function () {
        var self = this;
        api.get('/api/admin/ai/config', null, { silent: true }).then(function (res) {
          if (!res || !res.ok) { return; }
          self.aiForm = {
            enabled: !!res.enabled,
            baseUrl: res.baseUrl || '',
            model: res.model || '',
            systemPrompt: res.systemPrompt || '',
            apiKey: '',
            hasKey: !!res.hasKey,
            keyMasked: res.keyMasked || ''
          };
        });
      },
      saveAi: function () {
        var self = this;
        var f = this.aiForm;
        // 前端先挡一道；真正的校验在服务端 —— 接口可以被直接调用，前端校验拦不住。
        if (f.enabled) {
          if (!/^https?:\/\//i.test(f.baseUrl || '')) { return this.$message.warning('接口地址必须以 http:// 或 https:// 开头'); }
          if (!f.model) { return this.$message.warning('请填写模型名称'); }
          if (!f.hasKey && !f.apiKey) { return this.$message.warning('启用大模型前请先填写 API Key'); }
        }
        if (f.apiKey && f.apiKey.length < 8) { return this.$message.warning('API Key 太短了，看起来不像有效的密钥'); }
        this.aiSaving = true;
        api.put('/api/admin/ai/config', {
          enabled: !!f.enabled, baseUrl: f.baseUrl, model: f.model,
          systemPrompt: f.systemPrompt, apiKey: f.apiKey
        }).then(function (res) {
          self.aiSaving = false;
          if (!res || !res.ok) { return; }
          self.$message.success(res.message || '已保存并立即生效');
          self.loadAi();
        });
      },
      testAi: function () {
        var self = this;
        this.aiTesting = true;
        api.post('/api/admin/ai/test').then(function (res) {
          self.aiTesting = false;
          if (!res || !res.ok) { return; }
          self.$alert(res.message, res.connected ? '连接成功' : '未启用 / 连接失败',
            { type: res.connected ? 'success' : 'warning' });
        });
      },
      clearAiKey: function () {
        var self = this;
        this.$confirm('清除后大模型会被停用（没有密钥无法启用），确定继续？', '清除 API Key', { type: 'warning' })
          .then(function () {
            api.put('/api/admin/ai/config', { enabled: false, clearKey: true }).then(function (res) {
              if (!res || !res.ok) { return; }
              self.$message.success('已清除密钥，并停用大模型');
              self.loadAi();
            });
          }).catch(function () { /* 取消 */ });
      },

      load: function () {
        var self = this;
        this.loading = true;
        api.get('/api/admin/data/' + this.tab).then(function (res) {
          self.loading = false;
          if (!res.ok) { return; }
          self.list = res.list || [];
          if (self.tab === 'activities') { self.fillBookingCounts(); }
        });
      },
      /** 活动列表补一列「已约人数」：这条数据只有预约表里有 */
      fillBookingCounts: function () {
        var self = this;
        api.get('/api/admin/bookings', null, { silent: true }).then(function (res) {
          if (!res.ok) { return; }
          var people = {};
          var count = {};
          (res.list || []).forEach(function (b) {
            if (b.status === 'cancelled') { return; }
            people[b.activityId] = (people[b.activityId] || 0) + (Number(b.people) || 1);
            count[b.activityId] = (count[b.activityId] || 0) + 1;
          });
          self.list.forEach(function (a) {
            self.$set(a, 'bookedPeople', people[a.id] || 0);
            self.$set(a, 'bookedCount', count[a.id] || 0);
          });
        });
      },
      openCreate: function () {
        this.form = this.tab === 'spots'
          ? { type: '自然人文', cover: this.covers[0], stamp: '纪念章', stampIcon: 'i-stamp', voice: 'auto' }
          : (this.tab === 'activities'
            ? { tag: '节庆', cover: this.covers[0], date: new Date().toISOString().slice(0, 10) }
            : {});
        this.tagsText = '';
        this.formVisible = true;
      },
      edit: function (row) {
        this.form = Object.assign({}, row);
        this.tagsText = (row.tags || []).join('，');
        if (this.tab === 'spots') {
          // 老点位没有 voice / stampIcon 新字段时给默认值，避免下拉框空白
          if (!this.form.stampIcon) { this.form.stampIcon = 'i-stamp'; }
          if (!this.form.voice) { this.form.voice = 'auto'; }
        }
        this.formVisible = true;
      },
      /** 判断是不是 icons.svg 里的图标 key（历史数据存的是单个汉字，不能直接当 key 拼 URL） */
      isStampIcon: function (key) {
        if (!key) { return false; }
        return this.stampIcons.some(function (ic) { return ic.key === key; });
      },
      stampIconUrl: function (key) {
        return '../assets/img/icons.svg#' + key;
      },
      stampIconLabel: function (key) {
        if (!key) { return '未设置'; }
        var hit = this.stampIcons.filter(function (ic) { return ic.key === key; })[0];
        return hit ? hit.name : '旧数据单字「' + key + '」';
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

  /* ============================ 举报中心 ============================ */

  /**
   * 举报中心：管理员在这里看用户举报、执行处理动作、审核商家上诉。
   *
   * 接口契约（由后端 ReportService / AdminReportController 提供）：
   *   GET  /api/admin/reports?status=&keyword=
   *   GET  /api/admin/reports/{id}
   *   POST /api/admin/reports/{id}/handle        { action, days?, productId?, orderId?, result }
   *   POST /api/admin/reports/{id}/appeal/handle { decision, result }
   *
   * 处理动作的业务副作用全部在服务端（停用商家会清会话、下架商品改 products.status、
   * 退款写 orders.refund* 并通知买家）；前端只负责把参数收齐、给出清楚的中文提示。
   */
  var viewReports = {
    name: 'view-reports',
    template: '#tpl-reports',
    data: function () {
      return {
        loading: false,
        status: 'pending',
        keyword: '',
        list: [],
        total: 0,
        // 后端 Dict.REPORT_STATUS_TEXT 的兜底副本：列表接口会带 statusText，
        // 这里只在字段缺失时使用，避免界面出现英文 key。
        statusText: { pending: '待处理', resolved: '已处理', appealed: '上诉审核中', appeal_resolved: '上诉已处理' },
        appealText: { pending: '待审核', upheld: '维持原处理', rejected: '改判' },
        actionText: {
          suspend_temp: '临时停用商家（N 天）',
          suspend_permanent: '永久停用商家',
          product_off: '下架违规商品',
          refund: '退款给客户',
          warning: '警告整改',
          none: '仅记录，不做处置'
        },
        detailVisible: false,
        detailLoading: false,
        detail: {},
        // 处理表单；商品/订单下拉在打开详情后按该举报商家拉取
        actionForm: { action: 'warning', days: 3, productId: '', orderId: '', result: '' },
        merchantProducts: [],
        merchantOrders: [],
        actionLoading: false,
        // 上诉审核表单
        appealForm: { decision: 'upheld', result: '' },
        appealLoading: false,
        previewVisible: false,
        previewSrc: '',
        fmt: fmt
      };
    },
    computed: {
      /** 只有待处理的举报才显示处置表单；已处理/上诉中的单据回显即可 */
      canHandle: function () {
        return !!this.detail && this.detail.status === 'pending';
      },
      /** 商家上诉后 appealStatus=pending，才出现「维持 / 改判」审核表单 */
      canReviewAppeal: function () {
        return !!this.detail && this.detail.appealStatus === 'pending';
      },
      /** 凭证图片统一归一化：服务端可能下发数组，也可能下发 JSON 字符串 */
      evidenceList: function () {
        return this.asList(this.detail.evidence);
      },
      appealEvidenceList: function () {
        return this.asList(this.detail.appealEvidence);
      }
    },
    created: function () { this.load(); },
    methods: {
      statusLabel: function (key) { return this.statusText[key] || key || '—'; },
      appealLabel: function (key) { return this.appealText[key] || key || '—'; },
      actionLabel: function (key) { return this.actionText[key] || key || '—'; },
      /** JSON 列在 Db 层通常已解析成数组，这里兼容未被解析的字符串形态 */
      asList: function (v) {
        if (!v) { return []; }
        if (Array.isArray(v)) { return v; }
        if (typeof v === 'string') {
          try {
            var arr = JSON.parse(v);
            return Array.isArray(arr) ? arr : [v];
          } catch (e) {
            return [v];
          }
        }
        return [];
      },
      load: function () {
        var self = this;
        this.loading = true;
        api.get('/api/admin/reports', { status: this.status, keyword: this.keyword }).then(function (res) {
          self.loading = false;
          if (!res.ok) { return; }
          self.list = res.list || [];
          self.total = res.total || self.list.length;
        });
      },
      resetForms: function () {
        this.actionForm = { action: 'warning', days: 3, productId: '', orderId: '', result: '' };
        this.appealForm = { decision: 'upheld', result: '' };
        this.merchantProducts = [];
        this.merchantOrders = [];
      },
      openDetail: function (row) {
        var self = this;
        this.detail = {};
        this.resetForms();
        this.detailLoading = true;
        this.detailVisible = true;
        api.get('/api/admin/reports/' + row.id).then(function (res) {
          self.detailLoading = false;
          if (!res || !res.ok) { self.detailVisible = false; return; }
          // 后端可能把主体放在 report / item / data，或直接平铺；这里归一化一次，
          // 联调时字段位置有出入也不用改模板。
          var d = res.report || res.item || res.data || res;
          self.detail = d || {};
          // 关联对象兼容 order / orderInfo 两种命名，取不到时模板会退化成「仅显示 id」
          if (!self.detail.order && self.detail.orderInfo) {
            self.$set(self.detail, 'order', self.detail.orderInfo);
          }
          if (!self.detail.product && self.detail.productInfo) {
            self.$set(self.detail, 'product', self.detail.productInfo);
          }
          if (self.detail.productId) { self.actionForm.productId = self.detail.productId; }
          if (self.detail.orderId) { self.actionForm.orderId = self.detail.orderId; }
          self.loadMerchantRefs();
        });
      },
      /**
       * 拉取该举报商家名下的商品与订单，供「下架 / 退款」下拉选择。
       * 复用现有全平台列表接口（先按商家名模糊过滤，再按 merchantId 精确收窄），
       * 不新增接口，也不会把别的商家的商品/订单带进下拉。
       */
      loadMerchantRefs: function () {
        var self = this;
        var d = this.detail || {};
        var merchantId = d.merchantId == null ? '' : String(d.merchantId);
        var keyword = d.merchantName || '';
        api.get('/api/admin/products', { keyword: keyword }, { silent: true }).then(function (res) {
          if (!res || !res.ok) { return; }
          var list = res.list || [];
          self.merchantProducts = merchantId
            ? list.filter(function (p) { return String(p.merchantId) === merchantId; })
            : list;
        });
        api.get('/api/admin/orders', { keyword: keyword }, { silent: true }).then(function (res) {
          if (!res || !res.ok) { return; }
          var list = res.list || [];
          self.merchantOrders = merchantId
            ? list.filter(function (o) { return String(o.merchantId) === merchantId; })
            : list;
        });
      },
      submitHandle: function () {
        var self = this;
        var f = this.actionForm;
        var result = String(f.result == null ? '' : f.result).trim();
        var body = { action: f.action, result: result };
        if (!result) { return this.$message.warning('请填写处理结果：这段文字会同时通知举报人与商家'); }
        if (f.action === 'suspend_temp') {
          var days = Number(String(f.days == null ? '' : f.days).trim());
          if (!isFinite(days) || Math.floor(days) !== days || days < 1 || days > 365) {
            return this.$message.warning('临时停用天数必须是 1–365 的整数');
          }
          body.days = days;
        }
        if (f.action === 'product_off') {
          if (!f.productId) { return this.$message.warning('请先选择要下架的违规商品'); }
          body.productId = f.productId;
        }
        if (f.action === 'refund') {
          if (!f.orderId) { return this.$message.warning('请先选择要退款的订单'); }
          body.orderId = f.orderId;
        }
        // 永久停用不可逆，单独二次确认
        if (f.action === 'suspend_permanent') {
          this.$confirm('永久停用商家会立即踢下线且无法自行恢复，确定继续？', '永久停用确认', { type: 'warning' })
            .then(function () { self.doHandle(body); }).catch(function () { /* 取消 */ });
          return;
        }
        this.doHandle(body);
      },
      doHandle: function (body) {
        var self = this;
        this.actionLoading = true;
        api.post('/api/admin/reports/' + this.detail.id + '/handle', body).then(function (res) {
          self.actionLoading = false;
          if (!res || !res.ok) { return; }
          self.$message.success(res.message || '举报已处理，已通知举报人与商家');
          self.detailVisible = false;
          self.load();
        });
      },
      submitAppeal: function () {
        var self = this;
        var result = String(this.appealForm.result == null ? '' : this.appealForm.result).trim();
        if (!this.canReviewAppeal) { return this.$message.warning('这条举报当前没有待审核的上诉'); }
        if (!result) { return this.$message.warning('请填写上诉审核结果'); }
        this.appealLoading = true;
        api.post('/api/admin/reports/' + this.detail.id + '/appeal/handle', {
          decision: this.appealForm.decision,
          result: result
        }).then(function (res) {
          self.appealLoading = false;
          if (!res || !res.ok) { return; }
          self.$message.success(res.message || '上诉已审核');
          self.detailVisible = false;
          self.load();
        });
      },
      previewImage: function (src) {
        this.previewSrc = src;
        this.previewVisible = true;
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

  // 图表组件必须【全局】注册。
  // 原因：它们是在 view-summary 的模板里用的，而 view-summary 是根实例的子组件；
  // Vue 2 只让「局部 components」在注册它的那个实例的模板里可用，子组件解析不到。
  // 生产版 vue.min.js 不会打印「Unknown custom element」，于是四个图表区一直是
  // 空白卡片、控制台却没有任何报错 —— 这个坑真实存在过，别把下面四行改回 components。
  Vue.component('zq-line', window.ZQCharts.LineChart);
  Vue.component('zq-donut', window.ZQCharts.Donut);
  Vue.component('zq-bars', window.ZQCharts.Bars);
  Vue.component('zq-spark', window.ZQCharts.Spark);

  var app = new Vue({
    el: '#app',
    components: {
      'view-summary': viewSummary,
      'view-merchants': accountComponent('merchant', '#tpl-merchants'),
      'view-buyers': accountComponent('buyer', '#tpl-buyers'),
      'view-orders': viewOrders,
      'view-products': viewProducts,
      'view-reports': viewReports,
      'view-content': viewContent,
      'view-server': viewServer
    },
    data: function () {
      return {
        loading: false,
        view: 'summary',
        pwdVisible: false,
        pwdSaving: false,
        pwdForm: { old: '', new: '', confirm: '' },
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
        // 主题：初值由 ZQTheme 决定（head 里已应用过一次）
        themeMode: (window.ZQTheme ? window.ZQTheme.get() : 'light'),
        fmt: fmt,
        menus: [
          { key: 'summary', name: '运营概览', icon: 'el-icon-data-line', desc: '平台整体经营数据' },
          { key: 'merchants', name: '商家管理', icon: 'el-icon-s-shop', desc: '账号开通、资料、停用与删除' },
          { key: 'buyers', name: '买家管理', icon: 'el-icon-user', desc: '游客账号与消费数据' },
          { key: 'orders', name: '订单总览', icon: 'el-icon-tickets', desc: '全平台订单与强制取消' },
          { key: 'products', name: '商品总览', icon: 'el-icon-goods', desc: '全平台商品清单' },
          { key: 'reports', name: '举报中心', icon: 'el-icon-warning-outline', desc: '用户举报处理与商家上诉审核' },
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
      avatarUrl: function () {
        var profile = (this.user && this.user.profile) || {};
        return window.ZQProfile.avatarOf(profile);
      },
      /* 没上传照片时用管理员专属艺术头像（印中山河） */
      avatarSrc: function () {
        var profile = (this.user && this.user.profile) || {};
        return window.ZQProfile.src(profile, 'admin');
      },
      initial: function () {
        return window.ZQProfile.initials(this.user && this.user.name);
      },
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
      // 订阅主题变化：其它标签页/其它端改了主题，本页选中态跟着更新
      if (window.ZQTheme) {
        this.themeMode = window.ZQTheme.get();
        this._themeOff = window.ZQTheme.onChange(function (mode) { self.themeMode = mode; });
      }
      this.bootstrap();
    },
    beforeDestroy: function () {
      if (this._themeOff) { this._themeOff(); this._themeOff = null; }
    },
    methods: {
      /** 切换主题：样式应用在 ZQTheme，这里只同步选中态 */
      setTheme: function (mode) {
        if (!window.ZQTheme) { return; }
        this.themeMode = window.ZQTheme.set(mode);
      },
      /** 登录页「登录过的账号」卡片头像 */
      knownAvatar: function (a) {
        return window.ZQProfile.src(a, 'admin');
      },
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
      /* ---------------- 个人资料（头像 / 改密） ---------------- */
      pickAvatar: function () {
        if (this.$refs.adminAvatar) { this.$refs.adminAvatar.click(); }
      },
      onAvatarPick: function (e) {
        var self = this;
        var file = (e.target.files || [])[0];
        e.target.value = '';
        if (!file) { return; }
        window.ZQProfile.compress(file, function (dataUrl) {
          if (!dataUrl) { return self.$message.error('图片读取失败，换一张试试'); }
          window.ZQProfile.upload(dataUrl).then(function (res) {
            if (!res.ok) { return; }
            self.$set(self.user, 'profile', Object.assign({}, self.user.profile, { avatar: dataUrl }));
            self.$message.success('头像已更新');
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
        if (!f.old) { return this.$message.warning('请填写原密码'); }
        if (!f.new || f.new.length < 6) { return this.$message.warning('新密码至少 6 位'); }
        if (f.new !== f.confirm) { return this.$message.warning('两次输入的新密码不一致'); }
        this.pwdSaving = true;
        api.post('/api/auth/password', { oldPassword: f.old, newPassword: f.new }).then(function (res) {
          self.pwdSaving = false;
          if (!res.ok) { return; }
          self.pwdVisible = false;
          self.$message.success(res.message || '密码已修改');
        });
      },

      onUserCommand: function (cmd) {
        var self = this;
        if (cmd === 'avatar') { this.pickAvatar(); return; }
        if (cmd === 'password') { this.openPwd(); return; }
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
