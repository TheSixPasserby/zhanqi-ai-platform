/* ============================================================================
 *  个人资料公共工具（三端共用）：头像兜底、图片压缩、上传
 *
 *  头像存成 dataURL 直接进账号表，所以上传前必须压：
 *  手机相册里的照片动辄 3-8MB，不压的话一张头像就能把库撑大几十倍。
 *  统一裁成正方形中心区域 + 160×160 JPEG(q0.82)，一般 6-12KB。
 * ========================================================================== */
window.ZQProfile = (function () {
  'use strict';

  /** 没有自定义头像时显示的首字 */
  function initials(name) {
    var s = String(name || '').trim();
    return s ? s.slice(0, 1) : '游';
  }

  /** 从 /api/auth/me 的 profile 里取头像；空串/不存在的都算没有 */
  function avatarOf(profile) {
    if (!profile) { return ''; }
    var a = profile.avatar;
    return typeof a === 'string' && a.indexOf('data:image/') === 0 ? a : '';
  }

  /**
   * 把用户选的文件压成 160×160 JPEG dataURL。
   * @param {File} file
   * @param {function(string|null)} done
   */
  function compress(file, done) {
    var size = 160;
    if (!file) { return done(null); }
    if (file.type && file.type.indexOf('image/') !== 0) { return done(null); }

    var reader = new FileReader();
    reader.onerror = function () { done(null); };
    reader.onload = function (e) {
      var img = new Image();
      img.onerror = function () { done(null); };
      img.onload = function () {
        var side = Math.min(img.width, img.height);
        var sx = (img.width - side) / 2;
        var sy = (img.height - side) / 2;
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        // 先铺白底：PNG 透明背景转 JPEG 会变黑
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        done(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /** 上传头像，返回 Promise<{ok, avatar, message}> */
  function upload(dataUrl) {
    return window.ZQ.api.put('/api/auth/avatar', { avatar: dataUrl });
  }

  return { initials: initials, avatarOf: avatarOf, compress: compress, upload: upload };
})();
