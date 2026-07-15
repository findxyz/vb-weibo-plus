package xyz.fz.weibo;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "weibo.database-path=:memory:",
        "weibo.cookie-file=target/openapi-disabled-test.cookie"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OpenApiDisabledByDefaultTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void documentation_endpoints_are_disabled_outside_dev_profile() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/swagger-ui.html"))
                .andExpect(status().isNotFound());
    }
}
