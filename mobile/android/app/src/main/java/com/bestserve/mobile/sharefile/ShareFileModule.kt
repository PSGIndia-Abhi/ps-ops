package com.bestserve.mobile.sharefile

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Sends a file from the app's cache/files folder to another app (Android share).
 * target: "whatsapp" (WhatsApp, then WhatsApp Business), "email" (email apps only) or "any" (share sheet
 * with WhatsApp and the email apps pinned at the front).
 * Uses the FileProvider already declared by react-native-blob-util ("<package>.provider").
 */
class ShareFileModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "ShareFile"

  @ReactMethod
  fun share(path: String, mimeType: String, target: String, subject: String?, text: String?, promise: Promise) {
    try {
      val file = File(path.removePrefix("file://"))
      if (!file.exists()) {
        promise.reject("NO_FILE", "The file is missing. Download it again.")
        return
      }
      val uri: Uri = FileProvider.getUriForFile(context, "${context.packageName}.provider", file)

      fun sendIntent() = Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        if (!subject.isNullOrBlank()) putExtra(Intent.EXTRA_SUBJECT, subject)
        if (!text.isNullOrBlank()) putExtra(Intent.EXTRA_TEXT, text)
        clipData = ClipData.newRawUri(file.name, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      when (target) {
        "whatsapp" -> {
          for (pkg in listOf("com.whatsapp", "com.whatsapp.w4b")) {
            try {
              context.startActivity(sendIntent().setPackage(pkg))
              promise.resolve(true)
              return
            } catch (_: ActivityNotFoundException) {
              // try the next WhatsApp app
            }
          }
          promise.reject("NO_APP", "WhatsApp is not installed on this phone.")
        }
        "email" -> {
          // The selector limits the choice to email apps; the attachment still goes with ACTION_SEND.
          val intent = sendIntent().apply { selector = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")) }
          try {
            context.startActivity(intent)
            promise.resolve(true)
          } catch (_: ActivityNotFoundException) {
            promise.reject("NO_APP", "No email app is set up on this phone.")
          }
        }
        else -> {
          // WhatsApp and email apps first (only those installed), then Android's usual list.
          val pm = context.packageManager
          val pinned = mutableListOf<Intent>()
          for (pkg in listOf("com.whatsapp", "com.whatsapp.w4b")) {
            val i = sendIntent().setPackage(pkg)
            if (i.resolveActivity(pm) != null) pinned.add(i)
          }
          @Suppress("DEPRECATION")
          val mailApps = pm.queryIntentActivities(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")), 0)
            .map { it.activityInfo.packageName }.distinct()
          for (pkg in mailApps) {
            val i = sendIntent().setPackage(pkg)
            if (i.resolveActivity(pm) != null) pinned.add(i)
          }
          val chooser = Intent.createChooser(sendIntent(), subject ?: "Share").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            if (pinned.isNotEmpty()) putExtra(Intent.EXTRA_INITIAL_INTENTS, pinned.toTypedArray())
          }
          context.startActivity(chooser)
          promise.resolve(true)
        }
      }
    } catch (e: Exception) {
      promise.reject("SHARE_FAILED", e.message ?: "Could not share the file", e)
    }
  }
}
