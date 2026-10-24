# 迹忆 Android 原生壳

这是一个**轻量 Android WebView 壳工程**，把当前的移动端 Web 小程序完整装进 APK。用户安装后从桌面打开，不需要浏览器地址栏，也不需要部署到公网。

> 当前仓库是完整源码；本机没有 JDK / Android SDK，且外网受限，因此这个环境内没有直接编译出 APK。下面给出 Android Studio、Gradle 和 GitHub Actions 三种出包方式。

## 已集成的原生能力

- **本地 HTTPS 安全源**：通过 `shouldInterceptRequest` 把 APK 内的 `assets/www` 映射为 `https://appassets.androidplatform.net`，满足定位、IndexedDB、Canvas 录制对安全上下文的要求。
- **GPS 定位**：WebView 开启 geolocation，原生侧请求 `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` 并回传授权结果。
- **拍照 / 相册 / 视频**：实现 `onShowFileChooser`；`capture` 输入会打开系统相机，普通输入打开系统相册/文件选择器。
- **视频保存到相册**：页面通过 `JiyiAndroid` 桥把生成的 Vlog 分块传给原生，原生写入 `Movies/迹忆`（MediaStore），失败时回退到应用专属目录。
- **系统分享**：保存后调用 Android 分享面板，可发到微信、相册、文件等。
- **保持屏幕常亮**：记录中和导出视频时调用原生 `FLAG_KEEP_SCREEN_ON`。
- **返回键**：优先在 WebView 内返回，再退出 App。
- **边到边安全区**：处理状态栏、导航栏、刘海和输入法 inset。
- **启动页 / 原生图标 / 竖屏**：已配置。

## 环境要求

- Android Studio（建议 Ladybug 或更新）
- JDK 17
- Android SDK 35、Build-Tools 35.0.0
- Gradle 8.9
- 最低 Android 10（API 29）

## 方式一：Android Studio 构建（推荐本地）

1. 安装 Android Studio，打开 **Open**，选择本项目的 `android` 目录。
2. 等待 Gradle Sync；如果提示 SDK 缺失，安装 Android SDK Platform 35 和 Build-Tools 35.0.0。
3. 连接手机开启 USB 调试，点击 Run。
4. 或菜单 **Build → Build Bundle(s) / APK(s) → Build APK(s)**。
5. 生成位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

`debug` 包的包名是 `com.jiyi.trailmemoir.debug`，可与正式包同时安装，方便测试。

## 方式二：命令行 Gradle

```bash
cd android
gradle assembleDebug
```

项目没有附带 `gradle-wrapper.jar`；请使用本机 Gradle 8.9 或 Android Studio 自带的 Gradle。

正式包：

```bash
gradle assembleRelease
```

输出：

```text
android/app/build/outputs/apk/release/app-release.apk
```

当前 `release` 使用 Android 默认 debug 签名，方便直接安装测试。**发布到应用商店前必须替换为你自己的 keystore**，否则以后无法用同一签名升级。

## 方式三：GitHub Actions 云端出 APK（无需本机 Android SDK）

仓库已包含：

```text
.github/workflows/android-apk.yml
```

1. 把项目推到 GitHub。
2. 打开仓库 **Actions → Build Android APK → Run workflow**。
3. 完成后在该次 run 的 Artifacts 中下载 `jiyi-android-apks`。
4. 解压得到 `app-debug.apk` 和 `app-release.apk`；推荐把 `app-release.apk` 传到 Android 手机上安装。

工作流会自动安装 JDK 17、Android SDK 35、Gradle 8.9，并把最新 Web 资源同步进 APK。

## Web 资源同步

Web 应用和 Android 壳的 `assets/www` 是分离的。修改 `js/`、`assets/` 或 `index.html` 后，在 Windows 执行：

```powershell
powershell -ExecutionPolicy Bypass -File android\sync-web.ps1
```

或手动把以下内容复制到 `android/app/src/main/assets/www`：

```text
index.html
manifest.webmanifest
sw.js
assets/
js/
```

当前已同步一份可直接构建的副本。原生壳内会跳过 Service Worker 注册，直接使用本地资源。

## 目录说明

```text
android/
├─ settings.gradle
├─ build.gradle
├─ sync-web.ps1
└─ app/
   ├─ build.gradle
   └─ src/main/
      ├─ AndroidManifest.xml
      ├─ java/com/jiyi/trailmemoir/MainActivity.java
      ├─ res/...
      └─ assets/www/              # 当前 Web 应用副本
```

## 定位双通道

有些国产 ROM 的 WebView 没有可用的定位 Provider，会出现“WebView 有定位 API，但一直超时”的情况。因此原生壳加了 **LocationManager 后备通道**：

- WebView geolocation 仍保留；
- 页面调用 `JiyiAndroid.startLocationUpdates()` 时，原生同时监听 `GPS_PROVIDER` 和 `NETWORK_PROVIDER`；
- Web 端每 900ms 读取 `getLocationJson()`，把经纬度、精度、海拔、速度、方向交给轨迹记录器；
- 原生权限被拒绝、GPS 关闭或没有 Provider 时，`getLocationError()` 会返回明确原因。

所以现在即使 WebView 的定位实现失效，原生壳也会优先使用系统定位。

## 已知边界

- **没有后台定位**：App 退到后台后，系统可能暂停位置更新。徒步时请保持 App 在前台；如果需要锁屏记录，还需增加前台服务。
- **视频编码依赖 WebView**：现代 Android WebView（Chromium）支持 `canvas.captureStream` 和 `MediaRecorder`。极旧或定制 WebView 可能不支持，界面会显示“不支持视频导出”。
- **WebM 相册兼容性**：部分相册不索引 WebM。文件会保存到 `Movies/迹忆`，可在“文件”中找到，也可直接用分享面板发送。
- **地图瓦片**：在线标准地图需要网络；无网络时自动使用手绘轨迹示意图。
- **未做 release 签名**：见上文，正式分发前替换签名。
- **iPhone**：这个工程只适用于 Android；iPhone 请使用 PWA「添加到主屏幕」或 Apple 开发者账号分发。

## 原生桥接口

JavaScript 侧检测到 `window.JiyiAndroid` 后会启用原生保存/分享：

```text
beginSave(filename, mimeType) -> boolean
appendSave(base64Chunk)       -> boolean
finishSave()                  -> content:// URI 或 ""
shareLast()                   -> 打开系统分享面板
toast(message)
setKeepScreenOn(boolean)
isNativeApp()                 -> true

startLocationUpdates()
stopLocationUpdates()
getLocationJson()             -> JSON 或 ""
getLocationError()            -> 错误文本或 ""
```

视频会按 96KB 分块进行 Base64 传输，避免一次性把十几 MB 的 Blob 塞进 JS Bridge。
