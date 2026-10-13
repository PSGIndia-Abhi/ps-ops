package com.bestserve.mobile.reminders

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.bestserve.mobile.MainActivity
import com.bestserve.mobile.R
import org.json.JSONArray
import org.json.JSONObject

/**
 * One reminder the phone should raise on its own, even with the app closed.
 *  - kind "alarm": the "starts in 30 minutes" alarm - alarm sound that repeats, vibration, shown
 *    over the lock screen when Android allows it, with Snooze 10 min / Dismiss.
 *  - kind "popup": a heads-up banner like a chat message.
 * `route` is a JSON string the app uses to open the right screen when the reminder is tapped.
 */
data class Reminder(
  val id: String,
  val kind: String,
  val title: String,
  val body: String,
  val fireAt: Long,
  val route: String,
) {
  fun toJson(): JSONObject =
    JSONObject().put("id", id).put("kind", kind).put("title", title).put("body", body).put("fireAt", fireAt).put("route", route)

  companion object {
    fun fromJson(o: JSONObject) =
      Reminder(o.getString("id"), o.optString("kind", "popup"), o.optString("title"), o.optString("body"), o.optLong("fireAt"), o.optString("route", ""))
  }
}

/**
 * Arms reminders with Android's AlarmManager, keeps the armed set in SharedPreferences (so they can
 * be re-armed after a reboot or an app update), and builds the notifications. The app hands over its
 * complete list each time it syncs (replaceAll), so a rescheduled or finished item simply moves or
 * drops out - there is no separate "update" path to get wrong.
 */
object ReminderScheduler {
  const val CHANNEL_ALARM = "bestserve_reminder_alarm"
  const val CHANNEL_POPUP = "bestserve_reminder_popup"
  const val EXTRA_ID = "reminderId"
  const val EXTRA_ROUTE = "reminderRoute"
  const val SNOOZE_MS = 10 * 60 * 1000L
  private const val PREFS = "bestserve_reminders"
  private const val KEY_ITEMS = "items"
  /** How long the alarm sound keeps repeating if nobody answers it. */
  private const val ALARM_RING_MS = 2 * 60 * 1000L

  // ---- storage ------------------------------------------------------------------------------

