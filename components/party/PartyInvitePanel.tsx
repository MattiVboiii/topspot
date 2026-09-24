"use client";

import { QrCard } from "@/components/party/QrCard";
import { fill, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { Printer, Share2 } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

type Props = {
  joinUrl: string;
  code: string;
  hostName: string;
  partyId: string;
};

function inviteMessageKey(partyId: string) {
  return `topspot_invite_msg_${partyId}`;
}

function readStoredMessage(partyId: string) {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(inviteMessageKey(partyId)) ?? "";
  } catch {
    return "";
  }
}

function persistMessage(partyId: string, value: string) {
  try {
    window.localStorage.setItem(inviteMessageKey(partyId), value);
  } catch {
    // ignore
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPrintDocument(opts: {
  qrDataUrl: string;
  code: string;
  joinUrl: string;
  message: string;
  lang: string;
  labels: {
    joinTheParty: string;
    hostedBy: string;
    partyCode: string;
    scanOrEnter: string;
    printTitle: string;
    qrAlt: string;
  };
}) {
  const { qrDataUrl, code, joinUrl, message, lang, labels } = opts;
  const trimmedMessage = message.trim();
  const messageBlock = trimmedMessage
    ? `<p class="message">${escapeHtml(trimmedMessage).replace(/\n/g, "<br />")}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(labels.printTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 48px 32px;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #0b1220;
      background: #fff;
    }
    .sheet {
      max-width: 520px;
      margin: 0 auto;
      text-align: center;
    }
    .brand {
      font-size: 13px;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: #059669;
      font-weight: 700;
      margin: 0 0 8px;
    }
    h1 {
      font-size: 28px;
      margin: 0 0 6px;
      font-weight: 800;
    }
    .host {
      margin: 0 0 24px;
      color: #475569;
      font-size: 15px;
    }
    .message {
      margin: 0 auto 28px;
      max-width: 420px;
      padding: 16px 18px;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      background: #f8fafc;
      font-size: 15px;
      line-height: 1.5;
      text-align: left;
      white-space: pre-wrap;
    }
    .qr {
      width: 240px;
      height: 240px;
      margin: 0 auto 20px;
      padding: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
    }
    .label {
      margin: 0;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #64748b;
    }
    .code {
      margin: 8px 0 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 40px;
      font-weight: 800;
      letter-spacing: 0.28em;
    }
    .url {
      margin: 24px 0 0;
      font-size: 12px;
      color: #64748b;
      word-break: break-all;
    }
    .hint {
      margin: 28px 0 0;
      font-size: 13px;
      color: #64748b;
      line-height: 1.5;
    }
    @media print {
      body { padding: 24px; }
    }
  </style>
</head>
<body>
  <article class="sheet">
    <p class="brand">TopSpot</p>
    <h1>${escapeHtml(labels.joinTheParty)}</h1>
    <p class="host">${escapeHtml(labels.hostedBy)}</p>
    ${messageBlock}
    <img class="qr" src="${qrDataUrl}" alt="${escapeHtml(labels.qrAlt)}" />
    <p class="label">${escapeHtml(labels.partyCode)}</p>
    <p class="code">${escapeHtml(code)}</p>
    <p class="url">${escapeHtml(joinUrl)}</p>
    <p class="hint">${escapeHtml(labels.scanOrEnter)}</p>
  </article>
</body>
</html>`;
}

export function PartyInvitePanel({ joinUrl, code, hostName, partyId }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [message, setMessage] = useState(() => readStoredMessage(partyId));
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const canShare = useSyncExternalStore(
    () => () => {},
    () =>
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(joinUrl, {
        width: 480,
        margin: 2,
        color: { dark: "#0b1220", light: "#ffffff" },
      }).then((url) => {
        if (!cancelled) setQrDataUrl(url);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  const sharePayload = useCallback(() => {
    const trimmed = message.trim();
    const text = trimmed
      ? fill(t.invite.shareTextWithNote, { note: trimmed, code })
      : fill(t.invite.shareText, { name: hostName, code });
    return {
      title: fill(t.invite.shareTitle, { code }),
      text,
      url: joinUrl,
    };
  }, [message, code, hostName, joinUrl, t]);

  const handleShare = useCallback(async () => {
    setShareError(null);
    setCopied(false);
    const payload = sharePayload();

    try {
      if (canShare) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(`${payload.text}\n${payload.url}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setShareError(t.invite.shareFailed);
    }
  }, [canShare, sharePayload, t.invite.shareFailed]);

  const handlePrint = useCallback(() => {
    if (!qrDataUrl || printBusy) return;
    setPrintBusy(true);
    setShareError(null);

    const html = buildPrintDocument({
      qrDataUrl,
      code,
      joinUrl,
      message,
      lang: locale,
      labels: {
        joinTheParty: t.invite.joinTheParty,
        hostedBy: fill(t.invite.hostedBy, { name: hostName }),
        partyCode: t.invite.partyCode,
        scanOrEnter: t.invite.scanOrEnter,
        printTitle: fill(t.invite.printTitle, { code }),
        qrAlt: fill(t.qr.altParty, { code }),
      },
    });

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const frameDoc = frameWindow?.document;
    if (!frameWindow || !frameDoc) {
      iframe.remove();
      setShareError(t.invite.printFailed);
      setPrintBusy(false);
      return;
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    const finish = () => {
      iframe.remove();
      setPrintBusy(false);
    };

    const triggerPrint = () => {
      frameWindow.focus();
      frameWindow.print();
      window.setTimeout(finish, 500);
    };

    if (frameDoc.readyState === "complete") {
      window.requestAnimationFrame(triggerPrint);
    } else {
      iframe.onload = () => window.requestAnimationFrame(triggerPrint);
    }
  }, [qrDataUrl, printBusy, code, joinUrl, hostName, message, t, locale]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <label className="block shrink-0 text-left">
        <span className="mb-1.5 block text-sm font-medium text-white/80">
          {t.invite.noteLabel}
        </span>
        <textarea
          value={message}
          onChange={(e) => {
            const next = e.target.value;
            setMessage(next);
            persistMessage(partyId, next);
          }}
          rows={2}
          maxLength={280}
          placeholder={t.invite.notePlaceholder}
          className="w-full resize-none rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-emerald-400/50 focus:outline-none"
        />
        <span className="mt-1 block text-right text-xs text-white/40">
          {message.length}/280
        </span>
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <QrCard joinUrl={joinUrl} code={code} variant="compact" />
      </div>

      <div className="shrink-0 space-y-2 border-t border-white/10 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleShare()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-emerald-950"
          >
            <Share2 className="h-4 w-4" aria-hidden />
            {canShare
              ? t.invite.share
              : copied
                ? t.invite.copied
                : t.invite.copyLink}
          </button>
          <button
            type="button"
            disabled={!qrDataUrl || printBusy}
            onClick={handlePrint}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Printer className="h-4 w-4" aria-hidden />
            {printBusy ? t.invite.preparing : t.invite.print}
          </button>
        </div>

        {canShare && (
          <p className="text-center text-xs text-white/45">
            {t.invite.shareHint}
          </p>
        )}

        {shareError && (
          <p className="text-center text-sm text-amber-200/90">{shareError}</p>
        )}
      </div>
    </div>
  );
}
