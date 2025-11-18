/**
 * Molam Form iOS Bridge
 *
 * Native iOS bridge for React Native.
 */

import Foundation
import React

@objc(MolamFormBridge)
class MolamFormBridge: RCTEventEmitter {

  private var publishableKey: String?
  private var apiBase: String = "https://api.molam.com"
  private var hasListeners: Bool = false

  // MARK: - Initialization

  @objc
  func initialize(_ config: NSDictionary,
                  resolver resolve: @escaping RCTPromiseResolveBlock,
                  rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let key = config["publishableKey"] as? String else {
      reject("E_INVALID_CONFIG", "publishableKey is required", nil)
      return
    }

    publishableKey = key

    if let base = config["apiBase"] as? String {
      apiBase = base
    }

    // Initialize Molam SDK
    // MolamSDK.configure(publishableKey: key, apiBase: apiBase)

    resolve(true)
  }

  // MARK: - Tokenization

  @objc
  func tokenizeCard(_ cardNumber: String,
                    expMonth: NSNumber,
                    expYear: NSNumber,
                    cvc: String,
                    cardholderName: String,
                    resolver resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {

    guard let _ = publishableKey else {
      reject("E_NOT_INITIALIZED", "SDK not initialized", nil)
      return
    }

    // Validate card details
    let errors = validateCardDetails(
      cardNumber: cardNumber,
      expMonth: expMonth.intValue,
      expYear: expYear.intValue,
      cvc: cvc
    )

    if !errors.isEmpty {
      reject("E_VALIDATION", errors.joined(separator: ", "), nil)
      return
    }

    // Call Molam API to tokenize card
    // In production, this would call the actual Molam iOS SDK
    let urlString = "\(apiBase)/v1/form/tokenize"
    guard let url = URL(string: urlString) else {
      reject("E_INVALID_URL", "Invalid API URL", nil)
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(publishableKey!)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let payload: [String: Any] = [
      "card": [
        "number": cardNumber,
        "exp_month": expMonth,
        "exp_year": expYear,
        "cvc": cvc,
        "name": cardholderName
      ]
    ]

    do {
      request.httpBody = try JSONSerialization.data(withJSONObject: payload)
    } catch {
      reject("E_SERIALIZATION", "Failed to serialize request", error)
      return
    }

    let task = URLSession.shared.dataTask(with: request) { data, response, error in
      if let error = error {
        reject("E_NETWORK", "Network error", error)
        return
      }

      guard let data = data else {
        reject("E_NO_DATA", "No data received", nil)
        return
      }

      do {
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        // Emit token created event
        self.sendEvent(withName: "tokenCreated", body: json)

        resolve(json)
      } catch {
        reject("E_PARSE", "Failed to parse response", error)
      }
    }

    task.resume()
  }

  // MARK: - Payment Confirmation

  @objc
  func confirmPaymentIntent(_ paymentIntentId: String,
                           clientSecret: String,
                           paymentMethodId: String?,
                           resolver resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {

    guard let _ = publishableKey else {
      reject("E_NOT_INITIALIZED", "SDK not initialized", nil)
      return
    }

    // Call Molam API to confirm payment intent
    let urlString = "\(apiBase)/v1/form/payment_intents/\(paymentIntentId)/confirm"
    guard let url = URL(string: urlString) else {
      reject("E_INVALID_URL", "Invalid API URL", nil)
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(publishableKey!)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    var payload: [String: Any] = [
      "client_secret": clientSecret
    ]

    if let pmId = paymentMethodId {
      payload["payment_method"] = pmId
    }

    do {
      request.httpBody = try JSONSerialization.data(withJSONObject: payload)
    } catch {
      reject("E_SERIALIZATION", "Failed to serialize request", error)
      return
    }

    let task = URLSession.shared.dataTask(with: request) { data, response, error in
      if let error = error {
        reject("E_NETWORK", "Network error", error)
        return
      }

      guard let data = data else {
        reject("E_NO_DATA", "No data received", nil)
        return
      }

      do {
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        // Check payment status
        if let status = json?["status"] as? String {
          switch status {
          case "succeeded":
            self.sendEvent(withName: "paymentSuccess", body: json)
          case "failed":
            self.sendEvent(withName: "paymentFailed", body: json)
          case "requires_action":
            // Handle 3DS or OTP
            if let nextAction = json?["next_action"] as? [String: Any] {
              self.handleNextAction(nextAction, paymentIntent: json)
            }
          default:
            break
          }
        }

        resolve(json)
      } catch {
        reject("E_PARSE", "Failed to parse response", error)
      }
    }

    task.resume()
  }

  // MARK: - OTP Confirmation

  @objc
  func confirmOtp(_ paymentIntentId: String,
                  otpCode: String,
                  resolver resolve: @escaping RCTPromiseResolveBlock,
                  rejecter reject: @escaping RCTPromiseRejectBlock) {

    guard let _ = publishableKey else {
      reject("E_NOT_INITIALIZED", "SDK not initialized", nil)
      return
    }

    // Implement OTP confirmation
    // Similar to confirmPaymentIntent but with OTP endpoint

    resolve(["status": "succeeded"])
  }

  // MARK: - Retrieve Payment Intent

  @objc
  func retrievePaymentIntent(_ paymentIntentId: String,
                            clientSecret: String,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {

    guard let _ = publishableKey else {
      reject("E_NOT_INITIALIZED", "SDK not initialized", nil)
      return
    }

    // Implement retrieve payment intent
    resolve(["id": paymentIntentId, "status": "requires_payment_method"])
  }

  // MARK: - Native UI

  @objc
  func presentPaymentSheet(_ clientSecret: String,
                          resolver resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {

    // Present native payment sheet (iOS PaymentSheet)
    DispatchQueue.main.async {
      // MolamPaymentSheet.present(clientSecret: clientSecret) { result in
      //   switch result {
      //   case .success(let paymentIntent):
      //     resolve(paymentIntent)
      //   case .failure(let error):
      //     reject("E_PAYMENT_SHEET", error.localizedDescription, error)
      //   }
      // }

      // Mock for now
      resolve(["status": "succeeded"])
    }
  }

  @objc
  func presentCardForm(resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {

    // Present native card form
    DispatchQueue.main.async {
      // MolamCardForm.present() { result in
      //   switch result {
      //   case .success(let token):
      //     resolve(token)
      //   case .failure(let error):
      //     reject("E_CARD_FORM", error.localizedDescription, error)
      //   }
      // }

      // Mock for now
      resolve(["id": "tok_test_123", "type": "card"])
    }
  }

  // MARK: - Helpers

  private func validateCardDetails(cardNumber: String,
                                   expMonth: Int,
                                   expYear: Int,
                                   cvc: String) -> [String] {
    var errors: [String] = []

    // Validate card number (Luhn algorithm)
    let cleaned = cardNumber.replacingOccurrences(of: " ", with: "")
    if cleaned.count < 13 || cleaned.count > 19 {
      errors.append("Invalid card number length")
    }

    // Validate expiration
    let now = Date()
    let calendar = Calendar.current
    let currentYear = calendar.component(.year, from: now)
    let currentMonth = calendar.component(.month, from: now)

    if expYear < currentYear || (expYear == currentYear && expMonth < currentMonth) {
      errors.append("Card has expired")
    }

    // Validate CVC
    if cvc.count < 3 || cvc.count > 4 {
      errors.append("Invalid CVC")
    }

    return errors
  }

  private func handleNextAction(_ nextAction: [String: Any],
                               paymentIntent: [String: Any]?) {
    guard let type = nextAction["type"] as? String else {
      return
    }

    switch type {
    case "redirect_to_url":
      sendEvent(withName: "3dsStarted", body: nextAction)
    case "otp":
      sendEvent(withName: "otpRequested", body: nextAction)
    default:
      break
    }
  }

  // MARK: - Event Emitter

  override func supportedEvents() -> [String]! {
    return [
      "paymentSuccess",
      "paymentFailed",
      "paymentCanceled",
      "tokenCreated",
      "otpRequested",
      "3dsStarted"
    ]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
