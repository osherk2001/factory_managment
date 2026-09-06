"use client";
import { useMessages } from "@/lib/i18n/client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { IScannerControls } from "@zxing/browser";
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function CameraScanner({
  onDecoded,
  disabled,
}: {
  onDecoded: (barcode: string) => void;
  disabled: boolean;
}) {
  const m = useMessages().operations;
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);
  function release() {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }
  useEffect(
    () => () => {
      generation.current++;
      controls.current?.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  async function start() {
    release();
    const current = generation.current;
    setFailed(false);
    setActive(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (current !== generation.current) return;
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (current !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const reader = new BrowserMultiFormatReader();
      let consumed = false;
      const scanner = await reader.decodeFromStream(
        media,
        video.current!,
        (result) => {
          if (!result || consumed || current !== generation.current) return;
          consumed = true;
          onDecoded(result.getText());
          release();
          setActive(false);
        },
      );
      if (current !== generation.current) scanner.stop();
      else controls.current = scanner;
    } catch {
      if (current === generation.current) {
        release();
        setActive(false);
        setFailed(true);
      }
    }
  }
  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={disabled || !ready}
        className="min-h-12 w-full rounded-xl border px-4 py-3 font-medium"
        onClick={() => {
          if (active) {
            release();
            setActive(false);
          } else void start();
        }}
      >
        {active ? m.stopCamera : m.camera}
      </button>
      <video
        ref={video}
        muted
        playsInline
        aria-label={m.cameraPreview}
        className={
          active
            ? "aspect-square w-full rounded-xl bg-black object-cover"
            : "hidden"
        }
      />
      {active ? (
        <p role="status" className="text-sm">
          {m.cameraHint}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-red-700">
          {m.cameraFailed}
        </p>
      ) : null}
    </div>
  );
}
