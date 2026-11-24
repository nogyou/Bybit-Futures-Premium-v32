plugins { id("com.android.application") }
android {
    namespace = "com.bybit.tradeterminal"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.bybit.tradeterminal.v327"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "3.2.7-clean-price-zones-beta"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
