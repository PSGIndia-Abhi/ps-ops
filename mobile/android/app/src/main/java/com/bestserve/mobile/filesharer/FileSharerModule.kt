package com.bestserve.mobile.filesharer

import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.ReadableArray
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

  /**
   * An email with files attached (the quotation PDF, later the company profile too), offered only to
   * email apps (Gmail, Outlook...): the to / subject / body are filled in for the salesperson to check.
   */
  @ReactMethod
  fun email(paths: ReadableArray, to: String?, subject: String, body: String, promise: Promise) {
    try {
      val uris = ArrayList<Uri>()
      for (i in 0 until paths.size()) {
        val file = File((paths.getString(i) ?: "").removePrefix("file://"))
        if (!file.exists()) {
          promise.reject("NO_FILE", "The file to attach was not found.")
          return
        }
        uris.add(androidx.core.content.FileProvider.getUriForFile(reactContext, "${reactContext.packageName}.provider", file))
      }
      // The email apps are the ones that open mailto: links (the manifest's <queries> lets us see them).
      val pm = reactContext.packageManager
      val emailApps = pm.queryIntentActivities(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")), 0)
        .map { it.activityInfo.packageName }
        .distinct()
      if (emailApps.isEmpty()) {
        promise.reject("NO_EMAIL_APP", "No email app on this phone. Install Gmail, or use Share.")
        return
      }
      // The same email, with the files attached, for one email app.
      fun emailFor(pkg: String) = Intent(if (uris.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply {
        type = "application/pdf"
        setPackage(pkg)
        if (uris.size == 1) putExtra(Intent.EXTRA_STREAM, uris[0]) else putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
        if (!to.isNullOrBlank()) putExtra(Intent.EXTRA_EMAIL, arrayOf(to))
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, body)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      // One email app: straight into it. Several (Gmail, Outlook...): a chooser of just those.
      val launch = if (emailApps.size == 1) {
        emailFor(emailApps[0])
      } else {
        Intent.createChooser(emailFor(emailApps[0]), "Send email").apply {
          putExtra(Intent.EXTRA_INITIAL_INTENTS, emailApps.drop(1).map { emailFor(it) }.toTypedArray())
        }
      }
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      launch.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      val activity = reactContext.currentActivity
      if (activity != null) activity.startActivity(launch) else reactContext.startActivity(launch)
      promise.resolve(true)
    } catch (e: android.content.ActivityNotFoundException) {
      promise.reject("NO_EMAIL_APP", "No email app on this phone. Install Gmail, or use Share.", e)
    } catch (e: Exception) {
      promise.reject("EMAIL_FAILED", e.message ?: "Could not open the email app.", e)
    }
  }
}
