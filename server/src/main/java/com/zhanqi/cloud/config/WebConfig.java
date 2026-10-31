package com.zhanqi.cloud.config;

import com.zhanqi.cloud.auth.AuthInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web 层配置。
 *
 * <ul>
 *   <li>把鉴权拦截器挂在 {@code /api/**} 上，静态页面不受影响；</li>
 *   <li>给三个端各配两条地址规则：{@code /admin} 补斜杠跳到 {@code /admin/}，
 *       {@code /admin/} 再转发到 {@code /admin/index.html}。静态目录本身不会被
 *       自动当成首页，少了第二条就会出现「地址打不开」；</li>
 *   <li>放开跨域，方便用 HBuilderX / 浏览器调试工具直接打接口。</li>
 * </ul>
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    /** 三端各自的静态目录 */
    private static final String[] ENDS = {"/admin", "/merchant", "/visitor"};

    private final AuthInterceptor authInterceptor;

    public WebConfig(AuthInterceptor authInterceptor) {
        this.authInterceptor = authInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor).addPathPatterns("/api/**");
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        for (String end : ENDS) {
            registry.addRedirectViewController(end, end + "/");
            registry.addViewController(end + "/").setViewName("forward:" + end + "/index.html");
        }
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
