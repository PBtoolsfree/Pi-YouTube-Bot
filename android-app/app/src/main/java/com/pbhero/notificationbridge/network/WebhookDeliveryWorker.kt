package com.pbhero.notificationbridge.network

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.pbhero.notificationbridge.PBHeroApp

class WebhookDeliveryWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val app = applicationContext as PBHeroApp
        val db = app.database
        val client = WebhookClient(app.keystoreManager)

        val pending = db.getPendingEvents()
        if (pending.isEmpty()) {
            return Result.success()
        }

        var anyFailed = false

        for (event in pending) {
            val res = client.deliverEvent(event)
            if (res.isSuccess) {
                db.updateStatus(event.eventId, "DELIVERED")
            } else {
                val err = res.exceptionOrNull()?.message ?: "Unknown error"
                if (event.retryCount >= 5) {
                    db.updateStatus(event.eventId, "FAILED", err)
                } else {
                    db.incrementRetry(event.eventId, err)
                    anyFailed = true
                }
            }
        }

        return if (anyFailed) Result.retry() else Result.success()
    }
}

