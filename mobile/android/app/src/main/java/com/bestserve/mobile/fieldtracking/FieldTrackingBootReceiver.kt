package com.bestserve.mobile.fieldtracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * The phone was switched on again (or the app was updated) while a shift was still open: start
 * recording again without waiting for the executive to open the app. Android may refuse a location
 * service started without the app on screen; then a "tap to resume" notification asks for one tap
 * (FieldTrackingService.askToResume) - the app resumes tracking as soon as it opens.
 */
class FieldTrackingBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    if (FieldTrackingService.currentShift(context) == null) return // no shift open - nothing to do
    try {
      ContextCompat.startForegroundService(context, Intent(context, FieldTrackingService::class.java))
    } catch (e: Exception) {
      Log.w("FieldTracking", "Could not restart tracking after $action", e)
      FieldTrackingService.askToResume(context)
    }
  }
}
