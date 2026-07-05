const { createRunOncePlugin, withAppBuildGradle, withProjectBuildGradle } = require("@expo/config-plugins");

const APP_LINT_BLOCK = `lint {
        checkReleaseBuilds false
        abortOnError false
    }`;

const PROJECT_LINT_TASK_BLOCK = `
// A2B release builds are validated by Play/App Store checks; do not let
// third-party library lintVital tasks block local release packaging.
subprojects { subproject ->
    subproject.tasks.configureEach { task ->
        if (task.name.startsWith("lintVital") || task.name == "lintRelease") {
            task.enabled = false
        }
    }
}
`;

const withAndroidReleaseLintDisabled = (config) =>
  withProjectBuildGradle(
    withAppBuildGradle(config, (config) => {
      if (config.modResults.language !== "groovy") {
        return config;
      }

      if (config.modResults.contents.includes("checkReleaseBuilds false")) {
        return config;
      }

      config.modResults.contents = config.modResults.contents.replace(
        /android\s*\{/,
        `android {
    ${APP_LINT_BLOCK}`
      );

      return config;
    }),
    (config) => {
    if (config.modResults.language !== "groovy") {
      return config;
    }

    if (config.modResults.contents.includes("third-party library lintVital tasks")) {
      return config;
    }

    config.modResults.contents = `${config.modResults.contents.trimEnd()}\n${PROJECT_LINT_TASK_BLOCK}`;

    return config;
    }
  );

module.exports = createRunOncePlugin(
  withAndroidReleaseLintDisabled,
  "with-android-release-lint-disabled",
  "1.0.1"
);
