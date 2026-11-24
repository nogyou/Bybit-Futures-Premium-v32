plugins { id("com.android.application") }
android {
    namespace = "com.bybit.tradeterminal"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.bybit.tradeterminal.v328"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "3.2.8-signal-alert-beta"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
