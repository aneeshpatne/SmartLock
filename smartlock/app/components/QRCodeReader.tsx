"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function QRCodeReader() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const codeReader = new BrowserMultiFormatReader();

    if (videoRef.current) {
      codeReader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, err) => {
          if (result) {
            setResult(result.getText());
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
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <video ref={videoRef} className="border rounded" />
      {result && <p className="text-center">{result}</p>}
      {error && <p className="text-red-500 text-center">{error}</p>}
    </div>
  );
}
