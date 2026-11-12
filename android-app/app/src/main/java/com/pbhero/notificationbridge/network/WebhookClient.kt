package com.pbhero.notificationbridge.network

import android.os.Build
import com.pbhero.notificationbridge.data.db.PaymentEventEntity
import com.pbhero.notificationbridge.data.security.HmacSigner
import com.pbhero.notificationbridge.data.security.KeystoreManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class WebhookClient(private val keystore: KeystoreManager) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

    suspend fun registerDevice(): Result<String> = withContext(Dispatchers.IO) {
        try {
            val url = "${keystore.serverUrl}/api/bridge/register"
            val payload = JSONObject().apply {
                put("device_id", keystore.deviceId)
                put("device_name", "${Build.MANUFACTURER} ${Build.MODEL}")
            }

            val request = Request.Builder()
                .url(url)
                .post(payload.toString().toRequestBody(JSON_MEDIA))
                .build()

            client.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    val json = JSONObject(bodyStr)
                    val secret = json.optString("secret_key")
                    if (secret.isNotEmpty()) {
                        keystore.secretKey = secret
                        Result.success("Device Registered Successfully!")
                    } else {
                        Result.success("Registered (kept existing key)")
                    }
                } else {
                    Result.failure(Exception("Registration failed HTTP ${response.code}: $bodyStr"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun deliverEvent(event: PaymentEventEntity): Result<String> = withContext(Dispatchers.IO) {
        try {
            val url = "${keystore.serverUrl}/api/webhook/paytm-bridge"
            val timestamp = System.currentTimeMillis() / 1000

            val payload = JSONObject().apply {
                put("provider", "paytm_business")
                put("event_type", "payment_notification")
                put("device_id", keystore.deviceId)
                put("package_name", event.packageName)
                put("notification_title", event.title)
                put("notification_text", event.text)
                put("amount", event.amount)
                put("currency", "INR")
                put("payer_name", if (event.payerName != null) event.payerName else JSONObject.NULL)
                put("ref_info", if (event.refInfo != null) event.refInfo else JSONObject.NULL)
                put("notification_timestamp", event.timestamp)
                put("event_id", event.eventId)
            }

            val jsonBody = payload.toString()
            val signature = HmacSigner.sign(keystore.secretKey, keystore.deviceId, timestamp, jsonBody)

            val request = Request.Builder()
                .url(url)
                .header("X-Device-Id", keystore.deviceId)
                .header("X-Timestamp", timestamp.toString())
                .header("X-Signature", signature)
                .post(jsonBody.toRequestBody(JSON_MEDIA))
                .build()

            client.newCall(request).execute().use { response ->
                val bodyStr = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    keystore.lastDeliveredTime = System.currentTimeMillis()
                    Result.success(bodyStr)
                } else {
                    Result.failure(Exception("HTTP ${response.code}: $bodyStr"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun testConnection(): Result<String> = withContext(Dispatchers.IO) {
        try {
            val url = "${keystore.serverUrl}/api/config"
            val request = Request.Builder().url(url).get().build()
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    Result.success("Connected (HTTP ${response.code})")
                } else {
                    Result.failure(Exception("HTTP ${response.code}"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}

