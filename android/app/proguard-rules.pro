# 保持 Retrofit / Gson / OkHttp 模型
-keep class com.momusic.android.data.model.** { *; }
-keepattributes Signature
-keepattributes *Annotation*

# Gson
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapter
-keep class * implements com.google.gson.TypeAdapterFactory

# Retrofit
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
