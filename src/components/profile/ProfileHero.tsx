"use client";

import NextImage from "next/image";
import { Camera, Loader2 } from "lucide-react";
import { getInitials } from "@/lib/getInitials";

type ProfileHeroProps = {
  displayName: string;
  avatarUrl?: string | null;
  birthDateLabel?: string | null;
  isUploadingAvatar?: boolean;
  compact?: boolean;
  onAvatarClick: () => void;
};

export function ProfileHero({
  displayName,
  avatarUrl,
  birthDateLabel,
  isUploadingAvatar = false,
  compact = false,
  onAvatarClick,
}: ProfileHeroProps) {
  const sizeClass = compact ? "h-28 w-28 text-3xl" : "h-32 w-32 text-4xl";

  return (
    <div className="flex flex-col items-center text-center">
      <button
        type="button"
        onClick={onAvatarClick}
        className={`group relative mb-4 flex ${sizeClass} items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/25 to-primary/5 font-semibold text-primary shadow-md ring-2 ring-primary/25 ring-offset-2 ring-offset-background transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2`}
        aria-label="Выбрать фото из галереи"
        title="Выбрать фото из галереи"
      >
        {avatarUrl ? (
          <NextImage
            src={avatarUrl}
            alt=""
            width={128}
            height={128}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          getInitials(displayName)
        )}
        <span className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/45 via-transparent to-transparent pb-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Camera className="h-5 w-5 text-white drop-shadow" aria-hidden />
        </span>
        {isUploadingAvatar ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </span>
        ) : null}
      </button>

      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{displayName}</h1>
      {birthDateLabel ? (
        <p className="mt-1.5 inline-flex rounded-full bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
          {birthDateLabel}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">Нажмите на фото, чтобы изменить</p>
    </div>
  );
}
