# 商户端聊天空白：`.chat-body` 漏了 flex 容器

- 日期：2026-10-30
- 作者：lead（DeepSeek Harness Team）

## 现象

商户工作台发送消息后，聊天区仍有大片无意义空白。
上一轮我给 PC 游客端和商户端都加了 `.chat-body > .chat-messages { margin-top: auto; }`，
PC 端修好了，**商户端没有** —— 用户复测后仍然报空白。

## 根因

`margin-top: auto` 只在**父容器是 flex 容器**时生效。对照两端：

```css
/* PC 游客端（正确） */
.chat-body { flex: 1; overflow-y: auto; padding: 20px;
             display: flex; flex-direction: column; gap: 16px; }

/* 商户端（缺 display / flex-direction） */
.chat-body { flex: 1; overflow-y: auto; padding: 18px; }
```

商户端 `.chat-body` 是 `display: block`，所以 `margin-top: auto` **是无效声明**
（块级元素的垂直外边距 auto 恒为 0），消息照旧从顶部堆叠、底部留白。

## 为什么上一轮自检「通过」了却没修好（这是最有价值的一条）

上一轮我用**消息多**的会话验证（m1 有 13 条）：内容溢出后滚到底，
末条正好贴住 padding，看起来是对的；而那时 `margin-top` 读数确实是 `0px`，
我还以为是「内容溢出时 auto 归零属正常」—— 这个判断本身没错，
但我**没有换消息少的会话再验一遍**，于是漏掉了真正失效的场景。

正确做法：贴底类修复**必须用内容不溢出的数据验证**，
那时候 `margin-top` 才会真正计算成一个非零值。这一条已写进 agent-memory。

## 修法

补齐商户端 `.chat-body` 为 flex 容器，同时把背景渐变里写死的 `#FBFAF7/#FFFFFF`
换成 `var(--surface-2)/var(--surface)`，顺带修掉深色主题下这块仍是浅色的问题。

## 验证（用 1 条消息的新会话）

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| `chat-body` display | `block` | **`flex`** |
| `margin-top` 计算值 | `0px`（无效） | **`511.7px`** |
| 消息组顶部位置 | 贴顶（下方大片空白） | **上方留白 530px** |
| 末条距输入区 | — | **18px**（贴底） |

## 顺带修的一条被破坏的既有断言

`提交订单成功并回到订单列表` 一直失败（`checkout: true`、`orders: 0`）。
不是这轮的改动引起，而是上一轮「混合结算逐项表单」改了数据模型：
地址从全局 `vm.address` 改成每项的 `cart[i].form.address`，
而这条断言还在设 `vm.address`，被逐项校验拦下。已改成按 `checkoutLines()` 逐项填。

**教训：改了数据模型之后，要全量跑一遍自检，别只看自己新写的那几条。**

## 自检结果

| 检查 | 结果 |
| --- | --- |
| `normalize-scripts.js --check` | 通过 |
| `smoke-test.js` | **159/159** |
| `browser-check.js` | **74/74**（新增 4 项商户端聊天哨兵） |
| 商户端 1 条消息会话实测 | 5/5 |

## 遗留

聊天区高度 `calc(100vh - 178px)` 在超宽屏上略显空，但没有功能性影响，暂不动。
