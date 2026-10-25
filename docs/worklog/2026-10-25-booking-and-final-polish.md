# 2026-10-25 活动预约与人员管理、打卡自动播报、电脑端登录/AI 重做、三端艺术头像、入口页重做

## 这轮做了什么（PR：feat/booking-and-final-polish）

### 活动预约（游客端 + 管理端）
- 新表 `activityBookings`：(activityId, userId) 唯一，一人一场一条有效预约；
  `activities` 加 `capacity` 列（默认 30）做名额控制。
- 游客端（手机 + 电脑）：活动列表 → 详情 → 预约表单（日期/人数/手机/备注），
  已结束活动拒绝预约、重复预约给友好提示、取消后可再约；
  「我的」页新增我的预约卡片。活动列表排序改为「未结束在前，已结束沉底」。
- 管理端「内容管理—文旅活动」：新增预约人数列（x/y 人 · N 笔）与
  「人员管理」弹窗，表内直接编辑姓名/手机/人数/日期/状态/备注，即时生效。

### 电脑端
- 登录页重排：删掉「左图右表单」双栏，改为整幅底图 + 居中 460px 卡片
  （1440/1920 下卡片 centerOffset 均为 0，实测）。
- AI 助手逐字输出：与手机端同一节奏（约 90 帧放完、26ms/帧），
  行程模式把 days 拼成纯文本一起逐字出；「猜你想问」改为回答结束后展示。
- 手机端也顺手统一：删掉知识库来源引用、加「猜你想问」、聊天气泡头像用真头像。

### 打卡自动播报
- 手机端/电脑端打卡成功后自动进入该点位详情并 `speechSynthesis` 起播
  （实测 headless 里 speaking=true）。手机端 openSpot 增加防重复压栈。

### 三端艺术头像
- 新增 `avatar-visitor.svg`（斗笠竹影）/`avatar-merchant.svg`（檐下小铺）/`avatar-admin.svg`（印中山河），
  `ZQProfile.src(profile, role)` 统一取图。登录页快捷卡片、各端右上角、
  管理端商家/买家列表与详情抽屉全部换成图片渲染，不再有首字占位。

### 入口页（部署完成跳转页）
- 按需求删掉大插画 hero 区，公告改独立横幅；左上角换正式 logo；
  三张卡片加品牌色带；按钮不再被 URL 覆盖文字（URL 另起一行小字展示）。

## 踩的坑（下一个 agent 重点读）

1. **新表进 `dropAll` 清单**：`DatabaseBootstrap.dropAll()` 的表清单是手写的，
   忘了 `activityBookings` 时 reset.bat 清不干净（实测残留 2 条测试预约）。
   以后**加业务表必须同步四处**：schema.sql / Tables.java / dropAll / tableCounts。
2. **app.css 有给 PC 后台用的全局 `.topbar`**（space-between + 58px 高 + 白底），
   会污染手机端的绿色顶栏——手机端 `.topbar` 必须逐项覆盖（position/height/justify）。
3. **Vue computed 不能当带参方法用**：`knownAvatar(a)` 放进 computed 后
   `typeof app.knownAvatar === 'string'`（无参求值），模板里调用直接抛
   not a function。带参数的一律放 methods。admin/merchant 两端都踩了。
4. 顶栏标题曾被推到右边，根因就是坑 2；已修，手机端所有子页标题回归左对齐。

## 自检结果

```
smoke-test        97 / 97
browser-check     45 / 46（唯一失败仍是「登录页不展示账号」的运行痕迹，非代码问题）
四端 + 入口页截图  0 JS 异常、0 个 4xx/5xx
打卡自动播报      view=spotDetail、speaking=true（headless 实测）
登录卡片居中      1440/1920 centerOffset=0
AI 逐字           700ms 时 shown=78/full=235、streaming=true
重置后            orders 45 / bookings 0 / loginCount 0
```

## 遗留
- uni-app 端仍未重新打包（本机无 npm），PNG 图标与打包产物要等有 npm 的机器。
- 手机端活动预约的日期控件用原生 `<input type="date">`，不同浏览器样式略异，可接受。
