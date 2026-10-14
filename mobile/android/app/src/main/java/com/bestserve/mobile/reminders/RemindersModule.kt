package com.bestserve.mobile.reminders

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager

/**
 * The app's side of the reminders: hand over the full list to arm (replaceAll), show a popup right
 * now (showNow), check / fix exact-alarm access, and learn which reminder the person tapped.
 *
 * An in-app native module rather than a library: Notifee (the usual choice) was archived in 2026
 * and does not run on the New Architecture, and this is a small amount of Android code we own.
 */
class RemindersModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val EVENT_OPENED = "BestServeReminderOpened"
    @Volatile private var pendingRoute: String? = null
    @Volatile private var instance: RemindersModule? = null

    /** Called by MainActivity when it is opened from a reminder. */
    fun routeOpened(route: String?) {
      if (route.isNullOrEmpty()) return
      pendingRoute = route
      instance?.emitOpened(route)
    }
  }

  init {
    instance = this
    ReminderScheduler.ensureChannels(reactContext)
  }

  override fun getName() = "BestServeReminders"

  private fun emitOpened(route: String) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT_OPENED, route)
  }

  private fun toReminder(m: ReadableMap) = Reminder(
    id = m.getString("id") ?: "",
    kind = if (m.hasKey("kind")) m.getString("kind") ?: "popup" else "popup",
    title = m.getString("title") ?: "",
    body = if (m.hasKey("body")) m.getString("body") ?: "" else "",
    fireAt = if (m.hasKey("fireAt")) m.getDouble("fireAt").toLong() else System.currentTimeMillis(),
    route = if (m.hasKey("route")) m.getString("route") ?: "" else "",
  )

  @ReactMethod
  fun replaceAll(items: ReadableArray, promise: Promise) {
    try {
      val list = (0 until items.size()).mapNotNull { i -> items.getMap(i)?.let { toReminder(it) } }.filter { it.id.isNotEmpty() }
      ReminderScheduler.replaceAll(reactContext, list)
      promise.resolve(list.size)
    } catch (e: Exception) {
      promise.reject("reminders_failed", e.message, e)
    }
  }

  @ReactMethod
  fun showNow(item: ReadableMap) {
    ReminderScheduler.show(reactContext, toReminder(item))
  }

  @ReactMethod
  fun canScheduleExact(promise: Promise) = promise.resolve(ReminderScheduler.canScheduleExact(reactContext))

  /** Android 12+: the "Alarms & reminders" switch for this app, so alarms ring on the minute. */
  @ReactMethod
  fun openExactAlarmSettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
      .setData(Uri.parse("package:" + reactContext.packageName))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      reactContext.startActivity(intent)
    } catch (e: Exception) {
      // Some phones have no such screen - reminders still arrive, a few minutes late at most.
    }
  }

  /** The route of the reminder the app was opened from (once), or null. */
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

class RemindersPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(RemindersModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
