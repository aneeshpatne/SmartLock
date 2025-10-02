"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { authenticator } from "otplib";

type Mode = "idle" | "onboarding" | "verification";

export default function QRCodeReader() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [mode, setMode] = useState<Mode>("idle");
  const [totpCode, setTotpCode] = useState<string>("");

  const parseOtpAuth = (url: string) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === "otpauth:" && urlObj.pathname.startsWith("/totp/")) {
        const secret = urlObj.searchParams.get("secret");
        return secret;
      }
    } catch {
      return null;
    }
    return null;
  };

  const handleScan = async (qrText: string) => {
    const secret = parseOtpAuth(qrText);
    if (!secret) {
      setError("Invalid TOTP QR code");
      return;
    }

    if (mode === "onboarding") {
      const code = authenticator.generate(secret);
      setTotpCode(code);
      setResult(`TOTP Code: ${code}`);
    } else if (mode === "verification") {
      const code = authenticator.generate(secret);
      try {
        const response = await fetch("http://192.168.1.32/unlock", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            apiKey: "myKey",
            totp: code,
          }),
        });
        if (response.ok) {
          setResult("Unlock successful!");
        } else {
          setResult("Unlock failed!");
        }
      } catch (err) {
        setError("Failed to send unlock request");
      }
    }
  };

  useEffect(() => {
    if (mode === "idle") return;

    const codeReader = new BrowserMultiFormatReader();

    if (videoRef.current) {
      codeReader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, err) => {
          if (result) {
            handleScan(result.getText());
            setError("");
          }
          if (err && !(err instanceof Error)) {
            setError("No QR code found");
          }
        }
      );
    }

    return () => {
      // Cleanup if needed
    };
  }, [mode]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-4">
        <button
          onClick={() => setMode("onboarding")}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Onboarding
        </button>
        <button
          onClick={() => setMode("verification")}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          OTP Verification
        </button>
      </div>
      {mode !== "idle" && <video ref={videoRef} className="border rounded" />}
      {result && <p className="text-center">{result}</p>}
      {error && <p className="text-red-500 text-center">{error}</p>}
    </div>
  );
}
