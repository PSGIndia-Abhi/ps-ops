package com.bestserve.mobile

import android.content.Intent
import android.os.Bundle
import com.bestserve.mobile.reminders.ReminderScheduler
import com.bestserve.mobile.reminders.RemindersModule
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "BestServeMobile"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    forwardReminder(intent)
  }

  // launchMode is singleTask: a reminder tapped while the app is open arrives here.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    forwardReminder(intent)
  }

  /** Opened from a reminder: hand its screen to the app and clear the (possibly still ringing) alarm. */
  private fun forwardReminder(intent: Intent?) {
    val route = intent?.getStringExtra(ReminderScheduler.EXTRA_ROUTE) ?: return
    intent.getStringExtra(ReminderScheduler.EXTRA_ID)?.let { ReminderScheduler.cancelShown(this, it) }
    intent.removeExtra(ReminderScheduler.EXTRA_ROUTE)
    RemindersModule.routeOpened(route)
  }
}
