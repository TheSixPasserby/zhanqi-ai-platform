<template>
  <view class="zq-page chat-page">
    <nav-bar title="AI 文旅助手" :subtitle="engineText" back flat>
      <view class="engine">
        <view class="engine__dot" :class="llmEnabled ? 'engine__dot--llm' : ''"></view>
        <text class="engine__text">{{ mode }}</text>
      </view>
    </nav-bar>

    <!-- 对话区 -->
    <scroll-view
      scroll-y
      class="chat"
      :scroll-into-view="scrollTo"
      :scroll-with-animation="true"
    >
      <!-- 开场白 -->
      <view class="welcome zq-rise">
        <view class="welcome__logo zq-breathe">
          <text>AI</text>
        </view>
        <text class="welcome__title">你好，我是战旗村的 AI 文旅助手</text>
        <text class="welcome__desc">
          村内点位、非遗手作、农产好物、研学预约、交通住宿都可以问我。
          我只根据村内知识库回答，找不到时会直接告诉你，不会编造内容。
        </text>
      </view>

      <!-- 消息流 -->
      <view v-for="(m, i) in messages" :key="i" :id="'msg' + i" class="msg" :class="'msg--' + m.role">
        <view class="msg__avatar" :class="'msg__avatar--' + m.role">
          <text>{{ m.role === 'user' ? '我' : 'AI' }}</text>
        </view>
        <view class="msg__bubble">
          <text class="msg__text">{{ m.role === 'assistant' ? m.shown : m.text }}</text>
          <view v-if="m.streaming" class="zq-caret"></view>

          <!-- 知识库来源：让「答案有出处」这件事看得见 -->
          <view v-if="m.sources && m.sources.length" class="src">
            <text class="src__label">知识库来源</text>
            <view class="src__tags">
              <text v-for="(s, si) in m.sources" :key="si" class="src__tag">{{ s }}</text>
            </view>
          </view>

          <!-- 未命中时的兜底提示，体现防幻觉设计 -->
          <view v-if="m.role === 'assistant' && m.matched === false" class="miss">
            <text class="miss__text">这个问题不在村内知识库里。可以换个说法，或看看下面的推荐问题。</text>
          </view>
        </view>
      </view>

      <!-- 思考中 -->
      <view v-if="thinking" class="msg msg--assistant">
        <view class="msg__avatar msg__avatar--assistant"><text>AI</text></view>
        <view class="msg__bubble">
          <view class="dots">
            <view v-for="n in 3" :key="n" class="dots__d" :style="{ animationDelay: n * 0.16 + 's' }"></view>
          </view>
        </view>
      </view>

      <view class="chat__pad"></view>
    </scroll-view>

    <!-- 推荐问题：只在没有对话时显示，避免干扰 -->
    <scroll-view v-if="!messages.length" scroll-x class="suggests" :show-scrollbar="false">
      <view class="suggests__inner">
        <view v-for="q in suggests" :key="q" class="suggests__item" @tap="ask(q)">
          <text>{{ q }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- 输入区 -->
    <view class="input-bar">
      <view class="input-bar__wrap">
        <input
          v-model="draft"
          class="input-bar__input"
          placeholder="问问战旗村的事…"
          placeholder-class="input-bar__ph"
          confirm-type="send"
          :disabled="thinking"
          @confirm="ask()"
        />
      </view>
      <view class="input-bar__send" :class="{ 'is-off': !draft.trim() || thinking }" @tap="ask()">
        <text>发送</text>
      </view>
    </view>
  </view>
</template>

<script>
import { api, toast } from '../../api/index.js';

export default {
  data() {
    return {
      draft: '',
      messages: [],
      thinking: false,
      scrollTo: '',
      llmEnabled: false,
      mode: '正在检测 AI 引擎…',
      suggests: [
        '唐昌布鞋为什么叫千层底',
        '战旗村有哪些农事体验可以预约',
        '林盘是什么意思',
        '从成都市区怎么到战旗村',
        '推荐适合带孩子去的点位',
        '今天股市怎么样',
      ],
    };
  },
  computed: {
    engineText() {
      return this.llmEnabled ? '已接入第三方大模型 + 知识库约束' : '本地知识库检索';
    },
  },
  onLoad() {
    this.loadStatus();
  },
  methods: {
    async loadStatus() {
      const res = await api.aiStatus();
      if (res && res.ok) {
        this.llmEnabled = !!res.llmEnabled;
        this.mode = res.mode || '';
      } else {
        this.mode = '本地知识库检索（零成本、断网可用）';
      }
    },
    async ask(preset) {
      const question = (typeof preset === 'string' ? preset : this.draft).trim();
      if (!question) return;
      if (this.thinking) return;

      this.draft = '';
      this.messages.push({ role: 'user', text: question });
      this.scrollBottom();

      this.thinking = true;
      const res = await api.aiAsk({ question });
      this.thinking = false;

      if (!res || !res.ok) {
        this.messages.push({
          role: 'assistant',
          text: (res && res.error) || 'AI 服务暂时不可用，请稍后再试。',
          shown: (res && res.error) || 'AI 服务暂时不可用，请稍后再试。',
          matched: true,
        });
        this.scrollBottom();
        return;
      }

      const answer = res.answer || '（没有返回内容）';
      const idx = this.messages.length;
      const msg = {
        role: 'assistant',
        text: answer,
        shown: '',
        streaming: true,
        matched: res.matched !== false,
        sources: res.sources || [],
      };
      this.messages.push(msg);
      this.scrollBottom();

      // 打字机效果：逐字显示。按总长度动态算步长，长回答也不会等太久
      const step = Math.max(1, Math.ceil(answer.length / 90));
      let cursor = 0;
      const timer = setInterval(() => {
        cursor = Math.min(answer.length, cursor + step);
        msg.shown = answer.slice(0, cursor);
        if (cursor >= answer.length) {
          clearInterval(timer);
          msg.streaming = false;
          this.scrollBottom();
        } else {
          // 边打字边跟随滚动，让用户一直看到最新内容
          this.scrollTo = 'msg' + idx;
        }
      }, 26);
    },
    scrollBottom() {
      this.$nextTick(() => {
        this.scrollTo = 'msg' + Math.max(0, this.messages.length - 1);
      });
    },
  },
};
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* -------------------------------- 引擎状态 -------------------------------- */

.engine {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.14);
  border-radius: 999rpx;
  padding: 10rpx 22rpx;
}

