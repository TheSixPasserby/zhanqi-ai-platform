package com.zhanqi.cloud.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 角色限制注解。
 *
 * <p>加在 Controller 类或方法上，由 {@link AuthInterceptor} 检查：
 * <pre>
 *   &#64;RequireRole("admin")                      // 仅管理员
 *   &#64;RequireRole({"buyer", "merchant"})         // 买家或商家
 *   // 不加注解 = 公开接口（未登录也能访问）
 * </pre>
 * 未登录返回 401，角色不匹配返回 403，权限文案由拦截器按角色自动生成。
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequireRole {

    String[] value();
}
