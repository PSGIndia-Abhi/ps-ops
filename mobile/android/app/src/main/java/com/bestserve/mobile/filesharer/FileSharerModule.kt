package com.bestserve.mobile.filesharer

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Shares a file (a quotation PDF) through Android's own share sheet - the same "Share" every app
 * shows, listing WhatsApp, Gmail, Bluetooth, Drive... React Native's Share API can only share text,
 * so this hands the file over with a content:// link from the FileProvider react-native-blob-util
 * already declares (authority "<applicationId>.provider", which covers the app's cache folder).
 *
 * A small in-app native module for the same reason LocationEnabler is one: a few lines against an
 * Android API, not worth a third-party package.
 */
class FileSharerModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "FileSharer"

  @ReactMethod
  fun share(path: String, mimeType: String, title: String, message: String?, promise: Promise) {
    try {
      val file = File(path.removePrefix("file://"))
      if (!file.exists()) {
        promise.reject("NO_FILE", "The file to share was not found.")
        return
      }
      val uri = androidx.core.content.FileProvider.getUriForFile(
        reactContext,
        "${reactContext.packageName}.provider",
        file,
      )
      val send = Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_SUBJECT, title)
        if (!message.isNullOrBlank()) putExtra(Intent.EXTRA_TEXT, message)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(send, title).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val activity = reactContext.currentActivity
      if (activity != null) activity.startActivity(chooser) else reactContext.startActivity(chooser)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SHARE_FAILED", e.message ?: "Could not open the share sheet.", e)
    }
  }
}
