# 🔐 SmartLock

> ESP32-powered smart lock using Time-based One-Time Passwords (TOTP) for secure authentication

A smart lock implementation that uses TOTP codes from authenticator apps like Google Authenticator for access control.

[![ESP32](https://img.shields.io/badge/Platform-ESP32-blue.svg)](https://www.espressif.com/en/products/socs/esp32)
[![RFC 6238](https://img.shields.io/badge/Standard-RFC%206238-green.svg)](https://tools.ietf.org/html/rfc6238)

## How It Works

The ESP32 and authenticator app share a cryptographic secret. Both generate synchronized 6-digit codes every 30 seconds using the TOTP algorithm. When codes match, the lock opens.

## Features

- **🔒 TOTP Authentication**: Uses RFC 6238 standard with HMAC-SHA1
- **📱 Authenticator App Support**: Compatible with Google Authenticator, Authy, 1Password
- **⚡ Fast Unlock**: Sub-second verification once code is entered
- **🛡️ 160-bit Security**: Strong cryptographic secrets
- **🔧 Modular Code**: Clean, organized firmware structure
- **💰 Low Cost**: Complete system under $20

## Implementation

1. **Setup**: Generate secret and scan QR code with authenticator app
2. **Operation**: Enter 6-digit code from app to unlock
3. **Security**: Codes expire every 30 seconds and cannot be reused

## Technical Details

```
1. Generate 160-bit secret → Base32 encode
2. Current time ÷ 30 seconds = counter
3. HMAC-SHA1(secret, counter) = 20-byte hash
4. Dynamic truncation → 31-bit number
5. Modulo 1,000,000 → 6-digit code
```

This follows [RFC 6238](https://tools.ietf.org/html/rfc6238) standard for TOTP compatibility.

## Hardware Requirements

### Components (~$15-20)

- ESP32 development board
- SG90 servo motor
- Jumper wires and breadboard
- 5V power supply
- Lock mechanism

### Software

- Arduino IDE or PlatformIO
- Python 3.8+ (for provisioning tools)
- Authenticator app
