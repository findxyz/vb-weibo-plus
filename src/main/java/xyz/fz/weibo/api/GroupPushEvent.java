package xyz.fz.weibo.api;

import com.fasterxml.jackson.databind.JsonNode;

public record GroupPushEvent(JsonNode data) {
}
