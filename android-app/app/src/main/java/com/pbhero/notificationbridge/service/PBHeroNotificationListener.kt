package com.pbhero.notificationbridge.service

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.pbhero.notificationbridge.PBHeroApp
import com.pbhero.notificationbridge.data.db.PaymentEventEntity
import com.pbhero.notificationbridge.network.WebhookDeliveryWorker
import com.pbhero.notificationbridge.parser.PaytmBusinessParser
import java.util.UUID
import java.util.concurrent.TimeUnit

class PBHeroNotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "PBHeroNotifListener"
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val app = applicationContext as? PBHeroApp ?: return
        val keystore = app.keystoreManager
        val packageName = sbn.packageName ?: return

        // 1. Strict Privacy & Whitelist Filter
        if (!keystore.isPackageAllowed(packageName)) {
            return
        }

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""

        Log.d(TAG, "Intercepted allowed notification from $packageName: $title | $text")

        // 2. Parse Payment Notification
        val parsed = PaytmBusinessParser.parse(title, text, subText, bigText)
        if (!parsed.isPayment || parsed.amount <= 0.0) {
            Log.d(TAG, "Notification is not a payment or amount is 0, skipping.")
            return
        }

        val postTime = if (sbn.postTime > 0) sbn.postTime else System.currentTimeMillis()

        // 3. Stale Notification Guard (ignore notifications older than 10 mins e.g. on phone reboot)
        if (keystore.isFilterStaleEnabled) {
            val ageMs = System.currentTimeMillis() - postTime
            if (ageMs > 10 * 60 * 1000) {
                Log.w(TAG, "Ignoring stale notification (${ageMs / 1000}s old).")
                if (keystore.isAutoDismissEnabled) {
                    try { cancelNotification(sbn.key) } catch (e: Exception) {}
                }
                return
            }
        }

        // 4. Duplicate Guard (prevent re-capturing duplicate notification if someone pays same amount or repeats)
        if (app.database.hasDuplicateEvent(parsed.amount, parsed.payerName, parsed.refInfo, postTime)) {
            Log.w(TAG, "Duplicate payment event detected (₹${parsed.amount}, ref: ${parsed.refInfo}). Dismissing notification.")
            if (keystore.isAutoDismissEnabled) {
                try { cancelNotification(sbn.key) } catch (e: Exception) {}
            }
            return
        }

        keystore.lastReceivedTime = System.currentTimeMillis()

        // 5. Store Event in Local DB Queue
        val eventId = "NOTIF-${System.currentTimeMillis()}-${UUID.randomUUID().toString().substring(0, 6).uppercase()}"
        val entity = PaymentEventEntity(
            eventId = eventId,
            packageName = packageName,
            title = title,
            text = text,
            amount = parsed.amount,
            payerName = parsed.payerName,
            refInfo = parsed.refInfo,
            timestamp = postTime,
            status = "PENDING"
        )

        app.database.insertEvent(entity)
        Log.i(TAG, "Enqueued Payment Event $eventId: ₹${parsed.amount} from ${parsed.payerName ?: "Unknown"}")

        // 6. Auto-Dismiss / Clear Notification from Status Bar
        if (keystore.isAutoDismissEnabled) {
            try {
                cancelNotification(sbn.key)
                Log.i(TAG, "Notification automatically dismissed from status bar: ${sbn.key}")
            } catch (e: Exception) {
                Log.w(TAG, "Could not dismiss notification ${sbn.key}: ${e.message}")
            }
        }

        // 7. Trigger WorkManager Delivery Worker with Network Constraint
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val workRequest = OneTimeWorkRequestBuilder<WebhookDeliveryWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(this).enqueue(workRequest)
    }
}

