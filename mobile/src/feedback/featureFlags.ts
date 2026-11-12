/**
 * Feedback screens that are HIDDEN in the app (not disabled).
 *
 * Collectors use the app to call customers and send WhatsApp / email messages. The parts
 * below stay in the code and keep working - they are only not shown. Set a flag to `true`
 * to show that part again; nothing else needs to change. The website is not affected.
 */
export const FEEDBACK_FEATURES = {
  /**
   * Call screen: the "Follow-up call · FB-xxxx" panel shown after a re-visit
   * ("Close without feedback", ask the questions again, "Close the ticket" / "Stays open").
   */
  followUpCall: false,

  /**
   * Call screen: "New feedback · new complaint" on a finished call (ask the questions again
   * and raise a new ticket), and its option "Take new feedback & raise a ticket" in the
   * "Raise a new ticket" sheet. "Raise a ticket without feedback" stays.
   */
  newFeedbackRound: false,

  /**
   * Call screen: "Feedback from the call" - Spoke with, the questions (General / Service-based / Both),
   * Other feedback, and its buttons (Raise ticket / No ticket · Done / Save · Done (Good)).
   * Collectors record the call result and send WhatsApp / email in the app; the questions are
   * answered on the website.
   */
  feedbackQuestions: false,
} as const;
