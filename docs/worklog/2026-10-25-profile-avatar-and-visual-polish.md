# 头像与改密、统一图标体系、AI 助手重做

- 日期：2026-10-25
- 分支：`feat/profile-avatar-and-visual-polish`
- 涉及：`schema.sql` / `DatabaseBootstrap` / `Tables` / `AuthService` / `AuthController`、
  四端前端、`icons.svg`、`spot-icons.js`、`profile.js`、`logo.svg`

## 一、头像与修改密码（三端通用）

### 后端

- `users` / `merchants` / `admins` 三张表各加 `avatar TEXT`，存 **dataURL**。
  不走文件上传：这个项目要能双击部署，多一个静态目录写权限就多一处失败点。
- `schema.sql` 用的是 `CREATE TABLE IF NOT EXISTS`，**改它不会补到已存在的表**，
  所以在 `DatabaseBootstrap` 里加了幂等的 `ensureColumn()`（查 information_schema 再 ALTER）。
  实测日志：`已为 users / merchants / admins 补上 avatar 列`。
- **`Tables.java` 里还有一份硬编码的列清单**，漏了它 `db.update()` 会静默丢掉该列 ——
  第一次上传头像返回「服务异常」就是这里，补上 `avatar` 才通。
- 新接口：
  - `PUT /api/auth/avatar`（校验 `data:image/` 前缀 + 体积 ≤400KB）
  - `POST /api/auth/password`（校验原密码、长度 6–32、新旧不能相同；改完清 `rememberToken`）
- `publicProfile()` 会原样带出所有列，所以 `/me` 自动多了 `avatar`；
  快捷登录卡片 `toCard()` 也补了 `avatar`。

### 前端

`assets/js/profile.js`（三端共用）：`initials()` 兜底首字、`avatarOf()` 取有效头像、
`compress()` 居中裁方 + 160×160 JPEG(q0.82)（一般 6–12KB）、`upload()` 调接口。

| 端 | 位置 | 能力 |
| --- | --- | --- |
| 游客端手机 | 「我的」页左上角头像 | 点击上传、改密（底部弹窗）、退出 |
| 游客端电脑 | 导航右上角头像 | 点击上传、菜单改密 |
| 商家端 | 顶栏右侧头像 + 菜单「个人中心」 | 个人中心页：改头像、改密、退出 |
| 管理端 | 顶栏右侧头像 | 下拉「更换头像 / 修改密码」 |

商家端「个人中心」按用户要求放在**营收统计右侧**，与其它菜单同一套 `tab` 切换方式。

## 二、统一项目图标

新增 `assets/img/logo.svg`：圆角方印里嵌「川西屋檐 + 院落墙体 + 田垄」，
和平台「集章打卡」的逻辑呼应。四端左上角统一替换掉了原来的「旗 / 坊」文字方块
（手机版按要求不使用）。

## 三、印章与扇形图

- **印章不再用单字**（旗/院/鞋/稻）：新增 8 个点位图标（info / museum / book / radish /
  jar / path / market / leaf），配合 `assets/js/spot-icons.js` 做「点位 id → 图标」映射，
  没配到的按点位类型兜底。
- **首页扇形图重做**：原来是 `conic-gradient` 环 + 中间一个「印」字；
  现在是 SVG 逐段扇区（一个点位一段），已打卡的点亮，中间是印章图标 + 百分比。
- 踩坑：`iconOf()` 里先取 `id` 会拿到印章记录自己的 `st1/st2`，映射全部落空、
  三枚印章长得一模一样；必须**先取 `spotId`**。

## 四、电脑版调整

- **登录页比例**：`1.15fr .85fr` → `minmax(0,1fr) minmax(400px,520px)`，
  右侧表单区收窄，不再是一大块空白里悬着两个输入框。
- **AI 助手重做**：从「左内容 + 右提示栏」改成单列居中（最大 880px）的对话式布局：
  一问一答气泡 + 打字动画 + 输入框吸底。
- **去掉知识库来源引用**：`ai-sources` 区块删除（后端仍返回 `sources`，只是不展示）。
- **新增「猜你想问」**：按当前问答命中的关键词从 10 个候选里挑 4 个，纯前端生成，不额外调接口。

## 五、图片素材：已验证可行，本轮未替换

用户要求「在可靠的开源图片网站选取合适图片替换现有素材」。实测结论：

- `images.unsplash.com` / `images.pexels.com` 的**图片直链可访问**（下载 1200×800 正常）；
- 但 `unsplash.com` / `pexels.com` 的**搜索页被反爬拦截**（401 / 403），
  `api.openverse.org`、`commons.wikimedia.org` 也不通；
- 只能靠搜索引擎逐张定位照片 ID 再拼 CDN 地址，18 张素材需要 18 次检索 + 下载。

本轮时间被头像/改密/印章/扇形图等功能项占满，**图片保持上一轮的 AI 写实图**，
未做替换。后续要做的话，按 `spot-*.jpg` / `goods-*.jpg` 同名覆盖即可，代码不用动。

## 六、验证

| 项 | 结果 |
| --- | --- |
| `smoke-test.js` | **97 / 97** |
| 头像上传 → `/me` 回读 | ✅ |
| 非法头像（非 dataURL） | ✅ 被拒 |
| 原密码错误 / 改密成功 / 新密码登录 / 改回 | ✅ 全通 |
| 管理员改头像 | ✅ |
| 手机版扇形图 | 14 段，3 枚已点亮，中间无「印」字 |
| 手机版印章墙 | 3 个不同图标（布鞋 / 林盘 / 游客中心） |
| 电脑版 AI | 回答正常、猜你想问 4 条、来源引用 **0** 条 |
| 商家个人中心 | 入口在营收统计右侧，页面渲染正常 |
| 四端截图 | 无 4xx、无 JS 异常 |

## 七、遗留

1. 开源图片替换未做（原因见第五节）。
2. 电脑版「研学民宿」仍无独立页（沿用商城下单）。
