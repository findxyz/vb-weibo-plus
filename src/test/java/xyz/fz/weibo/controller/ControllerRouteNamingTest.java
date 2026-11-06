package xyz.fz.weibo.controller;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.reflect.AnnotatedElement;
import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class ControllerRouteNamingTest {

    @Test
    void controller_route_segments_use_lower_camel_case() throws ClassNotFoundException {
        var scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        var controllers = scanner.findCandidateComponents("xyz.fz.weibo.controller");
        assertThat(controllers).isNotEmpty();

        for (var definition : controllers) {
            Class<?> controller = Class.forName(definition.getBeanClassName());
            assertCamelCaseMapping(controller);
            for (Method method : controller.getDeclaredMethods()) {
                assertCamelCaseMapping(method);
            }
        }
    }

    private void assertCamelCaseMapping(AnnotatedElement element) {
        RequestMapping mapping = AnnotatedElementUtils.findMergedAnnotation(element, RequestMapping.class);
        if (mapping == null) {
            return;
        }
        for (String path : mapping.path()) {
            for (String segment : path.split("/")) {
                if (segment.isEmpty()) {
                    continue;
                }
                if (segment.startsWith("{") && segment.endsWith("}")) {
                    segment = segment.substring(1, segment.length() - 1);
                }
                assertThat(segment).as("Route %s on %s", path, element).matches("[a-z][a-zA-Z0-9]*");
            }
        }
    }
}
