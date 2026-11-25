package com.bestserve.client

import android.content.Intent
import android.os.Bundle
import com.bestserve.client.notifier.ClientNotifierModule
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /** The name of the main component registered from JavaScript (app.json "name"). */
  override fun getMainComponentName(): String = "BestServeClient"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    forwardNotification(intent)
  }

  // launchMode is singleTask: a notification tapped while the app is open arrives here.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    forwardNotification(intent)
  }

  /** Opened from one of our notifications: hand its screen to the app. */
  private fun forwardNotification(intent: Intent?) {
    val route = intent?.getStringExtra(ClientNotifierModule.EXTRA_ROUTE) ?: return
    intent.getStringExtra(ClientNotifierModule.EXTRA_ID)?.let { ClientNotifierModule.cancelShown(this, it) }
    intent.removeExtra(ClientNotifierModule.EXTRA_ROUTE)
    ClientNotifierModule.routeOpened(route)
  }
}
