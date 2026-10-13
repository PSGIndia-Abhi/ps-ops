package com.bestserve.mobile.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Where AlarmManager delivers a reminder (ACTION_FIRE), and where its notification buttons land
 * (Snooze 10 min / Dismiss). Runs with or without the app open.
 */
class ReminderReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_FIRE = "com.bestserve.mobile.reminders.FIRE"
    const val ACTION_SNOOZE = "com.bestserve.mobile.reminders.SNOOZE"
    const val ACTION_DISMISS = "com.bestserve.mobile.reminders.DISMISS"
  }

  override fun onReceive(ctx: Context, intent: Intent) {
    val id = intent.getStringExtra(ReminderScheduler.EXTRA_ID) ?: return
    when (intent.action) {
      ACTION_FIRE -> {
        val r = ReminderScheduler.find(ctx, id) ?: return
        ReminderScheduler.show(ctx, r)
        // Fired once - the stored copy is only kept so it can be snoozed from its buttons.
      }
      ACTION_SNOOZE -> {
        ReminderScheduler.cancelShown(ctx, id)
        val r = ReminderScheduler.find(ctx, id) ?: return
        ReminderScheduler.snooze(ctx, r)
      }
      ACTION_DISMISS -> {
        ReminderScheduler.cancelShown(ctx, id)
        ReminderScheduler.forget(ctx, id)
      }
    }
  }
}

/** A reboot or an app update clears every AlarmManager alarm: arm the stored reminders again. */
class ReminderBootReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED" -> ReminderScheduler.rearmAll(ctx)
    }
  }
}
