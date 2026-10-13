package com.bestserve.mobile.reversegeocoder

import android.location.Address
import android.location.Geocoder
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Turns a GPS point into a written address ("12, 4th Cross, Whitefield, Bengaluru, Karnataka 560066")
 * with Android's own android.location.Geocoder - the lookup that ships with the phone. No API key and
 * no per-lookup charge, unlike Google's Geocoding web API. It needs an internet connection, and some
 * devices have no geocoder at all, so this never rejects: it resolves the address line, or null when
 * there is none to give, and the lead form simply leaves its Address box for the rep to type.
 *
 * A small in-app native module for the same reason LocationEnabler is one: it is a few lines against
 * an Android API, not worth a third-party package.
 */
class ReverseGeocoderModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()

  override fun getName() = "ReverseGeocoder"

  @ReactMethod
  fun reverseGeocode(latitude: Double, longitude: Double, promise: Promise) {
    if (!Geocoder.isPresent()) {
      promise.resolve(null)
      return
    }
    try {
      val geocoder = Geocoder(reactContext, Locale("en", "IN"))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        geocoder.getFromLocation(
          latitude,
          longitude,
          1,
          object : Geocoder.GeocodeListener {
            override fun onGeocode(addresses: MutableList<Address>) {
              promise.resolve(addressLine(addresses))
            }

            override fun onError(errorMessage: String?) {
              promise.resolve(null)
            }
          },
        )
      } else {
        // The older call blocks on the network, so it must not run on the bridge thread.
        executor.execute {
          try {
            @Suppress("DEPRECATION")
            promise.resolve(addressLine(geocoder.getFromLocation(latitude, longitude, 1)))
          } catch (e: Exception) {
            promise.resolve(null)
          }
        }
      }
    } catch (e: Exception) {
      promise.resolve(null)
    }
  }

  private fun addressLine(addresses: List<Address>?): String? =
    addresses?.firstOrNull()?.getAddressLine(0)?.trim()?.takeIf { it.isNotEmpty() }
}
