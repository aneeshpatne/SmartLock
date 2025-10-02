"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { authenticator } from "otplib";

// Modes of operation
type Mode = "idle" | "onboarding" | "verification";

// Minimal ZXing result shape used in callbacks
// (The library passes a Result instance or undefined on misses.)
type ZXingResult = { getText: () => string } | undefined;

// Parsed params from an otpauth://totp URL
interface TotpParams {
  secret: string;
  issuer?: string | null;
  label?: string | null;
  digits?: number | null;
  period?: number | null;
  algorithm?: string | null; // e.g. "SHA-1", "SHA256"
}

// Normalize algorithm from QR into otplib format
type SupportedHashAlgorithm = "sha1" | "sha256" | "sha512";

function normalizeAlgo(
  algo?: string | null
): SupportedHashAlgorithm | undefined {
  if (!algo) return undefined;
  const compact = algo.toLowerCase().replace(/[-_]/g, "");
  if (compact.includes("sha512")) return "sha512";
  if (compact.includes("sha256")) return "sha256";
  if (compact.includes("sha1")) return "sha1";
  return undefined;
}

function parseOtpAuth(url: string): TotpParams | null {
  try {
    const urlObj = new URL(url.trim());
    console.log("Parsed URL:", {
      protocol: urlObj.protocol,
      host: urlObj.host,
      hostname: urlObj.hostname,
      pathname: urlObj.pathname,
      search: urlObj.search,
    });

    const isTotp = urlObj.protocol === "otpauth:" && urlObj.host === "totp";
    if (!isTotp) {
      console.log("Not a valid TOTP URL");
      return null;
    }

    // Label: the pathname (starts with /), URL-decoded (may be "Issuer:Account")
    const rawLabel = urlObj.pathname
      ? decodeURIComponent(urlObj.pathname.slice(1))
      : "";

    const sp = urlObj.searchParams;
    const secret = sp.get("secret") ?? sp.get("SECRET");
    if (!secret) {
      console.log("No secret found in URL");
      return null;
    }

    const issuer = sp.get("issuer");
    const digits = sp.get("digits") ? Number(sp.get("digits")) : null;
    const period = sp.get("period") ? Number(sp.get("period")) : null;
    const algorithm = sp.get("algorithm") ?? sp.get("ALGORITHM");

    console.log("Parsed params:", {
      secret,
      issuer,
      label: rawLabel,
      digits,
      period,
      algorithm,
    });

    return {
      secret,
      issuer,
      label: rawLabel || null,
      digits,
      period,
      algorithm,
    };
  } catch (e) {
    console.error("Parse error:", e);
    return null;
  }
}

// Apply QR parameters to otplib before generating the code
function configureAuthenticatorFromParams(params: TotpParams) {
  const algo = normalizeAlgo(params.algorithm);
  const next: typeof authenticator.options = {
    ...authenticator.options,
    step: params.period ?? authenticator.options.step, // default 30s -> allow custom (e.g. 5s)
    digits: params.digits ?? authenticator.options.digits,
    window: 1, // tolerate slight clock skew
  };

  if (algo) {
    // otplib expects algorithm like 'sha1'|'sha256'|'sha512' at runtime.
    // We use an unknown cast to satisfy the TypeScript signature while
    // ensuring the runtime value is the lowercase strings returned by
    // normalizeAlgo.
    (next as unknown as { algorithm: unknown }).algorithm = algo;
  }

  authenticator.options = next;
}

