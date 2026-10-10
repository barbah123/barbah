plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.barbah.evkamera"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.barbah.evkamera"
        minSdk = 26
        targetSdk = 34
        // CI her derlemede artan bir numara verir; güncellemeler eski sürümün üstüne kurulur.
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = "1.0.$versionCode"
    }

    // Sabit imza: güncellemeler eski sürümün üstüne kurulabilsin diye her derlemede
    // aynı anahtar kullanılır. Kişisel, mağaza dışı kurulum içindir.
    signingConfigs {
        create("release") {
            storeFile = file("../keystore/evkamera.jks")
            storePassword = "evkamera-sideload"
            keyAlias = "evkamera"
            keyPassword = "evkamera-sideload"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}
