package com.zhanqi.cloud.common;

/**
 * 业务异常。抛出后由 {@link GlobalExceptionHandler} 统一转成
 * {@code { "ok": false, "error": "..." }} + 对应 HTTP 状态码。
 *
 * <p>约定（与接口文档一致）：
 * <ul>
 *   <li>400 参数缺失或不合法</li>
 *   <li>401 未登录 / 登录已过期 / 账号密码错误</li>
 *   <li>403 已登录但角色权限不足，或账号被停用</li>
 *   <li>404 资源不存在</li>
 * </ul>
 */
public class ApiException extends RuntimeException {

    private final int status;

    public ApiException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int getStatus() {
        return status;
    }

    public static ApiException badRequest(String message) {
        return new ApiException(400, message);
    }

    public static ApiException unauthorized(String message) {
        return new ApiException(401, message);
    }

    public static ApiException forbidden(String message) {
        return new ApiException(403, message);
    }

    public static ApiException notFound(String message) {
        return new ApiException(404, message);
    }
}