  fun load(ctx: Context): MutableList<Reminder> {
    val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ITEMS, null) ?: return mutableListOf()
    return try {
      val arr = JSONArray(raw)
      MutableList(arr.length()) { Reminder.fromJson(arr.getJSONObject(it)) }
    } catch (e: Exception) {
      mutableListOf()
    }
  }

  private fun save(ctx: Context, items: List<Reminder>) {
    val arr = JSONArray()
    items.forEach { arr.put(it.toJson()) }
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_ITEMS, arr.toString()).apply()
  }

  fun find(ctx: Context, id: String): Reminder? = load(ctx).firstOrNull { it.id == id }

  fun forget(ctx: Context, id: String) = save(ctx, load(ctx).filter { it.id != id })

  // ---- arming -------------------------------------------------------------------------------

  private fun firePendingIntent(ctx: Context, id: String): PendingIntent {
    val intent = Intent(ctx, ReminderReceiver::class.java).setAction(ReminderReceiver.ACTION_FIRE).putExtra(EXTRA_ID, id)
    return PendingIntent.getBroadcast(ctx, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  fun canScheduleExact(ctx: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return am.canScheduleExactAlarms()
  }

  private fun arm(ctx: Context, r: Reminder) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = firePendingIntent(ctx, r.id)
    // Exact when the phone allows it; otherwise Android may deliver it a few minutes late.
    if (canScheduleExact(ctx)) {
      am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.fireAt, pi)
    } else {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.fireAt, pi)
    }
  }

  private fun disarm(ctx: Context, id: String) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(firePendingIntent(ctx, id))
  }

  private const val SNOOZE_PREFIX = "snooze:"

  /**
   * The app's full list: arms what is new or moved, cancels what is gone, keeps the rest. A snoozed
   * alarm is the phone's own (the app never lists it), so a sync leaves it ringing on time.
   */
  fun replaceAll(ctx: Context, items: List<Reminder>) {
    val now = System.currentTimeMillis()
    val snoozed = load(ctx).filter { it.id.startsWith(SNOOZE_PREFIX) && it.fireAt > now }
    val wanted = items.filter { it.fireAt > now } + snoozed
    val wantedIds = wanted.map { it.id }.toSet()
    load(ctx).forEach { if (it.id !in wantedIds) disarm(ctx, it.id) }
    wanted.forEach { arm(ctx, it) }
    save(ctx, wanted)
  }

  /** After a reboot or app update the alarms are gone from AlarmManager: arm the stored ones again. */
  fun rearmAll(ctx: Context) {
    val now = System.currentTimeMillis()
    val keep = load(ctx).filter { it.fireAt > now }
    keep.forEach { arm(ctx, it) }
    save(ctx, keep)
  }

  fun snooze(ctx: Context, r: Reminder) {
    val id = if (r.id.startsWith(SNOOZE_PREFIX)) r.id else SNOOZE_PREFIX + r.id
    val again = r.copy(id = id, fireAt = System.currentTimeMillis() + SNOOZE_MS)
    save(ctx, load(ctx).filter { it.id != r.id && it.id != id } + again)
    arm(ctx, again)
  }

  // ---- showing ------------------------------------------------------------------------------

  fun ensureChannels(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ALARM) == null) {
      val alarm = NotificationChannel(CHANNEL_ALARM, "Meeting & task alarms", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Rings before a meeting, follow-up or task is due"
        setSound(
          RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
          AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
        )
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 600, 400, 600, 400, 600)
        lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
        setBypassDnd(false)
      }
      nm.createNotificationChannel(alarm)
    }
    if (nm.getNotificationChannel(CHANNEL_POPUP) == null) {
      val popup = NotificationChannel(CHANNEL_POPUP, "New meetings & tasks", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Pops up when a meeting, follow-up or task is set for you"
        enableVibration(true)
        lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
      }
      nm.createNotificationChannel(popup)
    }
  }

  private fun openAppIntent(ctx: Context, r: Reminder): PendingIntent {
    val intent = Intent(ctx, MainActivity::class.java)
      .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      .putExtra(EXTRA_ROUTE, r.route)
      .putExtra(EXTRA_ID, r.id)
    return PendingIntent.getActivity(ctx, ("open:" + r.id).hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun actionIntent(ctx: Context, action: String, r: Reminder): PendingIntent {
    val intent = Intent(ctx, ReminderReceiver::class.java).setAction(action).putExtra(EXTRA_ID, r.id)
    return PendingIntent.getBroadcast(ctx, (action + r.id).hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  fun notificationId(id: String) = id.hashCode()

  fun show(ctx: Context, r: Reminder) {
    ensureChannels(ctx)
    val alarm = r.kind == "alarm"
    val open = openAppIntent(ctx, r)
    val b = NotificationCompat.Builder(ctx, if (alarm) CHANNEL_ALARM else CHANNEL_POPUP)
      .setSmallIcon(R.drawable.ic_stat_reminder)
      .setContentTitle(r.title)
      .setContentText(r.body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(r.body))
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(if (alarm) NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_REMINDER)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(open)
      .setAutoCancel(true)
      .setColor(0xFF2563EB.toInt())
    if (alarm) {
      b.setFullScreenIntent(open, true)
        .setTimeoutAfter(30 * 60 * 1000L)
        .addAction(0, "Snooze 10 min", actionIntent(ctx, ReminderReceiver.ACTION_SNOOZE, r))
        .addAction(0, "Dismiss", actionIntent(ctx, ReminderReceiver.ACTION_DISMISS, r))
    }
    val notification = b.build()
    if (alarm) {
      // Keep ringing (like an alarm clock) until it is answered - a timer stops it after a while.
      notification.flags = notification.flags or android.app.Notification.FLAG_INSISTENT
    }
    try {
      NotificationManagerCompat.from(ctx).notify(notificationId(r.id), notification)
    } catch (e: SecurityException) {
      // Notifications are switched off for the app - nothing to show.
      return
    }
    if (alarm) {
      // Stop the insistent sound after a couple of minutes, but leave the notification itself.
      android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
        try {
          val quiet = NotificationCompat.Builder(ctx, CHANNEL_POPUP)
            .setSmallIcon(R.drawable.ic_stat_reminder)
            .setContentTitle(r.title)
            .setContentText(r.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(r.body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setColor(0xFF2563EB.toInt())
            .addAction(0, "Snooze 10 min", actionIntent(ctx, ReminderReceiver.ACTION_SNOOZE, r))
            .build()
          val nm = NotificationManagerCompat.from(ctx)
          if (nm.activeNotifications.any { it.id == notificationId(r.id) }) nm.notify(notificationId(r.id), quiet)
        } catch (e: SecurityException) {
          // ignore
        }
      }, ALARM_RING_MS)
    }
  }

  fun cancelShown(ctx: Context, id: String) = NotificationManagerCompat.from(ctx).cancel(notificationId(id))
}
