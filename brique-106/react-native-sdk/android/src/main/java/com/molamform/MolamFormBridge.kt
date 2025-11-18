/**
 * Molam Form Android Bridge
 *
 * Native Android bridge for React Native.
 */

package com.molamform

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

class MolamFormBridge(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var publishableKey: String? = null
    private var apiBase: String = "https://api.molam.com"
    private val httpClient = OkHttpClient()

    override fun getName(): String {
        return "MolamFormBridge"
    }

    // ========================================================================
    // Initialization
    // ========================================================================

    @ReactMethod
    fun initialize(config: ReadableMap, promise: Promise) {
        try {
            val key = config.getString("publishableKey")
            if (key == null || key.isEmpty()) {
                promise.reject("E_INVALID_CONFIG", "publishableKey is required")
                return
            }

            publishableKey = key

            config.getString("apiBase")?.let {
                apiBase = it
            }

            // Initialize Molam SDK
            // MolamSDK.configure(publishableKey = key, apiBase = apiBase)

            promise.resolve(true)

        } catch (e: Exception) {
            promise.reject("E_INIT_FAILED", "Initialization failed", e)
        }
    }

    // ========================================================================
    // Tokenization
    // ========================================================================

    @ReactMethod
    fun tokenizeCard(
        cardNumber: String,
        expMonth: Int,
        expYear: Int,
        cvc: String,
        cardholderName: String,
        promise: Promise
    ) {
        if (publishableKey == null) {
            promise.reject("E_NOT_INITIALIZED", "SDK not initialized")
            return
        }

        // Validate card details
        val errors = validateCardDetails(cardNumber, expMonth, expYear, cvc)
        if (errors.isNotEmpty()) {
            promise.reject("E_VALIDATION", errors.joinToString(", "))
            return
        }

        // Call Molam API
        val url = "$apiBase/v1/form/tokenize"

        val jsonBody = JSONObject().apply {
            put("card", JSONObject().apply {
                put("number", cardNumber)
                put("exp_month", expMonth)
                put("exp_year", expYear)
                put("cvc", cvc)
                put("name", cardholderName)
            })
        }

        val requestBody = jsonBody.toString()
            .toRequestBody("application/json".toMediaTypeOrNull())

        val request = Request.Builder()
            .url(url)
            .post(requestBody)
            .header("Authorization", "Bearer $publishableKey")
            .header("Content-Type", "application/json")
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                promise.reject("E_NETWORK", "Network error", e)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use { resp ->
                    if (!resp.isSuccessful) {
                        promise.reject("E_API_ERROR", "API error: ${resp.code}")
                        return
                    }

                    val body = resp.body?.string()
                    if (body == null) {
                        promise.reject("E_NO_DATA", "No data received")
                        return
                    }

                    try {
                        val json = JSONObject(body)
                        val result = jsonToWritableMap(json)

                        // Emit token created event
                        sendEvent("tokenCreated", result)

                        promise.resolve(result)
                    } catch (e: Exception) {
                        promise.reject("E_PARSE", "Failed to parse response", e)
                    }
                }
            }
        })
    }

    // ========================================================================
    // Payment Confirmation
    // ========================================================================

    @ReactMethod
    fun confirmPaymentIntent(
        paymentIntentId: String,
        clientSecret: String,
        paymentMethodId: String?,
        promise: Promise
    ) {
        if (publishableKey == null) {
            promise.reject("E_NOT_INITIALIZED", "SDK not initialized")
            return
        }

        val url = "$apiBase/v1/form/payment_intents/$paymentIntentId/confirm"

        val jsonBody = JSONObject().apply {
            put("client_secret", clientSecret)
            paymentMethodId?.let { put("payment_method", it) }
        }

        val requestBody = jsonBody.toString()
            .toRequestBody("application/json".toMediaTypeOrNull())

        val request = Request.Builder()
            .url(url)
            .post(requestBody)
            .header("Authorization", "Bearer $publishableKey")
            .header("Content-Type", "application/json")
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                promise.reject("E_NETWORK", "Network error", e)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use { resp ->
                    if (!resp.isSuccessful) {
                        promise.reject("E_API_ERROR", "API error: ${resp.code}")
                        return
                    }

                    val body = resp.body?.string()
                    if (body == null) {
                        promise.reject("E_NO_DATA", "No data received")
                        return
                    }

                    try {
                        val json = JSONObject(body)
                        val result = jsonToWritableMap(json)

                        // Check payment status
                        val status = json.getString("status")
                        when (status) {
                            "succeeded" -> sendEvent("paymentSuccess", result)
                            "failed" -> sendEvent("paymentFailed", result)
                            "requires_action" -> {
                                // Handle 3DS or OTP
                                if (json.has("next_action")) {
                                    handleNextAction(json.getJSONObject("next_action"), result)
                                }
                            }
                        }

                        promise.resolve(result)
                    } catch (e: Exception) {
                        promise.reject("E_PARSE", "Failed to parse response", e)
                    }
                }
            }
        })
    }

    // ========================================================================
    // OTP Confirmation
    // ========================================================================

    @ReactMethod
    fun confirmOtp(
        paymentIntentId: String,
        otpCode: String,
        promise: Promise
    ) {
        if (publishableKey == null) {
            promise.reject("E_NOT_INITIALIZED", "SDK not initialized")
            return
        }

        // Implement OTP confirmation
        // Similar to confirmPaymentIntent but with OTP endpoint

        val result = Arguments.createMap().apply {
            putString("status", "succeeded")
        }
        promise.resolve(result)
    }

    // ========================================================================
    // Retrieve Payment Intent
    // ========================================================================

    @ReactMethod
    fun retrievePaymentIntent(
        paymentIntentId: String,
        clientSecret: String,
        promise: Promise
    ) {
        if (publishableKey == null) {
            promise.reject("E_NOT_INITIALIZED", "SDK not initialized")
            return
        }

        // Implement retrieve payment intent
        val result = Arguments.createMap().apply {
            putString("id", paymentIntentId)
            putString("status", "requires_payment_method")
        }
        promise.resolve(result)
    }

    // ========================================================================
    // Native UI
    // ========================================================================

    @ReactMethod
    fun presentPaymentSheet(
        clientSecret: String,
        promise: Promise
    ) {
        // Present native payment sheet
        currentActivity?.runOnUiThread {
            // MolamPaymentSheet.present(clientSecret) { result ->
            //     when (result) {
            //         is Success -> promise.resolve(result.data)
            //         is Error -> promise.reject("E_PAYMENT_SHEET", result.message)
            //     }
            // }

            // Mock for now
            val result = Arguments.createMap().apply {
                putString("status", "succeeded")
            }
            promise.resolve(result)
        }
    }

    @ReactMethod
    fun presentCardForm(promise: Promise) {
        // Present native card form
        currentActivity?.runOnUiThread {
            // MolamCardForm.present() { result ->
            //     when (result) {
            //         is Success -> promise.resolve(result.data)
            //         is Error -> promise.reject("E_CARD_FORM", result.message)
            //     }
            // }

            // Mock for now
            val result = Arguments.createMap().apply {
                putString("id", "tok_test_123")
                putString("type", "card")
            }
            promise.resolve(result)
        }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private fun validateCardDetails(
        cardNumber: String,
        expMonth: Int,
        expYear: Int,
        cvc: String
    ): List<String> {
        val errors = mutableListOf<String>()

        // Validate card number
        val cleaned = cardNumber.replace(" ", "")
        if (cleaned.length < 13 || cleaned.length > 19) {
            errors.add("Invalid card number length")
        }

        // Validate expiration
        val currentYear = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)
        val currentMonth = java.util.Calendar.getInstance().get(java.util.Calendar.MONTH) + 1

        if (expYear < currentYear || (expYear == currentYear && expMonth < currentMonth)) {
            errors.add("Card has expired")
        }

        // Validate CVC
        if (cvc.length < 3 || cvc.length > 4) {
            errors.add("Invalid CVC")
        }

        return errors
    }

    private fun handleNextAction(nextAction: JSONObject, paymentIntent: WritableMap?) {
        val type = nextAction.getString("type")

        when (type) {
            "redirect_to_url" -> {
                val data = jsonToWritableMap(nextAction)
                sendEvent("3dsStarted", data)
            }
            "otp" -> {
                val data = jsonToWritableMap(nextAction)
                sendEvent("otpRequested", data)
            }
        }
    }

    private fun jsonToWritableMap(json: JSONObject): WritableMap {
        val map = Arguments.createMap()
        val iterator = json.keys()

        while (iterator.hasNext()) {
            val key = iterator.next()
            val value = json.get(key)

            when (value) {
                is String -> map.putString(key, value)
                is Int -> map.putInt(key, value)
                is Double -> map.putDouble(key, value)
                is Boolean -> map.putBoolean(key, value)
                is JSONObject -> map.putMap(key, jsonToWritableMap(value))
                JSONObject.NULL -> map.putNull(key)
            }
        }

        return map
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
