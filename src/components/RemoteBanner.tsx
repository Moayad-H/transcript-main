"use client";

import React, { useEffect, useState } from "react";

export type BannerType = "info" | "warning" | "danger" | "error" | "success";

export interface BannerData {
  enabled?: boolean;
  id?: string;
  message?: string;
  type?: BannerType;
  linkText?: string;
  linkUrl?: string;
  dismissible?: boolean;
}

const STORAGE_KEY = "ershad_dismissed_banner";

export function RemoteBanner() {
  const [banner, setBanner] = useState<BannerData | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(true); // start hidden to avoid flash before check

  useEffect(() => {
    const bannerUrl = process.env.NEXT_PUBLIC_EDGE_CONFIG_BANNER_URL;
    if (!bannerUrl) {
      return;
    }

    const endpoint: string = bannerUrl;
    let isMounted = true;

    async function fetchBanner() {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        // Vercel Edge Config /item/banner endpoint may return the raw value or { value: ... }
        const parsed: BannerData =
          data && typeof data === "object" && "value" in data && data.value
            ? (data.value as BannerData)
            : (data as BannerData);

        if (!isMounted || !parsed || !parsed.enabled || !parsed.message) {
          return;
        }

        const bannerId = parsed.id || parsed.message;
        const dismissedId = window.localStorage.getItem(STORAGE_KEY);

        if (dismissedId === bannerId) {
          setIsDismissed(true);
        } else {
          setIsDismissed(false);
        }

        setBanner(parsed);
      } catch {
        // Silent catch: network failure or invalid endpoint should never break the app
      }
    }

    fetchBanner();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!banner || !banner.enabled || !banner.message || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    const bannerId = banner.id || banner.message;
    if (bannerId) {
      try {
        window.localStorage.setItem(STORAGE_KEY, bannerId);
      } catch {
        // Ignore localStorage errors (e.g. private browsing storage limits)
      }
    }
  };

  const type = banner.type || "info";

  // Color mappings matching Tailwind palette
  const styleMap: Record<
    BannerType,
    { bg: string; text: string; border: string; iconColor: string; buttonHover: string }
  > = {
    info: {
      bg: "bg-blue-600",
      text: "text-white",
      border: "border-blue-700",
      iconColor: "text-blue-200",
      buttonHover: "hover:bg-blue-700",
    },
    warning: {
      bg: "bg-amber-500",
      text: "text-amber-950",
      border: "border-amber-600",
      iconColor: "text-amber-900",
      buttonHover: "hover:bg-amber-600/30",
    },
    danger: {
      bg: "bg-rose-600",
      text: "text-white",
      border: "border-rose-700",
      iconColor: "text-rose-200",
      buttonHover: "hover:bg-rose-700",
    },
    error: {
      bg: "bg-rose-600",
      text: "text-white",
      border: "border-rose-700",
      iconColor: "text-rose-200",
      buttonHover: "hover:bg-rose-700",
    },
    success: {
      bg: "bg-emerald-600",
      text: "text-white",
      border: "border-emerald-700",
      iconColor: "text-emerald-200",
      buttonHover: "hover:bg-emerald-700",
    },
  };

  const currentStyle = styleMap[type] || styleMap.info;
  const isDismissible = banner.dismissible !== false; // Default true unless explicitly false

  return (
    <aside
      aria-label="Announcement"
      className={`relative flex-shrink-0 border-b px-4 py-2.5 transition-all print:hidden ${currentStyle.bg} ${currentStyle.text} ${currentStyle.border}`}
    >
      <div className="container mx-auto flex items-center justify-between gap-3 text-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {/* Icon */}
          <span className={`flex-shrink-0 ${currentStyle.iconColor}`} aria-hidden="true">
            {type === "warning" ? (
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            ) : type === "danger" || type === "error" ? (
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            ) : type === "success" ? (
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </span>

          {/* Text & Link */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-snug">
            <span className="font-medium">{banner.message}</span>
            {banner.linkUrl && (
              <a
                href={banner.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center underline decoration-current/70 underline-offset-2 transition-opacity hover:opacity-80"
              >
                {banner.linkText || "Learn more"} &rarr;
              </a>
            )}
          </div>
        </div>

        {/* Dismiss Button */}
        {isDismissible && (
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss banner"
            className={`-mr-1 rounded-md p-1 transition-colors ${currentStyle.buttonHover} focus:outline-none focus:ring-2 focus:ring-white`}
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    </aside>
  );
}
