package xyz.fz.weibo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
        properties = {
            "weibo.database-path=:memory:",
            "weibo.cookie-file=target/openapi-test.cookie"
        })
@AutoConfigureMockMvc
@ActiveProfiles("dev")
class OpenApiDocumentationTest {

    private static final Path SHARED_CONTRACT = Path.of("../openapi.json");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    @Test
    void openapi_describes_stable_local_interfaces_only() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openapi", startsWith("3.")))
                .andExpect(jsonPath("$.info.title").value("vb-weibo-plus"))
                .andExpect(jsonPath("$.paths['/post/list']").exists())
                .andExpect(jsonPath("$.paths['/chat/messages']").exists())
                .andExpect(jsonPath("$.paths['/weibo/blog/mymblog']").doesNotExist());
    }

    @Test
    void openapi_matches_shared_backend_contract() throws Exception {
        String body =
                mockMvc.perform(get("/v3/api-docs"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString(StandardCharsets.UTF_8);
        ObjectNode actual = (ObjectNode) objectMapper.readTree(body);
        actual.remove("servers");
        JsonNode expected =
                objectMapper.readTree(Files.readString(SHARED_CONTRACT, StandardCharsets.UTF_8));
        assertThat(actual).isEqualTo(expected);
    }

    @Test
    void swagger_ui_is_available_at_the_documented_path() throws Exception {
        mockMvc.perform(get("/swagger-ui.html"))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", "/swagger-ui/index.html"));
    }
}
