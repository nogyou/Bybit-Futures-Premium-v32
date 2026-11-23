plugins { id("com.android.application") }
android {
    namespace = "com.bybit.tradeterminal"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.bybit.tradeterminal.v323"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "3.2.3-structural-tp-beta"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
