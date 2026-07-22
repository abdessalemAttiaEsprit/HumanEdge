# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM eclipse-temurin:17-jdk-jammy AS build
WORKDIR /build

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw
RUN --mount=type=cache,target=/root/.m2 \
    for i in 1 2 3; do ./mvnw -B dependency:go-offline && break || { echo "retry $i..."; sleep 5; }; done

COPY src ./src
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B clean package -DskipTests

# ---- Runtime stage ----
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

RUN groupadd --system spring && useradd --system --gid spring spring \
    && mkdir -p /app/uploads && chown -R spring:spring /app

COPY --from=build --chown=spring:spring /build/target/*.jar app.jar

USER spring
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
