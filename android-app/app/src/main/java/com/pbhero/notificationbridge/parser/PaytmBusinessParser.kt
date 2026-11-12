package com.pbhero.notificationbridge.parser

import java.util.regex.Pattern

data class ParsedPaymentNotification(
    val isPayment: Boolean,
    val amount: Double,
    val payerName: String?,
    val refInfo: String?,
    val rawText: String
)

object PaytmBusinessParser {

    private val PAYMENT_KEYWORDS = listOf(
        "paid", "received", "credited", "debited", "payment", "upi", "qr", "transfer",
        "प्राप्त", "सफल", "भुगतान", "राशि", "रुपये", "जमा"
    )

    private val AMOUNT_PATTERNS = listOf(
        Pattern.compile("""(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)""", Pattern.CASE_INSENSITIVE),
        Pattern.compile("""([\d,]+(?:\.\d{1,2})?)\s*(?:₹|Rs\.?|INR)""", Pattern.CASE_INSENSITIVE),
        Pattern.compile("""(?:payment\s+of|received|amount\s+of)\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)""", Pattern.CASE_INSENSITIVE),
        Pattern.compile("""(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:प्राप्त|सफल|रुपये)""", Pattern.CASE_INSENSITIVE)
    )

    private val NAME_PATTERNS = listOf(
        Pattern.compile("""(?:from|by|sender|customer)\s*[:\-]?\s*([A-Za-z0-9 ]{2,40}?)(?:[,\n\r<|]|\s+on\b|\s+via\b|\s+using\b|$)""", Pattern.CASE_INSENSITIVE),
        Pattern.compile("""([A-Za-z0-9\u0900-\u097F ]{2,40})\s+(?:से|ने)\s+(?:₹|Rs\.?)?[\d,.]*\s*प्राप्त""", Pattern.CASE_INSENSITIVE),
        Pattern.compile("""received\s+from\s+([A-Za-z0-9 ]{2,40})""", Pattern.CASE_INSENSITIVE)
    )

    private val REF_PATTERNS = listOf(
        Pattern.compile("""(?:UPI\s*Ref|UTR|Txn\s*ID|Ref\s*No\.?|Order\s*ID)\s*[:\-]?\s*([0-9A-Za-z]{8,24})""", Pattern.CASE_INSENSITIVE),
        Pattern.compile("""\b(?:UPI|UTR)[/\-]?([0-9]{12})\b""", Pattern.CASE_INSENSITIVE)
    )

    fun parse(title: String?, text: String?, subText: String?, bigText: String?): ParsedPaymentNotification {
        val combined = listOfNotNull(title, text, subText, bigText).joinToString(" ")
        val lower = combined.lowercase()

        // 1. Keyword Gate
        val hasKeyword = PAYMENT_KEYWORDS.any { lower.contains(it) }
        if (!hasKeyword) {
            return ParsedPaymentNotification(
                isPayment = false,
                amount = 0.0,
                payerName = null,
                refInfo = null,
                rawText = combined
            )
        }

        // 2. Amount Extraction
        var amount = 0.0
        for (pat in AMOUNT_PATTERNS) {
            val m = pat.matcher(combined)
            if (m.find()) {
                val numStr = m.group(1)?.replace(",", "")?.trim()
                val parsed = numStr?.toDoubleOrNull() ?: 0.0
                if (parsed > 0.0) {
                    amount = parsed
                    break
                }
            }
        }

        // Fallback: look for generic decimal/integer numbers if keywords present
        if (amount <= 0.0) {
            val fallbackMatcher = Pattern.compile("""\b\d+(?:\.\d{1,2})?\b""").matcher(combined)
            while (fallbackMatcher.find()) {
                val candidate = fallbackMatcher.group().toDoubleOrNull() ?: 0.0
                if (candidate > 0.0 && candidate < 1000000.0) {
                    amount = candidate
                    break
                }
            }
        }

        if (amount <= 0.0) {
            return ParsedPaymentNotification(
                isPayment = false,
                amount = 0.0,
                payerName = null,
                refInfo = null,
                rawText = combined
            )
        }

        // 3. Payer Name Extraction
        var payerName: String? = null

        // Check title first (e.g. "₹25.00 Received from PRADIP BAG")
        if (!title.isNullOrBlank()) {
            val titleMatcher = Pattern.compile("""(?:from|by)\s+([A-Za-z0-9 ]{2,35})""", Pattern.CASE_INSENSITIVE).matcher(title)
            if (titleMatcher.find()) {
                val cand = titleMatcher.group(1)?.trim()
                if (!cand.isNullOrEmpty() && cand.length >= 2 && !cand.contains("paytm", ignoreCase = true)) {
                    payerName = cand
                }
            }
        }

        if (payerName == null) {
            for (pat in NAME_PATTERNS) {
                val m = pat.matcher(combined)
                if (m.find()) {
                    val cand = m.group(1)?.trim()
                    if (!cand.isNullOrEmpty() && cand.length >= 2) {
                        val lowerCand = cand.lowercase()
                        if (!lowerCand.contains("paytm") && !lowerCand.contains("business") &&
                            !lowerCand.contains("soundbox") && !lowerCand.contains("qr") &&
                            !lowerCand.contains("bank") && !lowerCand.contains("account")) {
                            payerName = cand
                            break
                        }
                    }
                }
            }
        }

        // Clean up common noise and suffixes like "Received" or "on 12 Nov..."
        if (payerName != null) {
            payerName = payerName
                .replace(Regex("""\s+Received\b.*""", RegexOption.IGNORE_CASE), "")
                .replace(Regex("""\s+on\s+\d+.*""", RegexOption.IGNORE_CASE), "")
                .replace(Regex("""\s+at\s+\d+.*""", RegexOption.IGNORE_CASE), "")
                .trim()
            if (payerName.isEmpty()) payerName = null
        }

        // 4. Reference / UTR Extraction
        var refInfo: String? = null
        for (pat in REF_PATTERNS) {
            val m = pat.matcher(combined)
            if (m.find()) {
                refInfo = m.group(1)?.trim()
                break
            }
        }

        return ParsedPaymentNotification(
            isPayment = true,
            amount = amount,
            payerName = payerName,
            refInfo = refInfo,
            rawText = combined
        )
    }
}

