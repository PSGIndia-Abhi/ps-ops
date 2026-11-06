package com.bestserve.mobile.fieldtracking

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.util.concurrent.Executors

/**
 * JS bridge for sales field tracking (src/leads/fieldTracking.ts): start / stop the background
 * location service for a shift, and read / clear the phone-side queue of points for upload.
 * An in-app module like LocationEnabler - a few lines against Android APIs, no third-party package.
 */
class FieldTrackingModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  // SQLite work off the JS thread.
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName() = "FieldTracking"

  @ReactMethod
  fun start(shiftId: String, intervalMs: Double, promise: Promise) {
    try {
      FieldTrackingService.start(reactContext, shiftId, intervalMs.toLong())
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_START", e.message ?: "Could not start location tracking", e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      FieldTrackingService.stop(reactContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_STOP", e.message ?: "Could not stop location tracking", e)
    }
  }

  /**
   * The server address and the signed-in user's token, for the service's own uploads while the app is
   * closed (FieldTrackingUploader). Handed over whenever tracking starts or resumes.
   */
  @ReactMethod
  fun setUploadAuth(baseUrl: String, token: String, promise: Promise) {
    FieldTrackingUploader.setAuth(reactContext, baseUrl, token)
    promise.resolve(true)
  }

  /** Forget them (End Shift, logout): the service stops uploading. */
  @ReactMethod
  fun clearUploadAuth(promise: Promise) {
    FieldTrackingUploader.clearAuth(reactContext)
    promise.resolve(true)
  }

  /** { running, shiftId } - shiftId is the shift the service is (or was told to be) recording for. */
  @ReactMethod
  fun status(promise: Promise) {
    val map = Arguments.createMap()
    map.putBoolean("running", FieldTrackingService.running)
    val shift = FieldTrackingService.currentShift(reactContext)
    if (shift == null) map.putNull("shiftId") else map.putString("shiftId", shift)
    promise.resolve(map)
  }

  @ReactMethod
  fun pending(limit: Double, promise: Promise) {
    executor.execute {
      try {
        val rows = Arguments.createArray()
        for (p in FieldTrackingStore.get(reactContext).pending(limit.toInt())) {
          val m = Arguments.createMap()
          m.putDouble("id", p.id.toDouble())
          m.putString("clientPointId", p.clientId)
          m.putString("shiftId", p.shiftId)
          m.putDouble("capturedAtMs", p.ts.toDouble())
          m.putDouble("latitude", p.lat)
          m.putDouble("longitude", p.lng)
          if (p.accuracy == null) m.putNull("accuracy") else m.putDouble("accuracy", p.accuracy)
          if (p.speedKmph == null) m.putNull("speedKmph") else m.putDouble("speedKmph", p.speedKmph)
          if (p.bearing == null) m.putNull("bearing") else m.putDouble("bearing", p.bearing)
          if (p.battery == null) m.putNull("batteryPercent") else m.putInt("batteryPercent", p.battery)
          rows.pushMap(m)
        }
        promise.resolve(rows)
      } catch (e: Exception) {
        promise.reject("E_PENDING", e.message ?: "Could not read saved locations", e)
      }
    }
  }

  @ReactMethod
  fun remove(ids: ReadableArray, promise: Promise) {
    executor.execute {
      try {
        val list = (0 until ids.size()).map { ids.getDouble(it).toLong() }
        FieldTrackingStore.get(reactContext).delete(list)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("E_REMOVE", e.message ?: "Could not clear saved locations", e)
      }
    }
  }

  /**
   * True when Android lets BestServe run in the background without battery limits ("Unrestricted").
   * With limits on, the phone may stop the tracking service to save battery and the day gets gaps.
   */
  @ReactMethod
  fun batteryUnrestricted(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(true)
      return
    }
    val pm = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
    promise.resolve(pm?.isIgnoringBatteryOptimizations(reactContext.packageName) ?: true)
  }

  /**
   * Asks Android to let BestServe run without battery limits (the system's own Allow / Deny dialog);
   * if that dialog is not available on the phone, opens the app's settings page instead, where
   * Battery -> Unrestricted is.
   */
  @ReactMethod
  fun openBatterySettings(promise: Promise) {
    val pkg = reactContext.packageName
    val tries = listOf(
      Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$pkg")),
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")),
    )
    for (intent in tries) {
      try {
        val activity = reactApplicationContext.currentActivity
        if (activity != null) activity.startActivity(intent)
        else reactContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        promise.resolve(true)
        return
      } catch (_: Exception) {
        // try the next screen
      }
    }
    promise.resolve(false)
  }

  @ReactMethod
  fun pendingCount(promise: Promise) {
    executor.execute {
      try {
        promise.resolve(FieldTrackingStore.get(reactContext).count())
      } catch (e: Exception) {
        promise.reject("E_COUNT", e.message ?: "Could not count saved locations", e)
      }
    }
  }
}
