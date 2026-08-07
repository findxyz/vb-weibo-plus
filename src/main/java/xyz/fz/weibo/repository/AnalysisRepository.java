package xyz.fz.weibo.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.domain.PageRequest;
import xyz.fz.weibo.entity.AnalysisEntity;

public interface AnalysisRepository extends JpaRepository<AnalysisEntity, Long>, JpaSpecificationExecutor<AnalysisEntity> {

    default Page<AnalysisEntity> findPage(long gid, Pageable pageable) {
        Specification<AnalysisEntity> specification = (root, query, builder) ->
                builder.equal(root.get("gid"), gid);
        return findAll(specification, pageable);
    }

    static Pageable pageRequest(int page, int size) {
        Sort sort = Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
        return PageRequest.of(page - 1, size, sort);
    }
}
