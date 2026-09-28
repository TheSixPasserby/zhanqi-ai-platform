package com.zhanqi.cloud.auth;

import com.zhanqi.cloud.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Arrays;
import java.util.List;

/**
 * 鉴权拦截器。
 *
 * <p>只挂在 {@code /api/**} 上（见 {@code WebConfig}），静态页面与资源不受影响。
 * 流程：解析令牌 → 写入 {@link AuthContext} → 检查 {@link RequireRole}。
 * 拦截器里抛出的异常同样会被 {@code GlobalExceptionHandler} 兜住，
 * 所以前端拿到的仍然是标准的 {@code { ok:false, error:"..." }}。
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final AuthService authService;

    public AuthInterceptor(AuthService authService) {
        this.authService = authService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod method)) {
            return true;
        }

        SessionUser me = authService.resolve(request);
        AuthContext.set(me);

        RequireRole rule = method.getMethodAnnotation(RequireRole.class);
        if (rule == null) {
            rule = method.getBeanType().getAnnotation(RequireRole.class);
        }
        if (rule == null) {
            return true;
        }

        if (me == null) {
            throw ApiException.unauthorized("登录已过期，请重新登录");
        }

        List<String> allowed = Arrays.asList(rule.value());
        if (!allowed.contains(me.role())) {
            throw ApiException.forbidden(forbiddenText(allowed));
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                               Object handler, Exception ex) {
        // 线程会被复用，必须清理，否则下一个请求可能读到上一个请求的登录态
        AuthContext.clear();
    }

    /** 按允许的角色生成人话提示，前端可以直接弹给用户 */
    private String forbiddenText(List<String> allowed) {
        if (allowed.size() == 1) {
            return switch (allowed.get(0)) {
                case "buyer" -> "该操作仅买家（游客）可用";
                case "merchant" -> "该操作仅商家可用";
                case "admin" -> "该操作仅平台管理员可用";
                default -> "当前账号无权访问该接口";
            };
        }
        return "当前账号无权访问该接口";
    }
}
