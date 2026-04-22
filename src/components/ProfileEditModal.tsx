"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { chatAuthApi, type MeResponse } from "@/services/chatAuthApi";
import {
  BOTTOM_SHEET_ANIM_MS,
  bottomSheetBackdropBaseClass,
  bottomSheetBackdropOpacityClass,
  bottomSheetHandleClass,
  bottomSheetPanelBottomStyle,
  bottomSheetPanelTallClass,
  bottomSheetRootClass,
} from "@/lib/bottomSheetModalClasses";

export type ProfileEditSource = {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  birth_date?: string;
};

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Текущие данные с сервера; при открытии подставляются в форму. */
  source: ProfileEditSource | null;
  onSaved: (data: MeResponse) => void;
}

const inputClassName =
  "w-full rounded-xl border border-border/90 bg-muted/15 px-3.5 py-3 text-sm text-foreground shadow-sm transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/70 focus:border-primary/40 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20";

export function ProfileEditModal({ isOpen, onClose, source, onSaved }: ProfileEditModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsExiting(false);
      setError(null);
      const start = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => {
        cancelAnimationFrame(start);
      };
    }
    setIsVisible(false);
    setIsExiting(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !source) return;
    setFirstName(source.first_name ?? "");
    setLastName(source.last_name ?? "");
    setMiddleName(source.middle_name ?? "");
    setBirthDate(source.birth_date ?? "");
    setError(null);
  }, [isOpen, source]);

  const handleClose = () => {
    if (!isVisible || isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, BOTTOM_SHEET_ANIM_MS);
  };

  const handleSave = async () => {
    setError(null);
    const first = firstName.trim();
    const last = lastName.trim();
    const middle = middleName.trim();
    const birth = birthDate.trim();

    if (!first || !last) {
      setError("Пожалуйста, заполните имя и фамилию");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) {
      setError("Пожалуйста, выберите корректную дату рождения");
      return;
    }

    try {
      setSaving(true);
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) throw new Error("Нет access token");

      const updated = await chatAuthApi.updateMe(tokens.access_token, {
        first_name: first,
        last_name: last,
        middle_name: middle || undefined,
        birth_date: birth,
      });

      onSaved(updated);
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={bottomSheetRootClass}
      style={{ zIndex: 9999 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-edit-modal-title"
    >
      <div
        className={`${bottomSheetBackdropBaseClass} ${bottomSheetBackdropOpacityClass(isVisible, isExiting)}`}
        onClick={() => {
          if (!saving) handleClose();
        }}
        aria-hidden
      />

      <div
        className={`${bottomSheetPanelTallClass} transition-transform ease-out`}
        style={{
          transitionDuration: `${BOTTOM_SHEET_ANIM_MS}ms`,
          transform: isVisible && !isExiting ? "translateY(0)" : "translateY(100%)",
          ...bottomSheetPanelBottomStyle,
        }}
      >
        <div className={bottomSheetHandleClass} aria-hidden />
        <div className="flex shrink-0 items-start justify-between gap-3">
          <h2 id="profile-edit-modal-title" className="text-lg font-semibold tracking-tight text-foreground">
            Данные профиля
          </h2>
          <button
            type="button"
            onClick={() => !saving && handleClose()}
            disabled={saving}
            className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            aria-label="Закрыть"
            title="Закрыть"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground mb-4">
          Измените имя, фамилию и дату рождения
        </p>

        <div className="min-h-0 max-h-[min(50dvh,380px)] space-y-3.5 overflow-y-auto overscroll-contain pr-0.5 pb-1">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Фамилия
            </span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClassName}
              placeholder="Иванов"
              autoComplete="family-name"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Имя
            </span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClassName}
              placeholder="Иван"
              autoComplete="given-name"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Отчество
            </span>
            <input
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              className={inputClassName}
              placeholder="Иванович"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Дата рождения
            </span>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className={inputClassName}
            />
          </label>

          {error ? (
            <p
              className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex shrink-0 gap-3 border-t border-border/50 bg-card pt-5">
          <button
            type="button"
            onClick={() => !saving && handleClose()}
            disabled={saving}
            className="flex-1 rounded-xl border border-border/90 bg-muted/15 py-3.5 font-medium text-foreground shadow-sm transition-all hover:bg-muted/35 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-medium text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                Сохранение…
              </>
            ) : (
              "Сохранить"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
