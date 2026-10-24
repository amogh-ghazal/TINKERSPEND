package `in`.tinkercraft.tinkerspend.capture

import `in`.tinkercraft.tinkerspend.BuildConfig

/** Must match packages/domain KNOWN_SOURCES and the <queries> block in AndroidManifest.xml. */
object SupportedSources {
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
