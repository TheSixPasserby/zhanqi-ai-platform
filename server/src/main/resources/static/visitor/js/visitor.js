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
  /* 订单状态：在原有 4 个的基础上补齐商家发货/入住/完成/退款（旧 used 保留兼容） */
  var STATUS_TEXT = {
    pending: '待确认', confirmed: '已确认', shipped: '已发货', checked_in: '已入住',
    completed: '已完成', used: '已核销', cancelled: '已取消', refunded: '已退款',
  };
  var STATUS_CLASS = {
    pending: 'tag-warn', confirmed: 'tag-info', shipped: 'tag-info', checked_in: 'tag-info',
    completed: 'tag-ok', used: 'tag-ok', cancelled: 'tag-muted', refunded: 'tag-danger',
  };

  /* 预约类商品的默认场次/房型：后端 products.timeSlots / roomTypes 为空时前端兜底，
     与 PC 端保持同一套文案，避免两端看到的可选项不一样。 */
  var BOOKING_SLOTS = {
    study: ['上午场 09:00-11:30', '下午场 14:00-16:30'],
    experience: ['上午 09:30-11:00', '下午 14:30-16:00'],
  };
  var HOMESTAY_ROOMS = ['标准间', '大床房', '家庭房'];

  /* 举报分类兜底：GET /api/reports/categories 拿不到时先把界面画出来，提交仍以后端为准 */
  var REPORT_FALLBACK = [
    { key: 'service', name: '商家服务态度问题', reasons: ['客服不回复', '态度恶劣', '拒绝沟通', '辱骂用户'] },
    { key: 'product', name: '商品问题', reasons: ['实物与描述不符', '质量问题', '缺斤少两', '虚假宣传'] },
    { key: 'logistics', name: '发货物流问题', reasons: ['迟迟不发货', '物流信息造假', '包裹丢失 / 损坏', '运费纠纷'] },
    { key: 'money', name: '钱款纠纷', reasons: ['拒绝退款', '私下收款', '价格欺诈'] },
    { key: 'fraud', name: '商家欺诈', reasons: ['虚假交易', '诱导线下交易', '售卖假货', '刷单炒信'] },
  ];
  var REPORT_STATUS = {
    pending: '待处理', resolved: '已处理', appealed: '上诉审核中',
    appeal_resolved: '已处理', closed: '已关闭',
  };
  var REPORT_PROGRESS = { pending: '32%', appealed: '66%', resolved: '100%', appeal_resolved: '100%', closed: '100%' };

  /* ---------------------- 后端返回形态兼容小工具 ----------------------
     本次改造后端与 H5 是并行开发的，接口字段可能在不同阶段略有出入
     （例如列表叫 list 还是 reports、节点叫 nodes 还是 logisticsNodes）。
     这里统一做一次归一化，页面模板只认一套字段，避免每加一个字段就改模板。 */

  function listOf(res, keys) {
    if (!res) { return []; }
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(res[keys[i]])) { return res[keys[i]]; }
    }
    return [];
  }

  /** products.timeSlots / roomTypes 在库里是 JSON 文本，既要兼容数组也要兼容逗号串 */
  function parseJsonList(v) {
    if (!v) { return []; }
    if (Array.isArray(v)) { return v; }
    if (typeof v === 'string') {
      try {
        var parsed = JSON.parse(v);
        if (Array.isArray(parsed)) { return parsed; }
      } catch (e) { /* 不是 JSON，按分隔符拆 */ }
      return v.split(/[,，|]/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    return [];
  }

  function normalizeCategory(c) {
    if (!c) { return null; }
    var key = c.key || c.code || c.value || c.id || '';
    var name = c.name || c.text || c.label || c.title || key;
    var raw = c.reasons || c.children || c.items || c.subs || c.options || [];
    var reasons = (Array.isArray(raw) ? raw : []).map(function (r) {
      if (typeof r === 'string') { return { key: r, text: r }; }
      var text = r.text || r.name || r.label || r.title || r.key || r.code || '';
      return { key: r.key || r.code || r.value || text, text: text };
    }).filter(function (r) { return !!r.text; });
    return { key: key, name: name, reasons: reasons };
  }

  function normalizeCategories(res) {
    if (!res || !res.ok) { return []; }
    var list = listOf(res, ['categories', 'list', 'dict']);
    return list.map(normalizeCategory).filter(function (c) { return c && c.key; });
  }

  /** 聊天消息：兼容 fromRole/role、text/content、media/image 等命名 */
  function normalizeMsg(m) {
    if (!m) { return { type: 'text', fromRole: 'merchant', text: '' }; }
    var role = m.fromRole || m.role || m.sender || m.from || '';
    if (role !== 'buyer' && role !== 'merchant') { role = 'merchant'; }
    return {
      id: m.id,
      type: m.type || 'text',
      fromRole: role,
      text: m.text || m.content || '',
      media: m.media || m.image || m.imageUrl || m.url || '',
      productId: m.productId || (m.product && m.product.id) || '',
      orderId: m.orderId || (m.order && m.order.id) || '',
      product: m.product || null,
      order: m.order || null,
      createdAt: m.createdAt || m.at || m.time || '',
    };
  }

  /** 物流：后端返回 {company,trackingNo,status,statusText,nodes:[{text,time,done}],progress:0-3} */
  function normalizeLogistics(res) {
    var nodes = listOf(res, ['nodes', 'logisticsNodes', 'list']).map(function (n) {
      if (typeof n === 'string') { return { text: n, time: '', done: true }; }
      return {
        text: n.text || n.desc || n.content || n.statusText || n.status || '物流更新',
        time: n.time || n.at || n.createdAt || '',
        done: n.done !== false,
      };
    });
    var progress = Number(res.progress);
    if (!isFinite(progress)) {
      var doneCount = nodes.filter(function (n) { return n.done; }).length;
      progress = doneCount - 1;
    }
    progress = Math.max(0, Math.min(3, progress));
    return {
      company: res.company || res.logisticsCompany || '',
      trackingNo: res.trackingNo || '',
      statusText: res.statusText || res.status || '',
      progress: progress,
      stops: ['已揽收', '运输中', '派送中', '已签收'],
      nodes: nodes,
    };
  }

  /**
   * 把用户选的图片压成最长边 900px 的 JPEG dataURL，并尽量压到 400KB 以内。
   * 聊天图片与举报凭证都直接存 dataURL 进库，不压的话一张手机原图就能把库撑大。
   * @param {File} file
   * @param {function(string|null)} done 失败返回 null，调用方提示换一张
   */
  function compressImage(file, done) {
    if (!file) { return done(null); }
    if (file.type && file.type.indexOf('image/') !== 0) { return done(null); }
    var reader = new FileReader();
    reader.onerror = function () { done(null); };
    reader.onload = function (e) {
      var img = new Image();
      img.onerror = function () { done(null); };
      img.onload = function () {
        var maxSide = 900;
        var scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; // PNG 透明底转 JPEG 会变黑，先铺白
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        var url = canvas.toDataURL('image/jpeg', 0.82);
        var q = 0.82;
        while (url.length > 400 * 1024 && q > 0.4) {
          q -= 0.12;
          url = canvas.toDataURL('image/jpeg', q);
        }
        done(url.length > 400 * 1024 ? null : url);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

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
        total: 14,
        allDone: false,
        loadingSpots: true,
        spotTab: 'spots',

        /* 个人资料：头像与改密弹窗 */
        me: {},
        pwdVisible: false,
        pwdSaving: false,
        pwdForm: { old: '', new: '', confirm: '' },
        current: {},
        // 主题：'light' | 'dark'（初值由 ZQTheme 决定，head 里已应用过一次）
        themeMode: (window.ZQTheme ? window.ZQTheme.get() : 'light'),
        themeOptions: (window.ZQTheme ? window.ZQTheme.options : []),
        // 桌面顶部导航（宽屏才显示，样式见 visitor.css 的 @media(min-width:1024px)）
        // 文字必须包在 span 里：窄屏靠 CSS 把它隐藏，只留图标，否则 8 项会挤成一团
        navLinks: [
          { view: 'home', text: '首页', icon: 'i-home' },
          { view: 'spots', text: '点位打卡', icon: 'i-stamp' },
          { view: 'shop', text: '商城', icon: 'i-shop' },
          { view: 'activities', text: '活动', icon: 'i-calendar' },
          { view: 'orders', text: '我的订单', icon: 'i-ticket' },
          { view: 'map', text: '村内地图', icon: 'i-map' },
          { view: 'ai', text: 'AI 助手', icon: 'i-ai' },
          { view: 'plan', text: '行程规划', icon: 'i-route' },
        ],
        // 头像悬浮菜单：与商家端 / 管理端保持同一套（带图标、无「修改密码」——
        // 改密是个人中心里的操作，不该混进导航菜单）
        userMenus: [
          { view: 'mine', text: '个人中心', icon: 'i-user' },
          { view: 'orders', text: '我的订单', icon: 'i-ticket' },
          { view: 'chatList', text: '我的消息', icon: 'i-mail' },
          { view: 'reports', text: '举报中心', icon: 'i-shield' },
          { view: '', text: '退出登录', icon: 'i-close', danger: true },
        ],

        // 村内地图
        mapKind: 'all', mapInstance: null,
        mapFocus: null,          // 从详情页跳过来时要对准的坐标 {x,y}
        detailMapInstance: null, // 详情页里的小地图（与全图分开，避免互相抢同一个节点）
        mapFilters: [
          { key: 'all', text: '全部' }, { key: 'spot', text: '点位' },
          { key: 'study', text: '研学' }, { key: 'homestay', text: '民宿' },
          { key: 'experience', text: '农事' }, { key: 'activity', text: '活动' },
        ],
        spotGalleryIndex: 0,     // 点位图集当前第几张
        spotGalleryTimer: null,  // 点位图集自动轮播定时器
        productGalleryIndex: 0,  // 商品图集当前第几张
        speaking: false,
        showScript: false,
        voiceName: '',       // 当前语音音色名（语音讲解卡片右上角展示）

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
        currentAct: {},
        actLoading: false,
        actForm: { date: '', people: 2, phone: '', remark: '' },
        myBookings: [],

        /* 订单 */
        orders: [],
        loadingOrders: true,
        orderStatusFilter: '',
        statuses: [
          { key: '', text: '全部' },
          { key: 'pending', text: '待确认' },
          { key: 'confirmed', text: '已确认' },
          { key: 'shipped', text: '已发货' },
          { key: 'checked_in', text: '已入住' },
          { key: 'completed', text: '已完成' },
          { key: 'cancelled', text: '已取消' },
          { key: 'refunded', text: '已退款' },
        ],
        checkoutMode: false,
        submitting: false,

        /* 订单详情 / 物流 / 拒绝协商 */
        orderDetail: {},
        orderDetailLoading: false,
        orderLogs: [],
        logistics: null,
        rejectFeedback: '',
        buyerDeciding: false,
        receiving: false,

        /* 商品详情：发布商家 + 四类购买表单 */
        productMerchant: {},
        productSlots: [],
        productRooms: [],
        bookingSlot: '',
        checkOutDate: '',
        roomType: '',

        /* 商家主页 */
        merchantHome: {},
        merchantHomeProducts: [],
        merchantHomeLoading: false,

        /* 商家客服聊天 */
        chatMerchant: {},
        chatMessages: [],
        chatText: '',
        chatOnline: false,
        chatPeerTyping: false,
        chatLoading: false,
        chatSending: false,
        chatPanel: false,
        chatPicker: '',
        chatProducts: [],
        chatTimer: null,
        chatLastTyping: 0,
        chatThreads: [],          // 我的消息：会话列表
        chatThreadsLoading: false,

        /* 举报中心 */
        reportsTab: 'mine',
        reportCategories: [],
        reportMine: [],
        reportMineLoading: false,
        reportForm: { merchantId: '', merchantName: '', category: '', reason: '', content: '' },
        reportEvidence: [],
        reportSubmitting: false,

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

      /** 最后一条回答说完、且不在思考中，才显示「猜你想问」 */
      showFollowUps: function () {
        var last = this.messages[this.messages.length - 1];
        return !!last && last.role === 'assistant' && !last.streaming && !this.thinking;
      },

      /** 与电脑端同一套规则：按问答命中的关键词给 4 条追问，不足用常见问题补齐 */
      followUps: function () {
        var q = '';
        for (var i = this.messages.length - 1; i >= 0; i--) {
          if (this.messages[i].role === 'user') { q = this.messages[i].text || ''; break; }
        }
        var last = this.messages[this.messages.length - 1];
        var text = q + ' ' + (last ? (last.text || '') : '');
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
        for (var a = 0; a < pool.length; a++) {
          if (out.length >= 4) { break; }
          for (var b = 0; b < pool[a].k.length; b++) {
            if (text.indexOf(pool[a].k[b]) >= 0) { out.push(pool[a].q); break; }
          }
        }
        for (var c = 0; c < pool.length && out.length < 4; c++) {
          if (out.indexOf(pool[c].q) < 0) { out.push(pool[c].q); }
        }
        return out.slice(0, 4);
      },

      avatarUrl: function () {
        return window.ZQProfile.avatarOf(this.me);
      },

      /* 有自定义照片就用照片，没有就用游客端的默认艺术头像（斗笠与竹影） */
      avatarSrc: function () {
        return this.avatarUrl || window.ZQProfile.defaultFor('buyer');
      },

      /* 会话列表 / 聊天页的商家默认头像 */
      defaultAvatar: function () {
        return window.ZQProfile.defaultFor('merchant');
      },

      /** 集章百分比：clamp 到 [0,100]，total 无效时按实际点位数兜底 */
      percent: function () {
        var total = Number(this.total);
        var got = Number(this.collected);
        if (!isFinite(total) || total <= 0) {
          total = (this.spots || []).length;
        }
        if (!isFinite(got) || got < 0) { got = 0; }
        if (!isFinite(total) || total <= 0) { return 0; }
        var p = Math.round(got / total * 100);
        return Math.max(0, Math.min(100, p));
      },

      /* 集章扇形图：每个点位一段，已打卡的那段点亮。
         以前中间是个「印」字、外面是 conic-gradient 圆环，既像文字占位，也看不出细粒度进度。

         三处必须注意（都踩过）：
           1. 段数以服务端下发的 total 为准，不能用 spots.length —— 点位列表还没回来、
              将来加了筛选或分页时，段数会和「x / N 枚」的 N 悄悄对不上。
           2. 点亮判定优先用点位自带的 checked（与列表、印章墙同一数据源），
              印章接口还没返回或失败时，不会出现「数字变了、扇形图没变」。
           3. 纯 SVG 路径绘制，不依赖任何图表库，也不依赖 conic-gradient
              （OpenGL 缺失、旧安卓 WebView 上 conic-gradient 会整块不显示）。 */
      /**
       * 集章扇形图：每个点位一段。
       *
       * 【2026-10-28 修复】旧实现有三个真实缺陷：
       *   1. 点亮判定用 spots[i] 按下标取点位 —— 接口顺序一变或数组里缺项，
       *      就会出现「数字是 5 枚、亮的位置却错乱」；现在改成按 id 建索引，与下标无关。
       *   2. total 与 spots.length 脱钩：spots 还没回来时 total 已有值，于是全都判成未打卡（0%），
       *      但文案仍显示「x / 14」。现在段数取 Math.min(total, spots.length)，两者不一致时以实际点位为准。
       *   3. collected > total（历史脏数据 / 并发打卡）会让百分比 >100%；现在 clamp 到 [0, 100]。
       *
       * 边界：total<=0 或没有任何点位时返回空数组，页面据 ringEmpty 显示「暂无点位」占位，
       * 而不是画一个空圈让人以为是 0 进度。
       */
      ringSegments: function () {
        var spots = this.spots || [];
        var declared = Number(this.total);
        if (!isFinite(declared) || declared < 0) { declared = 0; }
        // 段数以「真实拿到的点位」为准，避免 total 有值而 spots 为空时全灰
        var total = spots.length > 0 ? Math.min(declared || spots.length, spots.length) : 0;
        if (total <= 0) { return []; }
        // 段数过多时视觉不可辨（每段 < 2°），此时按比例只画 60 段粗粒度环
        var segments = Math.min(total, 60);
        var step = 360 / segments;
        var gap = Math.min(3.2, step * 0.2);
        // 已打卡点位集合：优先用点位自带的 checked，其次用印章记录（两者同一数据源，互为兜底）
        var done = {};
        (this.stamps || []).forEach(function (s) {
          if (s && s.spotId) { done[s.spotId] = true; }
        });
        var litCount = 0;
        for (var k = 0; k < spots.length; k++) {
          if (spots[k] && (spots[k].checked || done[spots[k].id])) { litCount++; }
        }
        // 点亮段数按真实打卡比例映射到 segments 段上（total<=60 时一一对应）
        var litSegments = total <= 60 ? litCount : Math.round(litCount / total * segments);
        var out = [];
        for (var i = 0; i < segments; i++) {
          var a0 = i * step - 90 + gap / 2;
          var a1 = (i + 1) * step - 90 - gap / 2;
          out.push({
            d: window.ZQSpotIcons.ringSegment(64, 64, 60, 45, a0, a1),
            checked: i < litSegments
          });
        }
        return out;
      },

      /** 扇形图是否应显示「暂无点位」占位（点位没加载到 / 总数为 0） */
      ringEmpty: function () {
        return !this.ringSegments.length;
      },

      /* 首页功能宫格：按需求把「我的订单」放在「活动日历」与「AI 助手」之间 */
      entries: function () {
        return [
          { key: 'spots', text: '点位打卡', icon: 'i-stamp', view: 'spots', tab: true, bg: '#E6F2ED', color: '#146B57' },
          { key: 'booking', text: '研学民宿', icon: 'i-bed', view: 'booking', bg: '#EAF1F9', color: '#2F6BA8' },
          { key: 'acts', text: '活动日历', icon: 'i-calendar', view: 'activities', bg: '#F1EEE7', color: '#5C6B65' },
          { key: 'orders', text: '我的订单', icon: 'i-ticket', view: 'orders', bg: '#E8F4EE', color: '#2C7A57' },
          { key: 'ai', text: 'AI 助手', icon: 'i-ai', view: 'ai', bg: '#FBEDE7', color: '#BE5230' },
          { key: 'plan', text: '行程规划', icon: 'i-map', view: 'plan', bg: '#FCF4E2', color: '#B07A18' },
        ];
      },

      menus: function () {
        return [
          { key: 'orders', text: '我的订单', desc: '查看订单状态与取消', icon: 'i-ticket', view: 'orders', bg: '#E6F2ED', color: '#146B57' },
          { key: 'wall', text: '我的印章墙', desc: '集齐全部印章领纪念品', icon: 'i-stamp', view: 'spots', tab: true, bg: '#FBEDE7', color: '#BE5230' },
          { key: 'ai', text: 'AI 文旅助手', desc: '问村内的事，有知识库出处', icon: 'i-ai', view: 'ai', bg: '#EAF1F9', color: '#2F6BA8' },
          { key: 'plan', text: 'AI 行程规划', desc: '按偏好编排 1-3 天路线', icon: 'i-map', view: 'plan', bg: '#FCF4E2', color: '#B07A18' },
          { key: 'map', text: '战旗村地图', desc: '点位、民宿、研学与活动位置', icon: 'i-map', view: 'map', bg: '#E8F1F7', color: '#2C5F7A' },
          { key: 'acts', text: '村内活动日历', desc: '非遗节庆与农事体验', icon: 'i-calendar', view: 'activities', bg: '#F1EEE7', color: '#5C6B65' },
          { key: 'shop', text: '去逛商城', desc: '农产文创好物', icon: 'i-shop', view: 'shop', tab: true, bg: '#E8F4EE', color: '#2C7A57' },
          { key: 'reports', text: '举报中心', desc: '商家违规反馈与处理进度', icon: 'i-shield', view: 'reports', bg: '#FBEDE7', color: '#BE5230' },
        ];
      },

      /* -------------------- 村内地图 -------------------- */
      mapMarkers: function () {
        var list = [];
        (this.spots || []).forEach(function (s) {
          if (s.mapX == null || s.mapY == null) { return; }
          list.push({ key: 'spot-' + s.id, kind: 'spot', refId: s.id, name: s.name,
            subtitle: (s.type || '点位') + ' · ' + (s.location || ''),
            cover: s.cover, x: Number(s.mapX), y: Number(s.mapY) });
        });
        (this.products || []).forEach(function (p) {
          if (p.mapX == null || p.mapY == null) { return; }
          if (p.category === 'goods') { return; }
          list.push({ key: p.category + '-' + p.id, kind: p.category, refId: p.id, name: p.name,
            subtitle: (p.categoryText || '') + ' · ¥' + p.price + '/' + (p.unit || '份'),
            cover: p.cover, x: Number(p.mapX), y: Number(p.mapY) });
        });
        (this.activities || []).forEach(function (a) {
          if (a.mapX == null || a.mapY == null) { return; }
          list.push({ key: 'act-' + a.id, kind: 'activity', refId: a.id, name: a.title,
            subtitle: (a.tag || '活动') + ' · ' + (a.date || ''),
            cover: a.cover, x: Number(a.mapX), y: Number(a.mapY) });
        });
        if (this.mapKind === 'all') { return list; }
        var kind = this.mapKind;
        return list.filter(function (m) { return m.kind === kind; });
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

      /* 物流小车位置：progress 0-3 对应 4 个节点，轨道按百分比定位 */
      truckLeft: function () {
        var p = this.logistics ? Number(this.logistics.progress) || 0 : 0;
        return (4 + Math.max(0, Math.min(3, p)) * 29) + '%';
      },

      truckWidth: function () {
        var p = this.logistics ? Number(this.logistics.progress) || 0 : 0;
        return (Math.max(0, Math.min(3, p)) / 3) * 100 + '%';
      },

      /* 聊天顶部状态：输入中 > 在线 / 离线 */
      chatPeerText: function () {
        if (this.chatPeerTyping) { return '对方正在输入…'; }
        return this.chatOnline ? '在线中' : '离线中';
      },

      /* 当前商家的订单（聊天「订单」面板用；必须用 computed，模板里才能读 .length） */
      chatOrders: function () {
        var id = this.chatMerchant && this.chatMerchant.id;
        if (!id) { return []; }
        return (this.orders || []).filter(function (o) { return o.merchantId === id; });
      },

      /* 举报可选商家：从我的订单 + 当前聊天/商家主页里汇总，去重 */
      reportMerchantOptions: function () {
        var seen = {};
        var out = [];
        var push = function (id, name) {
          if (!id || seen[id]) { return; }
          seen[id] = true;
          out.push({ id: id, name: name || ('商家 ' + id) });
        };
        (this.orders || []).forEach(function (o) { push(o.merchantId, o.merchantName); });
        push(this.chatMerchant && this.chatMerchant.id, this.chatMerchant && this.chatMerchant.name);
        push(this.merchantHome && this.merchantHome.id, this.merchantHome && this.merchantHome.name);
        return out;
      },

      /* 当前选中违规分类下的细因由 */
      reportReasons: function () {
        var key = this.reportForm.category;
        var cat = (this.reportCategories || []).filter(function (c) { return c.key === key; })[0];
        return cat ? (cat.reasons || []) : [];
      },
      /* -------------------- 图集：点位轮播 / 商品翻页（computed） -------------------- */
      /** 当前点位图集：后端 images 已含 cover 兜底；只有 1 张时不轮播 */
      spotImages: function () {
        var c = this.current || {};
        var list = (c.images || []).filter(function (x) { return !!x; });
        if (!list.length && c.cover) { list = [c.cover]; }
        return list;
      },
      spotGalleryImage: function () {
        var list = this.spotImages;
        if (!list.length) { return ''; }
        var i = Math.min(Math.max(0, this.spotGalleryIndex || 0), list.length - 1);
        return list[i];
      },
      /** 当前商品图集：同上 */
      productImages: function () {
        var pr = this.product || {};
        var list = (pr.images || []).filter(function (x) { return !!x; });
        if (!list.length && pr.cover) { list = [pr.cover]; }
        return list;
      },
      productGalleryImage: function () {
        var list = this.productImages;
        if (!list.length) { return ''; }
        var i = Math.min(Math.max(0, this.productGalleryIndex || 0), list.length - 1);
        return list[i];
      },
    },

    /* 离开点位详情就停朗读。
       这一条是「退出登录后语音还在念」的根治办法：退出登录 / 令牌过期被踢回登录页，
       都会把 view 改回 'home'，于是这里立刻停；不用在每处跳转都记得手动调 stop。
       只挂在 view 上，不挂 viewStack —— 返回栈变化本身不改变当前页面。 */
    watch: {
      // 分类切换只换标记集合，保留当前缩放/平移
      mapKind: function () { this.refreshMapMarkers(); },
      view: function (now, before) {
        if (before === 'spotDetail' && now !== 'spotDetail') {
          this.stopSpeak();
        }
        // 聊天轮询只在聊天页跑：切走立刻停，回来再恢复，避免后台一直打接口
        if (before === 'chat' && now !== 'chat') {
          this.stopChatPoll();
        }
        if (before !== 'chat' && now === 'chat' && this.chatMerchant.id) {
          this.loadChat(true);
          this.startChatPoll();
        }
      },

    },

    created: function () {
      var self = this;

      // 把错误提示接到页面的 Toast 上，统一三端的提示样式
      ZQ.notify.onToast = function (msg) { self.toast(msg); };
      ZQ.notify.onUnauthorized = function (msg) {
        // 令牌失效：页面会自动退回登录页，语音必须同步停掉，否则会在登录页继续念
        self.stopSpeak();
        self.user = null;
        self.view = 'home';
        self.viewStack = [];
        self.toast(msg || '登录已过期，请重新登录');
      };

      // 订阅主题变化：其它标签页/其它端改了主题，本页选中态跟着更新
      if (window.ZQTheme) {
        this.themeMode = window.ZQTheme.get();
        this._themeOff = window.ZQTheme.onChange(function (mode) { self.themeMode = mode; });
      }

      this.cart = readCart();
      this.loadServerInfo();
      this.loadKnown();

    },

    methods: {

      /* ---------------------------- 结算（逐项） ---------------------------- */

      /** 购物车里是否有实物商品（农产文创） */
      cartHasGoods: function () {
        return this.cart.some(function (it) { return BOOKING_CATS.indexOf(it.category) < 0; });
      },

      /**
       * 结算清单：把购物车按「每个商品各自一份表单」铺开。
       *
       * 【为什么必须逐项】混合结算时农产要填地址、研学要填日期+场次+人数、民宿要填
       * 入住/离店+房型+人数。以前整页只有一组日期/人数输入框，三类商品共用一份值，
       * 结果民宿和研学只能填到同一份日期，信息必然错配。
       *
       * form 存在 cart 项上，改值直接写回 localStorage，刷新不丢。
       */
      checkoutLines: function () {
        var self = this;
        return this.cart.map(function (it) {
          var isBooking = BOOKING_CATS.indexOf(it.category) >= 0;
          if (!it.form) {
            it.form = {
              address: '',
              bookDate: dayAfter(1),
              checkOutDate: dayAfter(2),
              roomType: (it.roomTypes && it.roomTypes[0]) || '标准间',
              bookingSlot: (it.timeSlots && it.timeSlots[0]) || '上午场',
              people: 2,
            };
          }
          return {
            key: it.productId, productId: it.productId, category: it.category,
            isBooking: isBooking, name: it.name, cover: it.cover, price: it.price,
            qty: it.qty, unit: it.unit, stock: it.stock,
            timeSlots: it.timeSlots || [], roomTypes: it.roomTypes || [], form: it.form,
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

      /** 结算总价：按逐项小计求和（预约类会与购物车合计不同，这是对的） */
      checkoutTotal: function () {
        var self = this;
        return (this.checkoutLines() || []).reduce(function (sum, L) { return sum + self.lineSubtotal(L); }, 0);
      },

      /** 两个日期之间的晚数，至少按 1 晚算展示 */
      nightsBetween: function (a, b) {
        if (!a || !b) { return 1; }
        var t1 = new Date(String(a) + 'T00:00:00').getTime();
        var t2 = new Date(String(b) + 'T00:00:00').getTime();
        if (!isFinite(t1) || !isFinite(t2) || t2 <= t1) { return 1; }
        return Math.round((t2 - t1) / 86400000);
      },

      /** 逐项校验，返回第一条错误（带商品名，用户知道该改哪一行） */
      validateCheckout: function () {
        var lines = this.checkoutLines();
        for (var i = 0; i < lines.length; i++) {
          var L = lines[i], f = L.form;
          if (!L.isBooking) {
            if (!String(f.address || '').trim()) { return '请填写「' + L.name + '」的收货地址'; }
            continue;
          }
          if (!f.bookDate) {
            return '请选择「' + L.name + '」的' + (L.category === 'homestay' ? '入住日期' : '预约日期');
          }
          if (!(Number(f.people) >= 1)) { return '「' + L.name + '」的人数至少 1 人'; }
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

      /**
       * 离开结算态。
       * @param clearCart true 表示下单成功要清空；false 只是「先不结了」，购物车与已填内容都保留。
       */
      leaveCheckout: function (clearCart) {
        this.checkoutMode = false;
        if (clearCart) {
          writeCart([]);
          this.syncCart();
        } else {
          writeCart(this.cart);
        }
      },

      /**
       * 打开「我的订单」列表。
       *
       * 所有入口都走这里，保证：
       *  ① 一定退出未提交的结算态，看到的是订单列表而不是那屏确认单；
       *  ② 一定重新拉订单，显示用户已有的其它订单；
       *  ③ 未提交的购物车不动。
       */
      openOrders: function () {
        if (this.checkoutMode) { this.leaveCheckout(false); }
        this.view = 'orders';
        this.viewStack = [];
        window.scrollTo({ top: 0 });
        this.loadOrders();
      },
      /* ---------------------------- 基础工具 ---------------------------- */

      /* 统一图标：三端共用 assets/img/icons.svg，用 <use> 引用 symbol。
         不要改回 emoji 或单字 —— 各端图标风格要一致。 */
      iconHref: function (name) {
        return '../assets/img/icons.svg#' + (name || 'i-home');
      },

      /* 点位印章图标（替代原来的单字印章） */
      spotIcon: function (spot) {
        return window.ZQSpotIcons.iconOf(spot);
      },

      money: function (v) { return fmt.money(v); },
      time: function (v) { return fmt.time(v); },
      date: function (v) { return fmt.date(v); },
      ago: function (v) { return fmt.ago(v); },

      first: function (name) { return String(name || '游').slice(0, 1); },

      /** 登录页「登录过的账号」卡片头像：有照片用照片，没有用默认艺术头像 */
      knownAvatar: function (a) {
        return window.ZQProfile.src(a, a && a.role === 'merchant' ? 'merchant' : 'buyer');
      },

      /** 图片地址：H5 与后端同源，直接用后端给的相对路径即可 */
      asset: function (path) {
        var p = String(path || '').trim();
        if (!p) { return '/assets/img/hero.svg'; }
        if (/^(https?:)?\/\//i.test(p) || p.indexOf('data:') === 0) { return p; }
        return p.charAt(0) === '/' ? p : '/' + p;
      },

      cover: function (cover, category) {
        if (cover) { return this.asset(cover); }
        // 兜底用同一套写实照片，别再退回插画，否则新旧视觉会混在一起
        var fb = { goods: '/assets/img/photos/goods-rice.jpg', study: '/assets/img/photos/spot-study.jpg',
                   homestay: '/assets/img/photos/goods-homestay.jpg', experience: '/assets/img/photos/spot-study.jpg' };
        return this.asset(fb[category] || '/assets/img/photos/spot-center.jpg');
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

      /**
       * 买家可否「确认收货/确认完成」—— 与后端 Dict.canBuyerReceive 完全同一套白名单。
       * 这是订单完成与货款结算的唯一入口，商家没有该权限。
       */
      canReceive: function (o) {
        if (!o) { return false; }
        if (o.canReceive !== undefined) { return !!o.canReceive; }
        if (o.status === 'shipped') { return o.category === 'goods'; }
        if (o.status === 'checked_in') { return o.category === 'homestay'; }
        if (o.status === 'confirmed') { return o.category === 'study' || o.category === 'experience'; }
        return false;
      },

      /** 买家确认收货：订单完成 + 货款结算给商家（后端幂等，重复点不会重复结算） */
      receiveOrder: function () {
        var self = this;
        var o = this.orderDetail;
        if (!o || !o.id || this.receiving) { return; }
        var tip = o.status === 'shipped' ? '确认已经收到货物？' : '确认这次体验/入住已完成？';
        if (!window.confirm(tip + ' 确认后订单完成，货款将结算给商家。')) { return; }
        this.receiving = true;
        api.post('/api/shop/orders/' + o.id + '/receive', {}).then(function (res) {
          self.receiving = false;
          if (!res || !res.ok) { return; }
          self.toast(res.message || '已确认，订单完成');
          self.loadOrderDetail(o.id);
          self.loadOrders();
          self.loadProducts();
        });
      },

      bookingStatusText: function (s) {
        return { pending: '待村里确认', confirmed: '已确认', cancelled: '已取消' }[s] || s || '待确认';
      },

      toast: function (msg) {
        var self = this;
        this.toasts.push(String(msg));
        setTimeout(function () { self.toasts.shift(); }, 2600);
      },

      /* ---------------------------- 个人资料 ---------------------------- */

      refreshMe: function () {
        var self = this;
        if (!this.user) { return; }
        api.get('/api/auth/me', null, { silent: true }).then(function (res) {
          if (res && res.ok) { self.me = res.profile || {}; }
        });
      },

      /** 选图 → 压到 160×160 → 上传 → 就地刷新 */
      onAvatarPick: function (e) {
        var self = this;
        var file = (e.target.files || [])[0];
        e.target.value = ''; // 允许重复选同一张
        if (!file) { return; }
        window.ZQProfile.compress(file, function (dataUrl) {
          if (!dataUrl) { self.toast('图片读取失败，换一张试试'); return; }
          self.toast('正在上传头像…');
          window.ZQProfile.upload(dataUrl).then(function (res) {
            if (!res.ok) { return; }
            self.me = Object.assign({}, self.me, { avatar: dataUrl });
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
        if (!f.old) { return this.toast('请填写原密码'); }
        if (!f.new || f.new.length < 6) { return this.toast('新密码至少 6 位'); }
        if (f.new !== f.confirm) { return this.toast('两次输入的新密码不一致'); }
        this.pwdSaving = true;
        api.post('/api/auth/password', { oldPassword: f.old, newPassword: f.new }).then(function (res) {
          self.pwdSaving = false;
          if (!res.ok) { return; }
          self.pwdVisible = false;
          self.toast(res.message || '密码已修改');
        });
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

      /* -------------------- 村内地图 -------------------- */
      initMap: function () {
        var self = this;
        this.$nextTick(function () {
          setTimeout(function () {
            var box = self.$refs.mapBox;
            if (!box || !window.ZQMap) { return; }
            if (self.mapInstance) { self.mapInstance.destroy(); self.mapInstance = null; }
            self.mapInstance = window.ZQMap.create({
              el: box, markers: self.mapMarkers, showLegend: true,
              onMarkerClick: function (m) { self.openMapMarker(m); },
            });
            // 从详情页「在村内地图中查看」跳进来时，把视口对准那个点并放大一档，
            // 让用户一眼看到目标；用完就清掉，下次从菜单进地图仍是默认全貌。
            if (self.mapFocus) {
              self.mapInstance.focus(self.mapFocus.x, self.mapFocus.y, 2);
              self.mapFocus = null;
            }
          }, 0);
        });
      },
      refreshMapMarkers: function () {
        if (this.mapInstance) { this.mapInstance.setMarkers(this.mapMarkers); }
      },
      openMapMarker: function (m) {
        if (!m) { return; }
        if (m.kind === 'spot') {
          var sp = (this.spots || []).filter(function (s) { return s.id === m.refId; })[0];
          if (sp) { this.openSpot(sp); } else { this.toast('点位不存在'); }
          return;
        }
        if (m.kind === 'activity') {
          var act = (this.activities || []).filter(function (a) { return a.id === m.refId; })[0];
          if (act) { this.openActivity(act); } else { this.toast('活动不存在'); }
          return;
        }
        var prod = (this.products || []).filter(function (p) { return p.id === m.refId; })[0];
        if (prod) { this.openProduct(prod); } else { this.toast('商品不存在'); }
      },

      /** 打开购物车抽屉（桌面导航的购物车按钮用） */
      openCart: function () { this.cartOpen = true; },

      /**
       * 从详情页跳到「村内地图」，并把视口对到那个点上。
       *
       * 为什么要带着坐标跳：详情页里的小地图只有当前一个点，看不出它在村里哪一片。
       * 跳到全图后如果还停在默认视口，用户还得自己找一遍，等于没跳。
       */
      openMapFocus: function (x, y) {
        this.mapFocus = { x: Number(x), y: Number(y) };
        this.go('map', true);
      },

      /** 详情页里的小地图：只画当前这一个点，居中放大 */
      initDetailMap: function () {
        var self = this;
        this.destroyDetailMap();
        this.$nextTick(function () {
          setTimeout(function () {
            if (!window.ZQMap) { return; }
            var isSpot = self.view === 'spotDetail';
            var box = isSpot ? self.$refs.spotMapBox : self.$refs.productMapBox;
            if (!box) { return; }
            var src = isSpot ? self.current : self.product;
            if (!src || src.mapX == null || src.mapY == null) { return; }
            self.detailMapInstance = window.ZQMap.create({
              el: box,
              markers: [{
                id: src.id,
                kind: isSpot ? 'spot' : (src.category || 'experience'),
                name: src.name || '',
                x: src.mapX,
                y: src.mapY,
              }],
              // 单点详情不需要图例、不需要选点，缩放范围也收紧，避免用户拖出空白
              showLegend: false,
              minZoom: 1,
              maxZoom: 4,
            });
          }, 60);
        });
      },

      destroyDetailMap: function () {
        if (this.detailMapInstance) {
          this.detailMapInstance.destroy();
          this.detailMapInstance = null;
        }
      },

      /* ------------------------ 我的消息：会话列表 ------------------------ */

      loadChatThreads: function () {
        var self = this;
        this.chatThreadsLoading = true;
        api.get('/api/chat/threads', null, { silent: true }).then(function (res) {
          self.chatThreadsLoading = false;
          if (res && res.ok) {
            var list = listOf(res, ['threads', 'list', 'items']);
            self.chatThreads = (list || []).map(function (t) {
              return {
                merchantId: t.merchantId || t.id || '',
                merchantName: t.merchantName || t.name || '商家',
                merchantAvatar: t.merchantAvatar || t.avatar || '',
                lastText: t.lastText || t.lastMessage || '',
                lastAt: t.lastAt || t.updatedAt || '',
                online: !!t.online,
                unread: Number(t.unread || 0),
              };
            });
          }
        }, function () { self.chatThreadsLoading = false; });
      },

      go: function (view, isTop) {
        // 地图页：进入时创建控件、离开时销毁
        if (view === 'map') { this.initMap(); }
        else if (this.mapInstance) { this.mapInstance.destroy(); this.mapInstance = null; }
        // 详情页的小地图同理：离开就销毁，否则 ResizeObserver 会一直挂在隐藏节点上
        if (view !== 'spotDetail' && view !== 'productDetail') { this.destroyDetailMap(); }
        // 离开点位详情就停图集轮播，别让定时器在后台一直跑
        if (view !== 'spotDetail') { this.stopSpotGallery(); }

        /**
         * 退出未提交的结算去「我的订单」时必须同时退出结算模式。
         *
         * 【要修的 bug】以前点「我的订单」只是 view='orders'，checkoutMode 还是 true，
         * 页面渲染的仍是「确认订单」那一屏，而 checkoutLines() 读的是购物车 ——
         * 看起来就像「跳到了那笔没提交的订单」，用户其他订单完全看不到。
         * 正确行为：进订单列表 = 退出结算态；未提交购物车原封不动留着。
         */
        if (view === 'orders' && this.checkoutMode && !isTop) {
          this.leaveCheckout(false);
        }

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
        // 从结算页返回＝放弃这次提交，但购物车与已填内容保留
        if (this.checkoutMode) {
          this.leaveCheckout(false);
          this.view = 'shop';
          this.viewStack = [];
          window.scrollTo({ top: 0 });
          this.onEnter('shop');
          return;
        }
        // 从订单详情返回时清掉详情数据，避免下次进来先闪一下上一单的内容
        if (this.view === 'orderDetail') {
          this.orderDetail = {};
          this.orderLogs = [];
          this.logistics = null;
        }
        // 返回时同样要销毁详情页小地图
        this.destroyDetailMap();
        this.viewStack.pop();
        var prev = this.viewStack[this.viewStack.length - 1];
        // 返回栈空了就回到对应顶层页
        this.view = prev || (this.user ? 'home' : 'home');
        window.scrollTo({ top: 0 });
        this.onEnter(this.view);
      },

      /** 进入页面时按需加载数据，避免首屏一次性请求全部接口 */
      onEnter: function (view) {
        if (view === 'booking' && !this.bookingList.length) { this.loadBooking(); }
        if (view === 'orders' && !this.checkoutMode) { this.loadOrders(); }
        if (view === 'ai' && !Object.keys(this.ai).length) { this.loadAiStatus(); }
        if (view === 'reports') { this.loadReportCategories(); this.loadMyReports(); }
        if (view === 'chatList') { this.loadChatThreads(); }
      },

      /* ---------------------------- 站点信息 ---------------------------- */

      loadServerInfo: function () {
        var self = this;
        api.get('/api/server/info', null, { silent: true }).then(function (res) {
          if (res && res.ok) {
            self.site = res;
            // 语音音色策略由服务端统一下发（app.speech.*），三端保持一致。
            // 取不到也没关系：ZQSpeech 内部有同等兜底值，不会因为少了配置就不念。
            if (res.speech && window.ZQSpeech) {
              window.ZQSpeech.configure(res.speech);
              self.voiceName = window.ZQSpeech.voiceLabel();
            }
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
            self.me = res.profile || {};
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
        // 先停语音再发请求：退出接口是异步的，等它回来才停的话，
        // 用户在「已确认退出、页面还没跳走」的这段时间里还会听到朗读。
        this.stopSpeak();
        api.post('/api/auth/logout', {}, { silent: true }).then(function () {
          self.stopSpeak();
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
        this.refreshMe(); // 头像等资料每次登录/刷新都跟着更新，避免显示上一个账号的
        this.loadSpots();
        this.loadProducts();
        this.loadActivities();
        this.loadStamps();
        this.loadOrders();
        this.loadMyBookings();
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

      /* ---------------------------- 活动详情与预约 ---------------------------- */

      openActivity: function (id) {
        var self = this;
        this.go('activityDetail');
        this.currentAct = {};
        this.actLoading = true;
        api.get('/api/tour/activities/' + id).then(function (res) {
          self.actLoading = false;
          if (!res || !res.ok) { return; }
          var a = res.activity || {};
          self.currentAct = a;
          self.actForm = {
            date: (a.date || ''),
            people: a.myBooking ? a.myBooking.people : 2,
            phone: (a.myBooking && a.myBooking.phone) || (self.me && self.me.phone) || '',
            remark: (a.myBooking && a.myBooking.remark) || ''
          };
        });
      },

      bookActivity: function () {
        var self = this;
        var a = this.currentAct;
        if (!this.user) { this.toast('请先登录再预约', 'warn'); return; }
        if (!a.id) { return; }
        if (!this.actForm.date) { this.toast('请选择参加日期', 'warn'); return; }
        this.actLoading = true;
        api.post('/api/tour/activities/' + a.id + '/book', {
          date: this.actForm.date,
          people: Number(this.actForm.people) || 1,
          phone: this.actForm.phone,
          remark: this.actForm.remark
        }).then(function (res) {
          self.actLoading = false;
          if (!res || !res.ok) { return; }
          self.toast(res.message || '预约成功');
          self.loadMyBookings();
          self.loadActivities();
          self.openActivity(a.id);
        });
      },

      cancelBooking: function (b) {
        var self = this;
        api.post('/api/tour/bookings/' + b.id + '/cancel').then(function (res) {
          if (!res || !res.ok) { return; }
          self.toast(res.message || '已取消预约');
          self.loadMyBookings();
          self.loadActivities();
          if (self.currentAct && self.currentAct.id === b.activityId) {
            self.openActivity(b.activityId);
          }
        });
      },

      loadMyBookings: function () {
        var self = this;
        if (!this.user) { this.myBookings = []; return; }
        api.get('/api/tour/bookings', null, { silent: true }).then(function (res) {
          if (res && res.ok) { self.myBookings = res.list || []; }
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

      openSpot: function (id, autoSpeak) {
        var self = this;
        this.stopSpeak();
        // 音色列表可能要等网络音色补进来才完整，进详情时顺手刷新展示名
        if (window.ZQSpeech) { this.voiceName = window.ZQSpeech.voiceLabel(); }
        // 已经在这一页就别再压一层返回栈，否则要连点两次返回
        if (this.view !== 'spotDetail') { this.go('spotDetail'); }
        this.current = {};
        this.spotGalleryIndex = 0;
        this.stopSpotGallery();
        this.showScript = !!autoSpeak;
        window.scrollTo(0, 0);
        api.get('/api/tour/spots/' + id).then(function (res) {
          if (res && res.ok) {
            self.current = res.spot || {};
            self.startSpotGallery();
            self.initDetailMap();
            // 打卡后自动进详情并开讲：等 DOM 渲染完再调，否则按钮状态还没跟上
            if (autoSpeak) {
              self.$nextTick(function () { self.toggleSpeak(); });
            }
          }
        });
      },

      /* ------------------------ 图集：点位轮播 / 商品翻页 ------------------------ */

      /** 当前点位图集：后端 images 已含 cover 兜底；只有 1 张时不轮播 */


      stepSpotImage: function (delta) {
        var n = this.spotImages.length;
        if (n <= 1) { return; }
        this.spotGalleryIndex = ((this.spotGalleryIndex + delta) % n + n) % n;
        this.startSpotGallery();   // 手动翻页后重新计时，别刚点完就被切走
      },
      /**
       * 定时切下一张。
       *
       * 为什么 4.2 秒：语音讲解一句话大约 3–5 秒，图片节奏跟得上听众注意力；
       * 太快会晕，太慢像卡住。只有一张图时不启动（没意义且白耗 CPU）。
       */
      startSpotGallery: function () {
        var self = this;
        this.stopSpotGallery();
        if (this.spotImages.length <= 1) { return; }
        this.spotGalleryTimer = setInterval(function () {
          // 已经离开详情页就自己停掉，避免后台空转
          if (self.view !== 'spotDetail' || self.spotImages.length <= 1) {
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

      /** 当前商品图集：后端 images 已含 cover 兜底 */


      stepProductImage: function (delta) {
        var n = this.productImages.length;
        if (n <= 1) { return; }
        this.productGalleryIndex = ((this.productGalleryIndex + delta) % n + n) % n;
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
          // 打完卡直接进这个点位的介绍页，并自动播放语音讲解
          self.openSpot(spot.id, true);
        });
      },

      /* ---------------------------- 语音讲解 ----------------------------
         三端共用 ZQSpeech（assets/js/speech.js）：音色优选、分句朗读、可靠停止。
         本页只负责「什么时候播、什么时候停」，不再自己拼 SpeechSynthesisUtterance，
         否则每个页面都得重复一遍 cancel/onend 的坑。 */

      toggleSpeak: function () {
        if (this.speaking) {
          this.stopSpeak();
          return;
        }
        var text = this.current.tts || this.current.intro || '';
        if (!text) { return this.toast('这个点位还没有讲解内容'); }
        if (!window.ZQSpeech || !window.ZQSpeech.available()) {
          this.showScript = true;
          return this.toast('当前浏览器不支持语音朗读，已为你展开讲解文稿');
        }

        var self = this;
        // 语音包由管理员在点位编辑里配置（auto / male / female），这里原样透传；
        // 设备没有对应性别音色时 ZQSpeech 内部会自动退回打分最优音色，不会报错。
        var started = window.ZQSpeech.speak(text, {
          pack: this.current.voice || 'auto',
          onFail: function () {
            // 浏览器把 speak 静默吞掉（无 onstart / 无 onerror）时展开文稿，别让按钮一直停在「朗读中」
            self.showScript = true;
            self.speaking = false;
            self.toast('当前浏览器未能发声，已展开讲解文稿');
          }
        });
        if (!started) {
          this.showScript = true;
          return this.toast('语音朗读启动失败，已为你展开讲解文稿');
        }
        this.speaking = true;
      },

      stopSpeak: function () {
        if (window.ZQSpeech) { window.ZQSpeech.stop(); }
        this.speaking = false;
      },

      /** 当前音色名，显示在讲解卡片右上角，让用户知道用的是哪个声音 */
      voiceLabel: function () {
        return this.voiceName || (window.ZQSpeech ? window.ZQSpeech.voiceLabel() : '');
      },

      /** 卡片右上角文案：优先显示管理员配置的语音包（男声/女声），再带出具体音色 */
      voiceText: function () {
        var pack = window.ZQSpeech ? window.ZQSpeech.packLabel(this.current.voice || 'auto') : '';
        var name = this.voiceLabel();
        if (pack && name && pack !== name) { return '语音包 · ' + pack + ' / ' + name; }
        return pack || name || '浏览器语音合成';
      },

      /** 换音色：在设备可用的中文音色里循环，选择记在本地 */
      switchVoice: function () {
        if (!window.ZQSpeech || !window.ZQSpeech.available()) {
          return this.toast('当前浏览器不支持语音朗读');
        }
        var self = this;
        var wasSpeaking = this.speaking;
        var text = this.current.tts || this.current.intro || '';
        this.voiceName = window.ZQSpeech.cycleVoice() || this.voiceName;
        if (wasSpeaking && text) {
          // 换音色后按新音色重念，否则要再点一次「播放」才有变化
          this.stopSpeak();
          this.$nextTick(function () { self.toggleSpeak(); });
        }
        this.toast(this.voiceName ? '已切换音色：' + this.voiceName : '没有更多可用音色');
      },

      waveStyle: function (n) {
        return { height: (5 + ((n * 29) % 20)) + 'px', animationDelay: ((n % 6) * 0.09) + 's' };
      },

      /* ---------------------------- 商品与订单 ---------------------------- */

      openProduct: function (id) {
        var self = this;
        this.go('productDetail');
        this.product = {};
        this.productGalleryIndex = 0;   // 换商品时图集回到第一张
        this.productMerchant = {};
        this.productSlots = [];
        this.productRooms = [];
        this.bookingSlot = '';
        this.checkOutDate = '';
        this.roomType = '';
        this.qty = 1;
        this.people = 2;
        this.bookDate = dayAfter(1);
        this.address = '';
        this.remark = '';
        window.scrollTo(0, 0);
        api.get('/api/shop/products/' + id).then(function (res) {
          if (!res || !res.ok || !res.product) { return; }
          var p = Object.assign({}, res.product, {
            categoryText: CATEGORY_TEXT[res.product.category] || res.product.category,
          });
          self.product = p;
          self.productSlots = self.bookingSlotsOf(p);
          self.productRooms = self.roomTypesOf(p);
          self.bookingSlot = self.productSlots[0] || '';
          self.roomType = self.productRooms[0] || '';
          self.checkOutDate = dayAfter(2);
          self.loadProductMerchant(p);
          self.initDetailMap();
        });
      },

      /** 可预约场次：优先商品配置，其次按分类给默认场次 */
      bookingSlotsOf: function (p) {
        var list = parseJsonList(p && (p.timeSlots || p.slots || p.bookingSlots));
        if (!list.length) { list = BOOKING_SLOTS[p && p.category] || []; }
        return list.map(function (x) {
          return typeof x === 'string' ? x : (x.name || x.text || x.slot || '');
        }).filter(Boolean);
      },

      /** 民宿房型：优先商品配置，其次给默认房型 */
      roomTypesOf: function (p) {
        var list = parseJsonList(p && (p.roomTypes || p.rooms));
        if (!list.length) { list = HOMESTAY_ROOMS; }
        return list.map(function (x) {
          return typeof x === 'string' ? x : (x.name || x.text || x.roomType || '');
        }).filter(Boolean);
      },

      /** 商品详情里的发布商家卡片数据（失败时退回商品自带的 merchantName） */
      loadProductMerchant: function (p) {
        var self = this;
        if (!p || !p.merchantId) {
          this.productMerchant = p && p.merchantName ? { name: p.merchantName } : {};
          return;
        }
        api.get('/api/shop/merchants/' + p.merchantId, null, { silent: true }).then(function (res) {
          var m = (res && res.ok && (res.merchant || res.shop)) || {};
          self.productMerchant = Object.assign({ id: p.merchantId, name: p.merchantName }, m);
        });
      },

      buyNow: function () {
        var self = this;
        var cat = this.product.category || 'goods';
        if (this.product.stock <= 0) { return this.toast('该商品已售罄'); }
        if (!this.user) { return this.toast('请先登录再下单'); }

        // 四类商品各自的必填项：实物要地址，预约要看日期/场次/离店/房型
        if (cat === 'goods') {
          if (!this.address) { return this.toast('请填写收货地址'); }
        } else {
          if (!this.bookDate) { return this.toast('请选择' + (cat === 'homestay' ? '入住' : '预约') + '日期'); }
          if (cat === 'homestay') {
            if (!this.checkOutDate) { return this.toast('请选择离店日期'); }
            if (this.checkOutDate <= this.bookDate) { return this.toast('离店日期要晚于入住日期'); }
            if (!this.roomType) { return this.toast('请选择房型'); }
          } else if (!this.bookingSlot) {
            return this.toast(cat === 'study' ? '请选择上课场次' : '请选择体验时段');
          }
        }

        this.submitting = true;
        api.post('/api/shop/orders', {
          items: [{ productId: this.product.id, qty: this.isBooking ? this.people : this.qty }],
          bookDate: this.isBooking ? this.bookDate : '',
          people: this.isBooking ? this.people : 1,
          address: this.isBooking ? '' : this.address,
          bookingSlot: this.isBooking ? (this.bookingSlot || '') : '',
          checkOutDate: cat === 'homestay' ? this.checkOutDate : '',
          roomType: cat === 'homestay' ? this.roomType : '',
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
            // 详情页里取消：顺带刷新详情，否则状态还停在「待确认」
            if (self.view === 'orderDetail' && self.orderDetail.id === o.id) { self.loadOrderDetail(o.id); }
          }
        });
      },

      /* ---------------------------- 主题 ---------------------------- */
      /** 切换主题：真正的样式应用在 assets/js/theme.js，这里只同步选中态 */
      setTheme: function (mode) {
        if (!window.ZQTheme) { return; }
        this.themeMode = window.ZQTheme.set(mode);
      },

      /* ---------------------------- 订单详情 / 物流 / 拒绝协商 ---------------------------- */

      openOrder: function (id) {
        if (!id) { return; }
        this.go('orderDetail');
        this.orderDetail = { id: id };
        this.orderDetailLoading = true;
        this.orderLogs = [];
        this.logistics = null;
        this.rejectFeedback = '';
        this.loadOrderDetail(id);
        window.scrollTo(0, 0);
      },

      loadOrderDetail: function (id) {
        var self = this;
        api.get('/api/shop/orders/' + id).then(function (res) {
          self.orderDetailLoading = false;
          if (!res || !res.ok) { self.orderDetail = {}; return; }
          // 兼容 {order:{...}} 与直接返回订单对象两种形态
          var o = Object.assign({}, res.order || res.detail || res);
          if (!o.id) { o.id = id; }
          if (o.merchant) {
            if (!o.merchantId) { o.merchantId = o.merchant.id; }
            if (!o.merchantName) { o.merchantName = o.merchant.name; }
            if (!o.merchantPhone) { o.merchantPhone = o.merchant.phone; }
          }
          self.orderDetail = o;
          self.orderLogs = listOf(res, ['logs', 'orderLogs', 'records'])
            .concat(Array.isArray(o.logs) ? o.logs : []);
          // 只有实物商品才查物流；预约类调了也只会拿到空数据
          if (self.isGoodsOrder(o)) { self.loadOrderLogistics(id); }
          else { self.logistics = null; }
        });
      },

      loadOrderLogistics: function (id) {
        var self = this;
        api.get('/api/shop/orders/' + id + '/logistics', null, { silent: true }).then(function (res) {
          if (!res || !res.ok) { self.logistics = null; return; }
          self.logistics = normalizeLogistics(res);
        });
      },

      /** 买家对「商家申请关闭订单」的决策：同意关单 / 不同意继续协商 */
      decideOrder: function (agree) {
        var self = this;
        var o = this.orderDetail;
        if (!o || !o.id || this.buyerDeciding) { return; }
        this.buyerDeciding = true;
        api.post('/api/shop/orders/' + o.id + '/buyer-decision', {
          agree: !!agree,
          reason: this.rejectFeedback || (agree ? '同意关闭订单' : '不同意，继续协商'),
        }).then(function (res) {
          self.buyerDeciding = false;
          if (!res || !res.ok) { return; }
          self.toast(res.message || (agree ? '订单已关闭' : '已提交协商，商家会继续处理'));
          self.loadOrderDetail(o.id);
          self.loadOrders();
          self.loadProducts();
        });
      },

      /** 订单状态下方的人话说明（含拒绝协商的中间态） */
      orderStatusTip: function (o) {
        if (!o) { return ''; }
        if (o.rejectStatus === 'waiting_buyer') { return '商家提出关闭订单，等待你确认'; }
        if (o.rejectStatus === 'buyer_disagreed') { return '已提交协商，等待商家继续处理'; }
        var map = {
          pending: '等待商家确认', confirmed: '商家已确认，等待处理', shipped: '商家已发货，留意物流',
          checked_in: '已办理入住', completed: '交易已完成', used: '交易已完成（历史）',
          cancelled: '订单已关闭', refunded: '退款已登记，到账时间以支付渠道为准',
        };
        return map[o.status] || '订单处理中';
      },

      /** 实物商品才有物流；预约类（研学/民宿/农事）没有 */
      isGoodsOrder: function (o) {
        if (!o) { return false; }
        if (o.category) { return o.category === 'goods'; }
        return !o.bookDate && !o.bookingSlot && !o.checkOutDate && !o.roomType;
      },

      orderMerchantName: function (o) {
        return (o && (o.merchantName || (o.merchant && o.merchant.name))) || '村内商家';
      },

      orderMerchantPhone: function (o) {
        return (o && (o.merchantPhone || (o.merchant && o.merchant.phone))) || '';
      },

      /** 商家头像：自定义照片优先，否则用统一的商家默认头像 */
      avatarFrom: function (obj) {
        var a = obj && (obj.avatar || obj.merchantAvatar || (obj.merchant && obj.merchant.avatar));
        return a ? this.asset(a) : window.ZQProfile.defaultFor('merchant');
      },

      merchantType: function (m) {
        return (m && (m.typeText || m.type || m.business || m.categoryText)) || '村内商家';
      },

      roleText: function (role) {
        return { buyer: '我', merchant: '商家', admin: '平台', system: '系统' }[role] || '系统';
      },

      /* ---------------------------- 商家主页 ---------------------------- */

      openMerchant: function (id, fallback) {
        if (!id) { return; }
        var self = this;
        this.go('merchantHome');
        this.merchantHome = Object.assign({ id: id }, fallback || {});
        this.merchantHomeProducts = [];
        this.merchantHomeLoading = true;
        window.scrollTo(0, 0);
        api.get('/api/shop/merchants/' + id, null, { silent: true }).then(function (res) {
          self.merchantHomeLoading = false;
          if (!res || !res.ok) {
            if (!self.merchantHome.name) { self.toast((res && res.error) || '商家信息暂时打不开'); }
            return;
          }
          var m = res.merchant || res.shop || res;
          self.merchantHome = Object.assign({}, self.merchantHome, m, { id: id });
          self.merchantHomeProducts = (res.products || []).map(function (p) {
            return Object.assign({}, p, { categoryText: CATEGORY_TEXT[p.category] || p.category });
          });
        });
      },

      /* ---------------------------- 商家客服聊天 ---------------------------- */

      openChat: function (merchantId, merchantName) {
        if (!this.user) { return this.toast('登录后才能联系商家'); }
        if (!merchantId) { return this.toast('这个商家暂时没有开通在线客服'); }
        this.stopSpeak();
        if (this.view !== 'chat') { this.go('chat'); }
        this.chatMerchant = { id: merchantId, name: merchantName || '' };
        this.chatMessages = [];
        this.chatText = '';
        this.chatPanel = false;
        this.chatPicker = '';
        this.chatProducts = [];
        this.chatOnline = false;
        this.chatPeerTyping = false;
        this.chatLastTyping = 0;
        this.loadChatPeer();
        this.loadChat();
        this.startChatPoll();
        if (!this.orders.length) { this.loadOrders(); }
        window.scrollTo(0, 0);
      },

      startChatPoll: function () {
        var self = this;
        this.stopChatPoll();
        this.chatTimer = setInterval(function () {
          if (self.view === 'chat') { self.loadChat(true); }
        }, 3000);
      },

      stopChatPoll: function () {
        if (this.chatTimer) { clearInterval(this.chatTimer); this.chatTimer = null; }
      },

      /** 商家在线状态：接口失败就按「离线中」显示，不打扰用户 */
      loadChatPeer: function () {
        var self = this;
        var id = this.chatMerchant.id;
        if (!id) { return; }
        api.get('/api/chat/peer', { merchantId: id }, { silent: true }).then(function (res) {
          if (!res || !res.ok) { return; }
          var m = res.merchant || res.peer || {};
          if (!self.chatMerchant.name) { self.chatMerchant.name = m.name || res.name || ''; }
          if (typeof res.online === 'boolean') { self.chatOnline = res.online; }
          else if (typeof m.online === 'boolean') { self.chatOnline = m.online; }
        });
      },

      loadChat: function (silent) {
        var self = this;
        var id = this.chatMerchant.id;
        if (!id || this.chatLoading) { return; }
        this.chatLoading = true;
        var before = this.chatMessages.length;
        api.get('/api/chat/messages', { merchantId: id }, { silent: true }).then(function (res) {
          self.chatLoading = false;
          if (!res || !res.ok) { return; }
          var list = listOf(res, ['messages', 'list', 'chatMessages']);
          self.chatMessages = list.map(normalizeMsg);
          if (res.merchant && res.merchant.name) { self.chatMerchant.name = res.merchant.name; }
          if (typeof res.online === 'boolean') { self.chatOnline = res.online; }
          if (typeof res.merchantOnline === 'boolean') { self.chatOnline = res.merchantOnline; }
          // 后端 /api/chat/messages 用 peerOnline / peerTyping 表示对方状态
          if (typeof res.peerOnline === 'boolean') { self.chatOnline = res.peerOnline; }
          if (res.merchant && typeof res.merchant.online === 'boolean') { self.chatOnline = res.merchant.online; }
          self.chatPeerTyping = !!(res.typing || res.peerTyping || res.merchantTyping);
          if (!silent || self.chatMessages.length !== before) { self.scrollIm(); }
        });
      },

      scrollIm: function () {
        var self = this;
        this.$nextTick(function () {
          var el = self.$refs.imScroll;
          if (el) { el.scrollTop = el.scrollHeight; }
        });
      },

      sendChat: function () {
        var text = String(this.chatText || '').trim();
        if (!text || this.chatSending) { return; }
        this.chatText = '';
        this.sendChatMessage({ type: 'text', text: text });
      },

      sendChatMessage: function (payload) {
        var self = this;
        var id = this.chatMerchant.id;
        if (!id || this.chatSending) { return; }
        this.chatSending = true;
        payload.merchantId = id;
        api.post('/api/chat/messages', payload).then(function (res) {
          self.chatSending = false;
          if (!res || !res.ok) { return; }
          // 先就地插入，避免等下一轮轮询才看到自己发的消息
          var msg = res.message || res.msg;
          if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
            self.chatMessages.push(normalizeMsg(msg));
          }
          self.chatPanel = false;
          self.chatPicker = '';
          self.scrollIm();
          self.loadChat(true);
        });
      },

      sendChatProduct: function (p) {
        if (!p) { return; }
        this.sendChatMessage({ type: 'product', productId: p.id, text: p.name || '商品' });
      },

      sendChatOrder: function (o) {
        if (!o) { return; }
        this.sendChatMessage({ type: 'order', orderId: o.id, text: o.productName || '订单' });
      },

      /** 聊天图片：拍照/相册统一走压缩，失败提示换一张 */
      onChatImage: function (e) {
        var self = this;
        var input = e.target;
        var file = (input.files || [])[0];
        input.value = ''; // 允许重复选同一张
        if (!file) { return; }
        this.toast('正在处理图片…');
        compressImage(file, function (dataUrl) {
          if (!dataUrl) { return self.toast('图片处理失败，请换一张小一点的图片'); }
          self.sendChatMessage({ type: 'image', media: dataUrl, text: '[图片]' });
        });
      },

      openChatPicker: function (kind) {
        this.chatPicker = kind;
        if (kind === 'product') { this.loadChatProducts(); }
      },

      loadChatProducts: function () {
        var self = this;
        var id = this.chatMerchant.id;
        if (!id || this.chatProducts.length) { return; }
        api.get('/api/shop/merchants/' + id, null, { silent: true }).then(function (res) {
          if (res && res.ok) { self.chatProducts = res.products || []; }
        });
      },

      /** 输入中状态：2 秒最多报一次，别把接口打满 */
      onChatInput: function () {
        var now = Date.now();
        if (!this.chatMerchant.id || now - this.chatLastTyping < 2000) { return; }
        this.chatLastTyping = now;
        api.post('/api/chat/typing', { merchantId: this.chatMerchant.id }, { silent: true });
      },

      /** 聊天卡片里引用的商品/订单：优先消息自带，其次从本地缓存里找 */
      chatProductOf: function (m) {
        if (m && m.product) { return m.product; }
        var id = m && m.productId;
        return this.chatProducts.filter(function (p) { return p.id === id; })[0]
          || this.products.filter(function (p) { return p.id === id; })[0]
          || {};
      },

      chatOrderOf: function (m) {
        if (m && m.order) { return m.order; }
        var id = m && m.orderId;
        return this.orders.filter(function (o) { return o.id === id; })[0] || {};
      },

      reportFromChat: function () {
        var m = this.chatMerchant || {};
        if (!m.id) { return this.toast('还没有可举报的商家'); }
        this.openReports({ merchantId: m.id, merchantName: m.name });
      },

      /* ---------------------------- 举报中心 ---------------------------- */

      openReports: function (pre) {
        if (!this.user) { return this.toast('登录后才能提交举报'); }
        this.go('reports');
        if (pre && pre.merchantId) {
          this.reportsTab = 'form';
          this.reportForm.merchantId = pre.merchantId;
          this.reportForm.merchantName = pre.merchantName || '';
        } else {
          this.reportsTab = 'mine';
        }
        window.scrollTo(0, 0);
      },

      loadReportCategories: function () {
        var self = this;
        if (this.reportCategories.length) { return; }
        api.get('/api/reports/categories', null, { silent: true }).then(function (res) {
          var list = normalizeCategories(res);
          self.reportCategories = list.length
            ? list
            : REPORT_FALLBACK.map(normalizeCategory);
        });
      },

      loadMyReports: function () {
        var self = this;
        if (!this.user) { this.reportMine = []; return; }
        this.reportMineLoading = true;
        api.get('/api/reports/mine', null, { silent: true }).then(function (res) {
          self.reportMineLoading = false;
          if (!res || !res.ok) { return; }
          self.reportMine = listOf(res, ['reports', 'list']).map(function (r) {
            return Object.assign({}, r, {
              categoryText: r.categoryText || self.reportCategoryText(r.category),
            });
          });
        });
      },

      chooseReportCategory: function (c) {
        this.reportForm.category = c.key;
        this.reportForm.reason = (c.reasons[0] && c.reasons[0].text) || '';
      },

      syncReportMerchantName: function () {
        var id = this.reportForm.merchantId;
        var opt = this.reportMerchantOptions.filter(function (m) { return m.id === id; })[0];
        this.reportForm.merchantName = opt ? opt.name : '';
      },

      resetReportMerchant: function () {
        this.reportForm.merchantId = '';
        this.reportForm.merchantName = '';
      },

      onEvidencePick: function (e) {
        var self = this;
        var input = e.target;
        var file = (input.files || [])[0];
        input.value = '';
        if (!file) { return; }
        if (this.reportEvidence.length >= 3) { return this.toast('最多上传 3 张凭证'); }
        compressImage(file, function (dataUrl) {
          if (!dataUrl) { return self.toast('图片处理失败，请换一张小一点的图片'); }
          self.reportEvidence.push(dataUrl);
        });
      },

      removeEvidence: function (i) {
        this.reportEvidence.splice(i, 1);
      },

      submitReport: function () {
        var self = this;
        var f = this.reportForm;
        if (!f.merchantId) { return this.toast('请选择要举报的商家'); }
        if (!f.category) { return this.toast('请选择违规分类'); }
        if (!f.reason) { return this.toast('请选择具体的举报原因'); }
        if (!f.content || f.content.length < 5) { return this.toast('请把情况写清楚一点（至少 5 个字）'); }
        if (this.reportSubmitting) { return; }
        this.reportSubmitting = true;
        api.post('/api/reports', {
          merchantId: f.merchantId,
          category: f.category,
          reason: f.reason,
          content: f.content,
          evidence: this.reportEvidence.slice(0, 3),
        }).then(function (res) {
          self.reportSubmitting = false;
          if (!res || !res.ok) { return; }
          self.toast(res.message || '举报已提交，管理员会尽快处理');
          self.reportForm = { merchantId: '', merchantName: '', category: '', reason: '', content: '' };
          self.reportEvidence = [];
          self.reportsTab = 'mine';
          self.loadMyReports();
        });
      },

      reportCategoryText: function (key) {
        var cat = (this.reportCategories || []).filter(function (c) { return c.key === key; })[0];
        return cat ? cat.name : (key || '举报');
      },
      reportStatusText: function (s) { return REPORT_STATUS[s] || s || '待处理'; },
      reportStatusClass: function (s) {
        if (s === 'resolved' || s === 'appeal_resolved' || s === 'closed') { return 'tag-ok'; }
        return s === 'appealed' ? 'tag-info' : 'tag-warn';
      },
      reportProgress: function (s) { return REPORT_PROGRESS[s] || '32%'; },

      /* ---------------------------- 购物车 ---------------------------- */

      syncCart: function () { this.cart = readCart(); },

      /**
       * 加入购物车。
       *
       * 【准入规则】只有农产文创（实物类）能进购物车。
       * 研学 / 民宿 / 农事体验必须走「立即预约」—— 它们要选日期、场次、房型、人数，
       * 这些是逐单逐项的信息，混进购物车一起结算必然错配，所以从入口就拦住。
       * 后端 createOrders 有同样的分类校验兜底，前端拦截只是体验层。
       */
      addCart: function (p, qty) {
        if (!p) { return; }
        if (BOOKING_CATS.indexOf(p.category) >= 0) {
          this.toast('「' + p.name + '」需要预约，请到详情页选日期后预约');
          this.openProduct(p.id);
          return;
        }
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
            // 场次 / 房型存进购物车，结算页每项都能独立选
            timeSlots: p.timeSlots || [], roomTypes: p.roomTypes || [],
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
        // 不 syncCart()：它会把用户上次已填的表单冲掉（见 submitCart 里的说明）
        if (!this.cart.length) { return this.toast('购物车是空的'); }
        this.cartOpen = false;
        this.checkoutMode = true;
        this.remark = '';
        // 给每件商品各初始化一份表单（存在 cart 项上，刷新不丢）
        this.checkoutLines();
        writeCart(this.cart);
        // 直接切视图，不走 go()：go('orders') 里有「离开结算态」的判断，
        // 会把刚设好的 checkoutMode 又关掉，进结算页看到的却是订单列表。
        this.view = 'orders';
        this.viewStack = ['orders'];
        window.scrollTo({ top: 0 });
      },

      submitCart: function () {
        var self = this;
        // 【不能在这里 syncCart()】syncCart 会用 localStorage 里的旧数据重建 cart 对象，
        // 把用户刚填的表单（每项 form）全部丢掉 —— 日期、人数、房型会悄悄变回默认值。
        // 这里以内存里的 this.cart 为准，并在提交前把它（含表单）写回本地，保证刷新也不丢。
        writeCart(this.cart);
        if (!this.cart.length) { return this.toast('购物车是空的'); }

        // 逐项校验：每件商品各验各的，错误带商品名，用户知道该改哪一行
        var err = this.validateCheckout();
        if (err) { return this.toast(err); }

        // 逐项提交：每件商品带自己那份预约参数，后端按 item 上的值校验与落库。
        // 顶层不再传 bookDate/people，避免「一份值套所有商品」的老问题。
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
          remark: this.remark,
        };

        this.submitting = true;
        api.post('/api/shop/orders', payload).then(function (res) {
          self.submitting = false;
          if (!res || !res.ok) { return; }
          // 只有真正下成的商品才从购物车移除；有失败项时保留，让用户改完重提
          var failed = {};
          (res.warnings || []).forEach(function (w) {
            (self.cart || []).forEach(function (it) {
              if (w.indexOf(it.name) >= 0) { failed[it.productId] = true; }
            });
          });
          var keep = self.cart.filter(function (it) { return failed[it.productId]; });
          writeCart(keep);
          self.syncCart();
          if (res.warnings && res.warnings.length) {
            self.toast(res.warnings.join('；'));
          } else {
            self.toast(res.message || '下单成功');
          }
          // 全部成功才退出结算态；有失败项就留在结算页让用户改
          if (!keep.length) { self.leaveCheckout(false); }
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

    /**
     * 页面销毁时清掉定时器。
     * 不清的话：图集轮播、聊天轮询会继续跑，控制台报「操作已销毁实例」的警告，
     * 而且用户以为页面关了、实际还在发请求。
     */
    destroyed: function () {
      this.stopSpotGallery();
      this.stopSpeak();
      if (this.mapInstance) { this.mapInstance.destroy(); this.mapInstance = null; }
      if (this.chatTimer) { clearInterval(this.chatTimer); this.chatTimer = null; }
      if (this._themeOff) { this._themeOff(); this._themeOff = null; }
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

      // 离开页面时停掉语音，避免在别的页面继续朗读。
      // pagehide 必须一起听：手机 Safari / 微信内置浏览器切走或返回桌面时
      // 不会触发 beforeunload，只靠它会出现「页面没了声音还在」。
      window.addEventListener('beforeunload', function () { self.stopSpeak(); });
      window.addEventListener('pagehide', function () { self.stopSpeak(); });

      // 语音模块预热：先把设备音色列表取回来，并把「正在朗读」状态同步到按钮
      if (window.ZQSpeech) {
        window.ZQSpeech.preload();
        window.ZQSpeech.bind(function (speaking) { self.speaking = speaking; });
        self.voiceName = window.ZQSpeech.voiceLabel();
      }
    },
  });
})();
