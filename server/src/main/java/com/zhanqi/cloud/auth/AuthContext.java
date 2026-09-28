package com.zhanqi.cloud.auth;

/**
 * 请求级登录上下文（ThreadLocal）。
 *
 * <p>由 {@link AuthInterceptor} 在请求进入时写入、请求结束时清理，
 * 业务代码里通过 {@code AuthContext.current()} 拿到当前登录者，
 * 不必在方法签名里层层传 token。
 */
public final class AuthContext {

    private static final ThreadLocal<SessionUser> HOLDER = new ThreadLocal<>();

    private AuthContext() {
    }

    public static void set(SessionUser user) {
        HOLDER.set(user);
    }

    /** 当前登录者，未登录返回 null */
    public static SessionUser current() {
        return HOLDER.get();
    }

    /** 当前登录者，未登录抛 401 */
    public static SessionUser require() {
        SessionUser me = HOLDER.get();
        if (me == null) {
            throw com.zhanqi.cloud.common.ApiException.unauthorized("登录已过期，请重新登录");
        }
        return me;
    }

    public static void clear() {
        HOLDER.remove();
    }
}
