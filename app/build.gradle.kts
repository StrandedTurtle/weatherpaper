plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.sylcolabs.weatherpaper"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.sylcolabs.weatherpaper"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Signed with the debug key so CI produces an installable, fully shrunk APK.
            // This is a personal sideload build, not a Play Store artifact.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = false
        resValues = false
    }
}

// No dependencies. Everything this app needs is in the Android framework:
// WallpaperService, Canvas, HttpURLConnection, org.json, LocationManager, SharedPreferences.
dependencies {}
