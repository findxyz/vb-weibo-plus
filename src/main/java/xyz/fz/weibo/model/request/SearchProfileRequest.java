package xyz.fz.weibo.model.request;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * searchProfile 接口请求参数。
 * <p>
 * starttime / endtime 为秒级时间戳，用于按时间范围筛选用户微博。
 */
public record SearchProfileRequest(Long uid, Integer page, Long starttime, Long endtime) {

    public Map<String, String> toParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("uid", uid == null ? null : uid.toString());
        params.put("page", page == null ? null : page.toString());
        params.put("starttime", starttime == null ? null : starttime.toString());
        params.put("endtime", endtime == null ? null : endtime.toString());
        params.put("hasori", "1");
        params.put("hasret", "1");
        params.put("hastext", "1");
        params.put("haspic", "1");
        params.put("hasvideo", "1");
        params.put("hasmusic", "1");
        return params;
    }
}
