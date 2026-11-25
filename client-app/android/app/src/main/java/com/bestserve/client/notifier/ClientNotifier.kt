package com.bestserve.client.notifier

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.bestserve.client.MainActivity
import com.bestserve.client.R
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager

/**
 * Shows a push that arrives while the app is open (Android only draws pushes by itself when the
 * app is closed or in the background), and tells the app which screen a tapped one is about.
 *
 * The staff app does this through its reminders/alarm engine; the client app has no alarms, so it
 * keeps just this small part: one "BestServe updates" channel, no alarm or exact-timing permissions.
 */
class ClientNotifierModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val CHANNEL_UPDATES = "bestserve_updates"
    const val EXTRA_ROUTE = "bestserve_route"
    const val EXTRA_ID = "bestserve_id"
    const val EVENT_OPENED = "BestServeClientNotificationOpened"
    private const val BRAND_COLOR = 0xFFB71C2B.toInt()

    @Volatile private var pendingRoute: String? = null
    @Volatile private var instance: ClientNotifierModule? = null

    /** Called by MainActivity when it is opened from one of our notifications. */
    fun routeOpened(route: String?) {
      if (route.isNullOrEmpty()) return
      pendingRoute = route
      instance?.emitOpened(route)
    }

    fun ensureChannel(ctx: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_UPDATES) != null) return
      val updates = NotificationChannel(CHANNEL_UPDATES, "BestServe updates", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Replies to your complaints, booked requests, completed visits and new documents"
        enableVibration(true)
        lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
      }
      nm.createNotificationChannel(updates)
    }

    fun cancelShown(ctx: Context, id: String) = NotificationManagerCompat.from(ctx).cancel(id.hashCode())
  }

  init {
    instance = this
    ensureChannel(reactContext)
  }

  override fun getName() = "BestServeClientNotifier"

  private fun emitOpened(route: String) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT_OPENED, route)
  }

  /** item: { id, title, body, route } - route is a JSON string handed back when it is tapped. */
  @ReactMethod
  fun showNow(item: ReadableMap) {
    val ctx = reactContext
    ensureChannel(ctx)
    val id = item.getString("id") ?: System.currentTimeMillis().toString()
    val title = if (item.hasKey("title")) item.getString("title") ?: "BestServe" else "BestServe"
    val body = if (item.hasKey("body")) item.getString("body") ?: "" else ""
    val route = if (item.hasKey("route")) item.getString("route") ?: "" else ""
    val open = Intent(ctx, MainActivity::class.java)
      .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      .putExtra(EXTRA_ROUTE, route)
      .putExtra(EXTRA_ID, id)
    val pending = PendingIntent.getActivity(ctx, ("open:$id").hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(ctx, CHANNEL_UPDATES)
      .setSmallIcon(R.drawable.ic_stat_bestserve)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setContentIntent(pending)
      .setAutoCancel(true)
      .setColor(BRAND_COLOR)
      .build()
    try {
      NotificationManagerCompat.from(ctx).notify(id.hashCode(), notification)
    } catch (e: SecurityException) {
      // Notifications are switched off for the app - nothing to show; everything is still in the app.
    }
  }

  /** The route of the notification the app was opened from (once), or null. */
  @ReactMethod
  fun consumeOpenedRoute(promise: Promise) {
    val r = pendingRoute
    pendingRoute = null
    promise.resolve(r)
  }

  // Required by NativeEventEmitter on the JS side.
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Double) {}
}

class ClientNotifierPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(ClientNotifierModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