export default function QRCodeReader() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanAtRef = useRef<number>(0);
  const lastScanTextRef = useRef<string | null>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [isOnboarded, setIsOnboarded] = useState<boolean>(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [activeCamLabel, setActiveCamLabel] = useState<string>("");
  const [savedParams, setSavedParams] = useState<TotpParams | null>(null);

  const modeLabelMap: Record<Mode, string> = {
    idle: "Standby",
    onboarding: "Onboarding",
    verification: "Verification",
  };

  const helperText =
    mode === "onboarding"
      ? "Point the camera at your authenticator’s QR code to store its secret securely."
      : mode === "verification"
      ? "Scan the one-time password QR displayed on your authenticator to unlock."
      : isOnboarded
      ? "All set. Start verification when you’re ready to unlock."
      : "Begin by onboarding a TOTP QR code issued by your authenticator app.";

  const statusCards = [
    {
      label: "Current mode",
      value: modeLabelMap[mode],
      gradient:
        mode === "idle"
          ? "from-slate-500/30 to-slate-500/0"
          : "from-sky-400/40 to-sky-400/0",
    },
    {
      label: "Enrollment",
      value: isOnboarded ? "Complete" : "Pending",
      gradient: isOnboarded
        ? "from-emerald-400/40 to-emerald-400/0"
        : "from-amber-400/35 to-amber-400/0",
    },
    {
      label: "Lock status",
      value: unlocked ? "Unlocked" : "Locked",
      gradient: unlocked
        ? "from-emerald-500/45 to-emerald-500/0"
        : "from-rose-500/40 to-rose-500/0",
    },
  ];

  const showVideo = mode !== "idle";

  // Ignore rapid repeat scans of identical QR content
  const SCAN_IGNORE_MS = 2000;

  const stopReader = useCallback(() => {
    try {
      (readerRef.current as unknown as { reset?: () => void })?.reset?.();
    } catch {}
    readerRef.current = null;

    // Stop any lingering media tracks on the <video>
    if (videoRef.current && videoRef.current.srcObject) {
      const ms = videoRef.current.srcObject as MediaStream;
      ms.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleScan = useCallback(
    async (qrText: string) => {
      setError("");
      const normalized = qrText?.trim();
      const now = Date.now();

      console.log("Scanned QR text:", normalized);

      // Only debounce in onboarding mode, not in verification
      if (
        mode === "onboarding" &&
        lastScanTextRef.current === normalized &&
        now - lastScanAtRef.current < SCAN_IGNORE_MS
      ) {
        return; // duplicate within debounce window
      }
      lastScanAtRef.current = now;
      lastScanTextRef.current = normalized;

      if (mode === "onboarding") {
        // During onboarding, scan the TOTP QR code
        const params = parseOtpAuth(normalized);
        if (!params) {
          setError("Invalid TOTP QR code");
          return;
        }

        try {
          configureAuthenticatorFromParams(params);
        } catch (e) {
          console.error("Failed configuring authenticator", e);
        }

        const code = authenticator.generate(params.secret);
        console.log("Generated OTP:", code);

        // Save the params for future verification
        setSavedParams(params);
        setResult(
          `Onboarded ${
            params.label ?? params.issuer ?? "TOTP"
          } • Code now: ${code}`
        );
        setIsOnboarded(true);
        stopReader();
        setMode("idle");
        return;
      }

      if (mode === "verification") {
        // During verification, scan a QR code containing just the OTP
        if (!savedParams) {
          setError("No saved TOTP secret. Please onboard first.");
          setMode("idle");
          stopReader();
          return;
        }

        // The scanned text should be just the OTP (e.g., "345834")
        const scannedOtp = normalized;

        try {
          configureAuthenticatorFromParams(savedParams);
        } catch (e) {
          console.error("Failed configuring authenticator", e);
        }

        const expectedOtp = authenticator.generate(savedParams.secret);
        console.log("Scanned OTP:", scannedOtp);
        console.log("Expected OTP:", expectedOtp);

        // Verify the scanned OTP matches the expected OTP
        if (scannedOtp !== expectedOtp) {
          setError("Invalid OTP code");
          setResult("");
          return;
        }

        console.log("success");
        // OTP is valid — send unlock request to local lock controller.
        // We'll attempt a POST with a short timeout and show result/error.
        setError("");
        setResult("Sending unlock request...");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        try {
          const resp = await fetch("/api/unlock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ totp: scannedOtp }),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (resp.ok) {
            setResult("Unlock successful!");
            setError("");
            setUnlocked(true);
            stopReader();
            setMode("idle");
          } else {
            const txt = await resp.text().catch(() => "");
            setError(`Unlock failed${txt ? ": " + txt : "!"}`);
            setResult("");
            // keep scanning active on failure
          }
        } catch (e: unknown) {
          clearTimeout(timeout);
          if ((e as DOMException)?.name === "AbortError") {
            setError("Unlock request timed out");
          } else {
            console.error("Unlock request error:", e);
            setError(
              "Failed to send unlock request: " +
                String((e as Error)?.message ?? e)
            );
          }
          setResult("");
          // continue scanning
        }

        return;
      }
    },
    [mode, savedParams, stopReader]
  );

  useEffect(() => {
    if (mode === "idle") return;

    let mounted = true;

    // Count consecutive NotFound callbacks before showing a message
    const noFindRef = { current: 0 } as { current: number };
    const NO_FIND_THRESHOLD = 5;

    async function startScanning() {
      try {
        const codeReader = new BrowserMultiFormatReader();
        readerRef.current = codeReader;

        // Prefer a rear/back camera if available
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!devices || devices.length === 0) {
          setError("No camera devices found");
          return;
        }
        const back = devices.find((d) =>
          /back|rear|environment/i.test(d.label)
        );
        const selected = back ?? devices[0];
        setActiveCamLabel(selected.label || "");

        const onDecode = (result?: ZXingResult, err?: unknown) => {
          if (!mounted) return;

          if (result) {
            // stop decoding further frames while we process
            try {
              (
                readerRef.current as unknown as { reset?: () => void }
              )?.reset?.();
            } catch {}
            noFindRef.current = 0;
            setError("");
            handleScan(result.getText());
            return;
          }

          // ZXing frequently emits NotFoundException during scanning
          if (err && err instanceof Error) {
            if (err.name === "NotFoundException") {
              noFindRef.current += 1;
              if (noFindRef.current >= NO_FIND_THRESHOLD)
                setError("No QR code found");
              return;
            }
            console.error("ZXing error:", err);
            setError("Scanner error");
            return;
          }

          // Miss without an Error object
          noFindRef.current += 1;
          if (noFindRef.current >= NO_FIND_THRESHOLD)
            setError("No QR code found");
        };

        await codeReader.decodeFromVideoDevice(
          selected.deviceId,
          videoRef.current ?? undefined,
          onDecode
        );
      } catch (e) {
        console.error("Error starting camera:", e);
        setError("Failed to access camera. Please check permissions.");
      }
    }

    startScanning();
    return () => {
      mounted = false;
      stopReader();
    };
  }, [mode, handleScan, stopReader, savedParams]);

  return (
    <section className="relative flex w-full max-w-3xl flex-col items-center px-2 py-6 sm:px-6">
      <div className="relative isolate w-full overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-8 shadow-[0_25px_45px_rgba(15,23,42,0.45)] backdrop-blur-2xl sm:p-10">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
          <div className="absolute -left-1/3 top-10 h-40 w-72 rotate-[12deg] bg-gradient-to-r from-sky-500/30 to-blue-400/20 blur-3xl" />
          <div className="absolute -right-24 bottom-[-6rem] h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(236,72,153,0.35),_transparent_60%)] blur-3xl" />
        </div>

        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.28em] text-slate-100/70 backdrop-blur">
            SmartLock Console
          </span>
          <h1 className="mt-4 text-3xl font-semibold text-white md:text-4xl">
            Secure access with live TOTP scanning
          </h1>
          <p className="mt-3 text-sm text-slate-200/80 md:text-base">
            {helperText}
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <button
            onClick={() => {
              setResult("");
              setError("");
              setUnlocked(false);
              setMode("onboarding");
            }}
            disabled={isOnboarded}
            className={`group relative flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition sm:w-auto ${
              isOnboarded
                ? "cursor-not-allowed bg-white/5 text-slate-400"
                : "bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 text-white shadow-lg shadow-sky-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/50"
            }`}
            aria-pressed={mode === "onboarding"}
          >
            {isOnboarded ? "Onboarding complete" : "Start onboarding"}
          </button>

          {isOnboarded && (
            <button
              onClick={() => {
                setResult("");
                setError("");
                setUnlocked(false);
                setMode("verification");
              }}
              className="relative flex w-full items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 px-6 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-400/30 transition hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70 sm:w-auto"
              aria-pressed={mode === "verification"}
            >
              Start verification
            </button>
          )}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {statusCards.map(({ label, value, gradient }) => (
            <div
              key={label}
              className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-sm text-slate-100/80 shadow-inner shadow-white/5`}
            >
              <div
                className={`pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br ${gradient}`}
              />
              <p className="text-xs uppercase tracking-[0.18em] text-slate-200/60">
                {label}
              </p>
              <p className="mt-2 text-xl font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>

        {showVideo && (
          <div className="relative mt-10 w-full overflow-hidden rounded-3xl border border-white/15 bg-slate-900/60 shadow-2xl">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/40 via-transparent to-white/5 opacity-60 mix-blend-soft-light" />
            <video
              ref={videoRef}
              className="relative z-10 h-[18rem] w-full object-cover md:h-80"
              autoPlay
              playsInline
              muted
            />
            <div className="absolute left-4 top-4 z-20 inline-flex items-center gap-2 rounded-full bg-slate-950/70 px-4 py-1 text-xs font-medium text-slate-100 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              {activeCamLabel ? `Camera: ${activeCamLabel}` : "Scanning active"}
            </div>
          </div>
        )}

        <div className="mt-8 space-y-3 text-sm" aria-live="polite">
          {result && (
            <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-5 py-4 text-emerald-200 shadow-inner shadow-emerald-500/20">
              {result}
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-rose-400/40 bg-rose-400/10 px-5 py-4 text-rose-100 shadow-inner shadow-rose-500/20">
              {error}
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-xs text-slate-300/70">
          {mode === "idle" && !isOnboarded && (
            <p>
              Need help? Scan the issuer-provided TOTP QR to complete
              onboarding.
            </p>
          )}
          {mode === "idle" && isOnboarded && !unlocked && (
            <p>
              When you’re near the lock, tap verification and scan the current
              OTP.
            </p>
          )}
          {unlocked && (
            <p>
              Unlock confirmed. The console will await the next verification
              cycle.
            </p>
          )}
        </div>

        <details className="mt-10 w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-xs text-slate-200/70 backdrop-blur">
          <summary className="cursor-pointer select-none px-4 py-3 font-medium text-slate-100/80">
            Diagnostics
          </summary>
          <pre className="whitespace-pre-wrap break-all px-4 pb-4 text-[11px] leading-5 text-slate-200/70">
            Mode: {mode}\nOnboarded: {String(isOnboarded)}\nUnlocked:{" "}
            {String(unlocked)}\nLast result: {result || "—"}\nLast error:{" "}
            {error || "—"}
          </pre>
        </details>
      </div>
    </section>
  );
}
