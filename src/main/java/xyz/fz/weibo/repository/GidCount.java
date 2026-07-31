package xyz.fz.weibo.repository;

/**
 * 群消息计数投影，用于 {@link MessageRepository#countByGids(java.util.Collection)} 的分组聚合结果。
 */
public interface GidCount {

    long getGid();

    long getCnt();
}
