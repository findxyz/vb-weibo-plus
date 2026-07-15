package xyz.fz.weibo.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI weiboOpenApi() {
        return new OpenAPI().info(new Info()
                .title("vb-weibo-plus")
                .description("单用户本地微博客户端服务接口。")
                .version("1.0.0"));
    }
}
