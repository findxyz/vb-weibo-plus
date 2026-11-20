package xyz.fz.weibo;

import static com.tngtech.archunit.library.Architectures.layeredArchitecture;

import com.tngtech.archunit.core.importer.Location;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.junit.LocationProvider;
import com.tngtech.archunit.lang.ArchRule;
import java.util.Set;

@AnalyzeClasses(locations = ArchitectureTest.ProductionClasses.class)
class ArchitectureTest {

    @ArchTest
    static final ArchRule layer_dependencies_follow_the_application_flow =
            layeredArchitecture()
                    .consideringOnlyDependenciesInLayers()
                    .layer("Controller")
                    .definedBy("xyz.fz.weibo.controller..")
                    .layer("Task")
                    .definedBy("xyz.fz.weibo.task..")
                    .layer("Service")
                    .definedBy("xyz.fz.weibo.service..")
                    .layer("API")
                    .definedBy("xyz.fz.weibo.api..")
                    .layer("Client")
                    .definedBy("xyz.fz.weibo.client..")
                    .layer("Repository")
                    .definedBy("xyz.fz.weibo.repository..")
                    .layer("Entity")
                    .definedBy("xyz.fz.weibo.entity..")
                    .layer("Domain")
                    .definedBy("xyz.fz.weibo.domain..")
                    .layer("Model")
                    .definedBy("xyz.fz.weibo.model..")
                    .layer("Exception")
                    .definedBy("xyz.fz.weibo.exception..")
                    .whereLayer("Controller")
                    .mayOnlyAccessLayers("Service", "API", "Client", "Domain", "Model", "Exception")
                    .whereLayer("Task")
                    .mayOnlyAccessLayers("Service", "API", "Client", "Domain")
                    .whereLayer("Service")
                    .mayOnlyAccessLayers(
                            "API", "Client", "Repository", "Entity", "Domain", "Model", "Exception")
                    .whereLayer("API")
                    .mayOnlyAccessLayers("Client", "Domain", "Model", "Exception")
                    .whereLayer("Repository")
                    .mayOnlyAccessLayers("Entity")
                    .whereLayer("Model")
                    .mayOnlyAccessLayers("Client")
                    .whereLayer("Client")
                    .mayNotAccessAnyLayer()
                    .whereLayer("Entity")
                    .mayNotAccessAnyLayer()
                    .whereLayer("Domain")
                    .mayNotAccessAnyLayer()
                    .whereLayer("Exception")
                    .mayNotAccessAnyLayer();

    static class ProductionClasses implements LocationProvider {
        @Override
        public Set<Location> get(Class<?> testClass) {
            return Set.of(
                    Location.of(
                            WeiboApplication.class
                                    .getProtectionDomain()
                                    .getCodeSource()
                                    .getLocation()));
        }
    }
}
