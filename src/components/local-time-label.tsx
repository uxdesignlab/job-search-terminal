"use client";

import { useEffect, useState } from "react";

type LocalDateLabelProps = {
  value: string | null | undefined;
  fallback?: string;
};

type LocalRelativeTimeLabelProps = {
  value: string | null | undefined;
  fallback?: string;
};

export function LocalDateLabel({ value, fallback = "" }: LocalDateLabelProps) {
  const [label, setLabel] = useState(fallback);

  useEffect(() => {
    setLabel(formatLocalDate(value, fallback));
  }, [fallback, value]);

  return <>{label}</>;
}

export function LocalRelativeTimeLabel({ value, fallback = "Never" }: LocalRelativeTimeLabelProps) {
  const [label, setLabel] = useState(fallback);

  useEffect(() => {
    const updateLabel = () => setLabel(formatRelativeTime(value, fallback));
    updateLabel();

    const timer = window.setInterval(updateLabel, 60_000);
    return () => window.clearInterval(timer);
  }, [fallback, value]);

  return <>{label}</>;
}

export function formatLocalDate(value: string | null | undefined, fallback = "") {
  if (!value) {
    return fallback;
  }

  const date = parseDate(value);
  if (!date) {
    return fallback || value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: getUserTimeZone(),
  }).format(date);
}

function formatRelativeTime(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  const date = parseDate(value);
  if (!date) {
    return fallback;
  }

  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (absMs < minuteMs) {
    return "just now";
  }

  const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  if (absMs < hourMs) {
    return formatter.format(Math.round(diffMs / minuteMs), "minute");
  }
  if (absMs < dayMs) {
    return formatter.format(Math.round(diffMs / hourMs), "hour");
  }
  if (absMs < 30 * dayMs) {
    return formatter.format(Math.round(diffMs / dayMs), "day");
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: getUserTimeZone(),
  }).format(date);
}

function parseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getUserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
