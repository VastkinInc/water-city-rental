// In-app notification emitter.
//
// CONTRACT (mirrors utils/mailer.js): nothing here may ever throw or reject into a
// caller. Notifications are fired AFTER the HTTP response, fire-and-forget, so a
// slow or failing DB write must never delay or break the booking/payment/message
// flow that triggered it. Every path is wrapped so createNotifications() always
// resolves — never rejects — and returns the docs it managed to write (or []).

import Notification from '../models/Notification.js';

/**
 * Create one or many notifications.
 *
 * @param {object|object[]} entries  One entry or an array of:
 *   {
 *     user,                 // ObjectId | string — recipient (required)
 *     role,                 // 'customer'|'owner'|'captain'|'admin' (required)
 *     type,                 // one of NOTIFICATION_TYPES (required)
 *     title,                // string (required)
 *     body,                 // string (optional)
 *     relatedBooking,       // ObjectId | string (optional)
 *     relatedConversation   // ObjectId | string (optional)
 *   }
 *
 * Invalid entries (missing user/role/type/title) are skipped, not thrown. Safe to
 * call un-awaited. Returns the array of created docs ([] on any failure).
 */
export async function createNotifications(entries) {
  try {
    const list = Array.isArray(entries) ? entries : [entries];

    const docs = list
      .filter(
        (e) => e && e.user && e.role && e.type && e.title
      )
      .map((e) => ({
        user: e.user,
        role: e.role,
        type: e.type,
        title: e.title,
        body: e.body || '',
        relatedBooking: e.relatedBooking || null,
        relatedConversation: e.relatedConversation || null
      }));

    if (docs.length === 0) return [];

    // ordered:false — one bad doc can't abort the rest of the batch.
    return await Notification.insertMany(docs, { ordered: false });
  } catch (err) {
    // Absolute backstop — must never reject into a caller.
    console.error(`[notify] createNotifications failed: ${(err && err.message) || err}`);
    return [];
  }
}

/** Convenience for the common single-recipient case. Same never-throws contract. */
export async function createNotification(entry) {
  const out = await createNotifications(entry);
  return out[0] || null;
}
