package com.bestserve.mobile.fieldtracking

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.bestserve.mobile.R
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * Records the sales executive's location in the background between Start Shift and End Shift.
 *
 * A foreground service (type "location") with a permanent "Shift in progress" notification: the only
 * way Android keeps taking GPS fixes once the app is in the background or its screen is closed. It is
 * started from the app while it is open (the Start Shift tap, or reopening the app during a shift), so
 * the normal "while using the app" location permission is enough - no "Allow all the time".
 *
 * Every fix goes into FieldTrackingStore (phone-side queue); the JS side uploads them. The shift id
 * and interval are kept in SharedPreferences, so if Android kills and restarts the service
 * (START_STICKY) it carries on recording for the same shift.
 */
class FieldTrackingService : Service() {

  private lateinit var client: FusedLocationProviderClient
  private var shiftId: String? = null

  private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      val id = shiftId ?: return
      val store = FieldTrackingStore.get(this@FieldTrackingService)
      val battery = batteryPercent()
      for (loc in result.locations) {
        store.insert(
          shiftId = id,
          ts = loc.time,
          lat = loc.latitude,
          lng = loc.longitude,
          accuracy = if (loc.hasAccuracy()) loc.accuracy.toDouble() else null,
          speedKmph = if (loc.hasSpeed()) loc.speed * 3.6 else null,
          bearing = if (loc.hasBearing()) loc.bearing.toDouble() else null,
          battery = battery,
        )
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    client = LocationServices.getFusedLocationProviderClient(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val id = prefs.getString(KEY_SHIFT, null)
    if (id == null || !hasLocationPermission()) {
      stopSelf()
      return START_NOT_STICKY
    }

    try {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        buildNotification(),
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0,
      )
    } catch (e: Exception) {
      // Android refuses a location service started while the app is in the background (e.g. a
      // system restart of this service on Android 14+). The app restarts it when next opened.
      Log.w(TAG, "Could not start location tracking in the foreground", e)
      stopSelf()
      return START_NOT_STICKY
    }

    if (shiftId != id) {
      shiftId = id
      val interval = prefs.getLong(KEY_INTERVAL, DEFAULT_INTERVAL_MS)
      val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, interval)
        .setMinUpdateIntervalMillis(interval / 2)
        .setWaitForAccurateLocation(false)
        .build()
      client.removeLocationUpdates(callback)
      try {
        client.requestLocationUpdates(request, callback, Looper.getMainLooper())
      } catch (e: SecurityException) {
        Log.w(TAG, "Location permission missing", e)
        stopSelf()
        return START_NOT_STICKY
      }
    }
    running = true
    return START_STICKY
  }

  override fun onDestroy() {
    client.removeLocationUpdates(callback)
    running = false
    shiftId = null
    super.onDestroy()
  }

  private fun hasLocationPermission(): Boolean =
    ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private fun batteryPercent(): Int? {
    val bm = getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return null
    val pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    return if (pct in 0..100) pct else null
  }

  private fun buildNotification(): android.app.Notification {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
      val channel = NotificationChannel(CHANNEL, "Shift location tracking", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shown while your shift is running and your location is being recorded"
        setShowBadge(false)
      }
      nm.createNotificationChannel(channel)
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    return NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_location)
      .setContentTitle("Shift in progress")
      .setContentText("Your location is being recorded until you end your shift.")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(open)
      .build()
  }

  companion object {
    private const val TAG = "FieldTracking"
    const val CHANNEL = "field_tracking"
    const val NOTIFICATION_ID = 4711
    const val PREFS = "field_tracking"
    const val KEY_SHIFT = "shift_id"
    const val KEY_INTERVAL = "interval_ms"
    const val DEFAULT_INTERVAL_MS = 60_000L

    @Volatile var running = false
      private set

    fun start(context: Context, shiftId: String, intervalMs: Long) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putString(KEY_SHIFT, shiftId)
        .putLong(KEY_INTERVAL, intervalMs)
        .apply()
      ContextCompat.startForegroundService(context, Intent(context, FieldTrackingService::class.java))
    }

    fun stop(context: Context) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
      context.stopService(Intent(context, FieldTrackingService::class.java))
    }

    fun currentShift(context: Context): String? =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SHIFT, null)
  }
}