.engine__dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #D8D3C6;
  margin-right: 12rpx;
}

.engine__dot--llm {
  background: #7FE3B8;
  animation: blink-dot 1.6s ease-in-out infinite;
}

@keyframes blink-dot {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.35);
  }
}

.engine__text {
  color: rgba(255, 255, 255, 0.9);
  font-size: 21rpx;
}

/* -------------------------------- 对话区 -------------------------------- */

.chat {
  flex: 1;
  padding: 0 32rpx;
}

.chat__pad {
  height: 32rpx;
}

.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48rpx 20rpx 36rpx;
}

.welcome__logo {
  width: 116rpx;
  height: 116rpx;
  border-radius: 32rpx;
  background: linear-gradient(135deg, #146B57, #1D9E75);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}

.welcome__logo text {
  color: #FFFFFF;
  font-size: 44rpx;
  font-weight: 700;
}

.welcome__title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1F2A26;
  text-align: center;
}

.welcome__desc {
  font-size: 24rpx;
  color: #5C6B65;
  line-height: 1.85;
  text-align: center;
  margin-top: 14rpx;
  padding: 0 20rpx;
}

/* --------------------------------- 消息 --------------------------------- */

.msg {
  display: flex;
  margin-bottom: 28rpx;
}

.msg--user {
  flex-direction: row-reverse;
}

.msg__avatar {
  width: 68rpx;
  height: 68rpx;
  border-radius: 20rpx;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.msg__avatar text {
  font-size: 24rpx;
  font-weight: 700;
  color: #FFFFFF;
}

.msg__avatar--assistant {
  background: linear-gradient(135deg, #146B57, #1D9E75);
}

.msg__avatar--user {
  background: #BE5230;
}

.msg__bubble {
  max-width: 76%;
  margin: 0 18rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 22rpx 26rpx;
  box-shadow: 0 2rpx 8rpx rgba(31, 42, 38, 0.05);
}

.msg--user .msg__bubble {
  background: #146B57;
}

.msg__text {
  font-size: 27rpx;
  line-height: 1.85;
  color: #1F2A26;
  word-break: break-all;
}

.msg--user .msg__text {
  color: #FFFFFF;
}

/* 知识库来源 */
.src {
  margin-top: 20rpx;
  padding-top: 18rpx;
  border-top: 2rpx dashed #F1EEE7;
}

.src__label {
  display: block;
  font-size: 20rpx;
  color: #93A09A;
  margin-bottom: 12rpx;
}

.src__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.src__tag {
  font-size: 20rpx;
  color: #146B57;
  background: #E6F2ED;
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
}

.miss {
  margin-top: 16rpx;
  background: #FCF4E2;
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
}

.miss__text {
  font-size: 21rpx;
  color: #B07A18;
  line-height: 1.7;
}

/* ------------------------------- 思考中动画 ------------------------------- */

.dots {
  display: flex;
  gap: 12rpx;
  padding: 6rpx 4rpx;
}

.dots__d {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #1D9E75;
  animation: dot-up 1.1s ease-in-out infinite;
}

@keyframes dot-up {
  0%, 100% {
    transform: translateY(0);
    opacity: 0.45;
  }
  50% {
    transform: translateY(-10rpx);
    opacity: 1;
  }
}

/* -------------------------------- 推荐问题 -------------------------------- */

.suggests {
  white-space: nowrap;
  padding: 0 0 20rpx;
}

.suggests__inner {
  display: inline-flex;
  gap: 16rpx;
  padding: 0 32rpx;
}

.suggests__item {
  padding: 14rpx 28rpx;
  border-radius: 999rpx;
  background: #FFFFFF;
  border: 2rpx solid #E8E4DA;
}

.suggests__item text {
  font-size: 24rpx;
  color: #146B57;
}

/* -------------------------------- 输入区 -------------------------------- */

.input-bar {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 32rpx calc(18rpx + env(safe-area-inset-bottom));
  background: #FFFFFF;
  border-top: 2rpx solid #F1EEE7;
}

.input-bar__wrap {
  flex: 1;
}

.input-bar__input {
  height: 84rpx;
  background: #FBFAF7;
  border: 2rpx solid #E8E4DA;
  border-radius: 999rpx;
  padding: 0 30rpx;
  font-size: 27rpx;
  color: #1F2A26;
}

.input-bar__ph {
  color: #B6C0BB;
  font-size: 26rpx;
}

.input-bar__send {
  width: 140rpx;
  height: 84rpx;
  border-radius: 999rpx;
  background: #146B57;
  display: flex;
  align-items: center;
  justify-content: center;
}

.input-bar__send text {
  color: #FFFFFF;
  font-size: 27rpx;
  font-weight: 600;
}

.input-bar__send.is-off {
  opacity: 0.45;
}
</style>
