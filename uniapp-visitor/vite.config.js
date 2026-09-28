/*
 * uni-app 构建配置（Vue 3 + Vite）
 *
 * H5 的 base 设为 /visitor/ ：打包产物会放进后端的 static/visitor/ 目录，
 * 由 SpringBoot 一起托管，所以浏览器访问 http://<服务器地址>:8080/visitor/ 即可打开。
 * 这样 H5 与接口同源，既不用配跨域，也不需要在前端写任何服务器地址。
 */
import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

export default defineConfig({
  plugins: [uni()],
  base: '/visitor/',
});
