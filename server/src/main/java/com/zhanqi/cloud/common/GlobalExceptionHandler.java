package com.zhanqi.cloud.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Map;

/**
 * 全局异常处理：把任何异常都收敛成 {@code { ok:false, error:"中文提示" }}。
 *
 * <p>这样做的意义是「接口不会把 Java 堆栈吐给前端」——
 * 前端永远只需要处理一种结构，任何一个接口出错都能弹出人话提示。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(ApiException e) {
        // 业务异常本身就是给人看的，不再打堆栈
        log.debug("业务异常 {} {}", e.getStatus(), e.getMessage());
        return ResponseEntity.status(e.getStatus()).body(R.err(e.getMessage()));
    }

    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<Map<String, Object>> handleDuplicate(DuplicateKeyException e) {
        log.warn("唯一键冲突：{}", e.getMessage());
        return ResponseEntity.badRequest().body(R.err("数据已存在，请勿重复提交"));
    }

    @ExceptionHandler({MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(Exception e) {
        return ResponseEntity.badRequest().body(R.err("请求参数类型不正确"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> handleMethod(HttpRequestMethodNotSupportedException e) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(R.err("请求方式不正确：" + e.getMethod()));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(NoResourceFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(R.err("资源不存在：" + e.getResourcePath()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleOther(Exception e) {
        log.error("服务端异常", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(R.err("服务异常，请稍后重试"));
    }
}
