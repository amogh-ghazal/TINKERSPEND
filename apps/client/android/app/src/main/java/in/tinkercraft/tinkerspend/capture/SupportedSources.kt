package `in`.tinkercraft.tinkerspend.capture

import `in`.tinkercraft.tinkerspend.BuildConfig

/** Must match packages/domain KNOWN_SOURCES and the <queries> block in AndroidManifest.xml. */
object SupportedSources {
    val MESSAGING = setOf("com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms")
    private val BANK_HEADERS = setOf("HDFCBK", "HDFCBN", "ICICIB", "SBIINB", "SBIPSG", "SBIUPI", "SBIBNK", "AXISBK", "KOTAKB", "FEDBNK", "CANBNK", "BOBTXN", "PNBSMS", "IDFCFB", "IDFCBK", "UNIONB", "INDUSB", "YESBNK")
    fun bankMessageTitle(title: String?): Boolean {
        val header = Regex("^(?:[A-Z]{2}-)?([A-Z]{6})(?:-[SPTG])?$").matchEntire(title?.trim()?.uppercase(java.util.Locale.ROOT) ?: "")?.groupValues?.get(1)
        return header in BANK_HEADERS
    }
    fun eligible(pkg: String, title: String?): Boolean = pkg in all || (pkg in MESSAGING && bankMessageTitle(title))
    const val FIXTURE = "in.tinkercraft.tinkerspend.fixture"
    val PRODUCTION = linkedMapOf(
        "com.google.android.apps.nbu.paisa.user" to "Google Pay",
        "com.phonepe.app" to "PhonePe",
        "net.one97.paytm" to "Paytm",
        "in.org.npci.upiapp" to "BHIM",
        "com.csam.icici.bank.imobile" to "ICICI iMobile",
        "com.snapwork.hdfc" to "HDFC Bank",
        "com.sbi.lotusintouch" to "SBI YONO",
        "com.axis.mobile" to "Axis Mobile",
        "com.msf.kbank.mobile" to "Kotak",
    )
    /** The synthetic fixture source exists only in debug builds and is labelled as such. */
    val all: Map<String, String>
        get() = if (BuildConfig.ALLOW_FIXTURE_SOURCE) PRODUCTION + (FIXTURE to "SYNTHETIC test fixture (debug only)") else PRODUCTION
}
