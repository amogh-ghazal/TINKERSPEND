package `in`.tinkercraft.tinkerspend.capture

/** Local filter: only payment-looking notifications leave the listener. The full parser runs server-side (packages/domain). */
object Prefilter {
    private val AMOUNT = Regex("""(₹|\brs\.?|\binr)\s*[0-9]""", RegexOption.IGNORE_CASE)
    private val OTP = Regex("""\b(otp|one[- ]time password|verification code|do not share)\b""", RegexOption.IGNORE_CASE)
    private val PROMO = Regex("""\b(cashback offer|win up to|get up to|offer ends|limited time|apply now|pre-?approved|loan offer|scratch card|refer and earn|coupon)\b""", RegexOption.IGNORE_CASE)
    private val PAYMENT_WORDS = Regex("""\b(paid|sent|debited|credited|received|payment|refund|reversed|failed|pending|transferred|spent|withdrawn|purchase)\b""", RegexOption.IGNORE_CASE)

    enum class Result { ACCEPT, NO_AMOUNT, OTP, PROMOTION, NOT_PAYMENT }

    fun check(text: String): Result = when {
        OTP.containsMatchIn(text) -> Result.OTP
        PROMO.containsMatchIn(text) -> Result.PROMOTION
        !AMOUNT.containsMatchIn(text) -> Result.NO_AMOUNT
        !PAYMENT_WORDS.containsMatchIn(text) -> Result.NOT_PAYMENT
        else -> Result.ACCEPT
    }
}
