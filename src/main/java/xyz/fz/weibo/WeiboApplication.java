package xyz.fz.weibo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableAsync
public class WeiboApplication {

    public static void main(String[] args) {
        // 微博 WebSocket 站点未返回中间证书，允许 JDK 从指定的 DigiCert 地址补全证书链。
        System.setProperty("com.sun.security.enableAIAcaIssuers", "true");
        System.setProperty("com.sun.security.allowedAIALocations",
                "http://cacerts.digicert.cn/GeoTrustG2TLSCNRSA4096SHA2562022CA1.crt");
        SpringApplication.run(WeiboApplication.class, args);
    }
}
