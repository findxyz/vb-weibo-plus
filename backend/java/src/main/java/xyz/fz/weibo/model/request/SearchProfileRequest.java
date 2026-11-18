package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;

public record SearchProfileRequest(Long uid, Integer page, Long startTime, Long endTime) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("uid", uid == null ? null : uid.toString());
        params.put("page", page == null ? null : page.toString());
        params.put("starttime", startTime == null ? null : startTime.toString());
        params.put("endtime", endTime == null ? null : endTime.toString());
        params.put("hasori", "1");
        params.put("hasret", "1");
        params.put("hastext", "1");
        params.put("haspic", "1");
        params.put("hasvideo", "1");
        params.put("hasmusic", "1");
        return params;
    }
}
