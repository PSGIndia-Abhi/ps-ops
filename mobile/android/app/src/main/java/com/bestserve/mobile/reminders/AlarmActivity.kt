package com.bestserve.mobile.reminders

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import com.bestserve.mobile.MainActivity
import java.util.Date

/**
 * The alarm's own screen: what Android shows when an alarm fires while the phone is locked or the
 * screen is off (the notification's full-screen intent). It turns the screen on over the lock screen
 * and keeps the alarm ringing until it is answered - Open, Snooze 10 min or Dismiss. Only Open
 * starts the app, so the app is never launched on its own by an alarm.
 */
class AlarmActivity : Activity() {
  private var reminderId: String? = null
  private lateinit var titleView: TextView
  private lateinit var bodyView: TextView
  private lateinit var clockView: TextView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    setContentView(buildLayout())
    bind(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    bind(intent) // a second alarm while this one is showing: show the newest
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun bind(intent: Intent?) {
    val id = intent?.getStringExtra(ReminderScheduler.EXTRA_ID)
    val r = id?.let { ReminderScheduler.find(this, it) }
    if (id == null) {
      finish()
      return
    }
    reminderId = id
    titleView.text = r?.title ?: "Reminder"
    bodyView.text = r?.body ?: ""
    bodyView.visibility = if (bodyView.text.isNullOrBlank()) View.GONE else View.VISIBLE
    clockView.text = DateFormat.getTimeFormat(this).format(Date())
  }

  // ---- answers ------------------------------------------------------------------------------

  /** Snooze and Dismiss go through the same receiver as the notification's buttons, which also stops the sound. */
  private fun answer(action: String) {
    reminderId?.let { sendBroadcast(Intent(this, ReminderReceiver::class.java).setAction(action).putExtra(ReminderScheduler.EXTRA_ID, it)) }
    finish()
  }

  /** Opens the app on the reminder's screen, once the phone is unlocked. */
  private fun openApp() {
    val id = reminderId ?: return finish()
    val r = ReminderScheduler.find(this, id)
    ReminderScheduler.cancelShown(this, id)
    val launch = Intent(this, MainActivity::class.java)
      .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      .putExtra(ReminderScheduler.EXTRA_ID, id)
    if (r != null) launch.putExtra(ReminderScheduler.EXTRA_ROUTE, r.route)
    val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && km.isKeyguardLocked) {
      km.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() {
          startActivity(launch)
          finish()
        }
      })
    } else {
      startActivity(launch)
      finish()
    }
  }

  // ---- layout (built in code: one small screen, no layout files) ----------------------------

  private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

  private fun buildLayout(): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setBackgroundColor(0xFF1E3A8A.toInt())
      setPadding(dp(28), dp(72), dp(28), dp(40))
    }
    clockView = text(56, Typeface.BOLD, Color.WHITE)
    val label = text(15, Typeface.NORMAL, 0xFFBFDBFE.toInt()).apply { text = "BestServe reminder" }
    titleView = text(24, Typeface.BOLD, Color.WHITE).apply { setPadding(0, dp(40), 0, dp(10)) }
    bodyView = text(17, Typeface.NORMAL, 0xFFDBEAFE.toInt())
    val spacer = View(this)
    root.addView(clockView)
    root.addView(label)
    root.addView(titleView)
    root.addView(bodyView)
    root.addView(spacer, LinearLayout.LayoutParams(0, 0, 1f))
    root.addView(button("Open", 0xFFFFFFFF.toInt(), 0xFF1E3A8A.toInt()) { openApp() })
    root.addView(button("Snooze 10 min", 0xFF3B5BB5.toInt(), Color.WHITE) { answer(ReminderReceiver.ACTION_SNOOZE) })
    root.addView(button("Dismiss", 0x00000000, Color.WHITE, outline = true) { answer(ReminderReceiver.ACTION_DISMISS) })
    return root
  }

  private fun text(sizeSp: Int, style: Int, color: Int) = TextView(this).apply {
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp.toFloat())
    setTypeface(typeface, style)
    setTextColor(color)
    gravity = Gravity.CENTER
  }

  private fun button(label: String, fill: Int, textColor: Int, outline: Boolean = false, onTap: () -> Unit) = Button(this).apply {
    text = label
    isAllCaps = false
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
    setTypeface(typeface, Typeface.BOLD)
    setTextColor(textColor)
    background = GradientDrawable().apply {
      cornerRadius = dp(16).toFloat()
      setColor(fill)
      if (outline) setStroke(dp(2), 0x99FFFFFF.toInt())
    }
    stateListAnimator = null
    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(60)).apply { topMargin = dp(12) }
    setOnClickListener { onTap() }
  }
}
