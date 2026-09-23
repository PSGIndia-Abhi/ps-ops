package com.bestserve.mobile.locationenabler

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.common.api.ResolvableApiException
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.LocationSettingsRequest
import com.google.android.gms.location.Priority

/**
 * The one thing @react-native-community/geolocation's own Android module (PlayServicesLocationManager.java,
 * see its checkLocationSettings) deliberately doesn't do: when the device's Location toggle is off, it only
 * ever reports POSITION_UNAVAILABLE back to JS - it never shows Play Services' own "Turn on Location?"
 * dialog, which is the one way to fix that *without* sending the user out to the OS Settings app (whose
 * layout differs per phone maker, and which needs a manual "back" afterwards). This module adds exactly
 * that missing piece, nothing else: build the same kind of LocationSettingsRequest, ask Play Services'
 * SettingsClient to check it, and if it says "resolvable", show the resolution dialog in place and report
 * back what the technician chose.
 *
 * A small in-app native module instead of a third-party package: the one published library for this
 * (react-native-android-location-enabler) fails to compile against this project's Kotlin/RN toolchain
 * (`getCurrentActivity()` invocation error) - this mirrors its same handful of lines against the exact
 * Play Services APIs @react-native-community/geolocation already ships, just written in a way that
 * actually builds here.
 */
class LocationEnablerModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val REQUEST_CHECK_SETTINGS = 42561
  }

  override fun getName() = "LocationEnabler"

  private var pendingPromise: Promise? = null

  private val activityEventListener: ActivityEventListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CHECK_SETTINGS) return
        val promise = pendingPromise ?: return
        pendingPromise = null
        if (resultCode == Activity.RESULT_OK) {
          promise.resolve("enabled")
        } else {
          promise.reject("ERR_LOCATION_ENABLE_DECLINED", "The technician declined to turn on location.")
        }
      }
    }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  @ReactMethod
  fun promptForEnableLocationIfNeeded(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("ERR_NO_ACTIVITY", "No foreground activity to show the location prompt on.")
      return
    }

    val locationRequest =
      LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10000L).build()
    val settingsRequest = LocationSettingsRequest.Builder().addLocationRequest(locationRequest).build()

    LocationServices.getSettingsClient(reactContext)
      .checkLocationSettings(settingsRequest)
      .addOnSuccessListener { promise.resolve("already-enabled") }
      .addOnFailureListener { error ->
        if (error is ResolvableApiException) {
          try {
            pendingPromise = promise
            error.startResolutionForResult(activity, REQUEST_CHECK_SETTINGS)
          } catch (sendIntentError: Exception) {
            pendingPromise = null
            promise.reject("ERR_RESOLUTION_FAILED", sendIntentError.message, sendIntentError)
          }
        } else {
          promise.reject("ERR_SETTINGS_UNAVAILABLE", error.message, error)
        }
      }
  }
}
