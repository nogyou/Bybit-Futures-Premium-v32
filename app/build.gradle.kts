plugins { id("com.android.application") }
android {
    namespace = "com.bybit.tradeterminal"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.bybit.tradeterminal.v32"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "3.2.0-beta1"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
