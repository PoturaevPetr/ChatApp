"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { AuthShell, AuthShellBody } from "@/components/auth/AuthShell";
import { AuthHero } from "@/components/auth/AuthHero";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { AuthPrimaryButton } from "@/components/auth/AuthPrimaryButton";
import { AuthBackLink, AuthTopBar } from "@/components/auth/AuthBackLink";
import { AuthStepIndicator } from "@/components/auth/AuthStepIndicator";
import { AuthOAuthSection } from "@/components/auth/AuthOAuthSection";
import { authInputClassName } from "@/components/auth/authStyles";

type Step = 1 | 2 | 3;

const MIN_PASSWORD_LENGTH = 8;
const SIMPLE_PASSWORDS = ["password", "password1", "12345678", "qwerty123", "qwerty", "abc12345", "admin123"];

function validatePassword(p: string): {
  valid: boolean;
  hasLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasDigit: boolean;
  notSimple: boolean;
} {
  const hasLength = p.length >= MIN_PASSWORD_LENGTH;
  const hasUpper = /[A-Z]/.test(p);
  const hasLower = /[a-z]/.test(p);
  const hasDigit = /\d/.test(p);
  const notSimple = !SIMPLE_PASSWORDS.includes(p.toLowerCase());
  return {
    valid: hasLength && hasUpper && hasLower && hasDigit && notSimple,
    hasLength,
    hasUpper,
    hasLower,
    hasDigit,
    notSimple,
  };
}

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading, error, clearError, initialize } = useAuthStore();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>(1);

  // Step 1: Personal info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [birthDate, setBirthDate] = useState("");

  // Step 2: Account credentials
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Step 3: Cloud recovery password
  const [recoveryMode, setRecoveryMode] = useState<"account" | "custom">("account");
  const [customRecoveryPassword, setCustomRecoveryPassword] = useState("");
  const [confirmCustomRecoveryPassword, setConfirmCustomRecoveryPassword] = useState("");
  const [showCustomPassword, setShowCustomPassword] = useState(false);
  const [showConfirmCustomPassword, setShowConfirmCustomPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initialize();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialize]);

  useEffect(() => {
    clearError();
  }, [step, clearError]);

  const canContinueStep1 = firstName.trim() && lastName.trim() && birthDate;

  const handleContinueStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canContinueStep1) return;
    setStep(2);
  };

  const passwordValidation = validatePassword(password);
  const canContinueStep2 =
    username.trim() && password.trim() && password === confirmPassword && passwordValidation.valid;

  const handleContinueStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canContinueStep2) return;
    setStep(3);
  };

  const canSubmitStep3 =
    recoveryMode === "account" ||
    (customRecoveryPassword.length >= 6 &&
      customRecoveryPassword === confirmCustomRecoveryPassword);

  const handleFinishRegister = async (skipBackup: boolean = false) => {
    try {
      await register({
        username: username.trim(),
        password: password.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        middle_name: middleName.trim(),
        birth_date: birthDate,
        recoveryPassword:
          !skipBackup && recoveryMode === "custom" ? customRecoveryPassword.trim() : undefined,
        skipBackup,
      });
      router.push("/auth/login/");
    } catch {
      // error set in authStore
    }
  };

  const getHeroSubtitle = () => {
    switch (step) {
      case 1:
        return "Шаг 1 — ваши данные";
      case 2:
        return "Шаг 2 — логин и пароль";
      case 3:
        return "Шаг 3 — облачный пароль для защиты переписки";
    }
  };

  return (
    <AuthShell loading={!ready}>
      <AuthTopBar>
        {step === 1 ? (
          <AuthBackLink href="/auth/" />
        ) : (
          <AuthBackLink onClick={() => setStep((s) => (s === 3 ? 2 : 1))} />
        )}
      </AuthTopBar>

      <AuthShellBody>
        <AuthHero title="Регистрация" subtitle={getHeroSubtitle()} showLogo={false} />

        <AuthStepIndicator step={step} total={3} />

        {step === 1 ? (
          <>
            <AuthOAuthSection dividerLabel="или форма" />

            <AuthCard padded>
              <form onSubmit={handleContinueStep1} className="space-y-4">
                <AuthFormField
                  id="lastName"
                  label="Фамилия"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Иванов"
                  required
                />
                <AuthFormField
                  id="firstName"
                  label="Имя"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Иван"
                  required
                />
                <AuthFormField
                  id="middleName"
                  label="Отчество"
                  type="text"
                  autoComplete="additional-name"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                  placeholder="Иванович"
                />
                <AuthFormField
                  id="birthDate"
                  label="Дата рождения"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  required
                />
                <AuthPrimaryButton type="submit" disabled={!canContinueStep1}>
                  Продолжить
                  <ArrowRight size={18} aria-hidden />
                </AuthPrimaryButton>
              </form>
            </AuthCard>
          </>
        ) : step === 2 ? (
          <AuthCard padded>
            <form onSubmit={handleContinueStep2} className="space-y-4">
              {error ? (
                <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
              ) : null}

              <AuthFormField
                id="username"
                label="Имя пользователя (логин)"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Введите логин"
                required
              />

              <AuthFormField id="password" label="Пароль">
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className={`${authInputClassName} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                    title={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {password ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <li className={passwordValidation.hasLength ? "text-green-600 dark:text-green-400" : ""}>
                      {passwordValidation.hasLength ? "✓" : "○"} Минимум {MIN_PASSWORD_LENGTH} символов
                    </li>
                    <li className={passwordValidation.hasUpper ? "text-green-600 dark:text-green-400" : ""}>
                      {passwordValidation.hasUpper ? "✓" : "○"} Заглавные буква
                    </li>
                    <li className={passwordValidation.hasLower ? "text-green-600 dark:text-green-400" : ""}>
                      {passwordValidation.hasLower ? "✓" : "○"} Строчные буква
                    </li>
                    <li className={passwordValidation.hasDigit ? "text-green-600 dark:text-green-400" : ""}>
                      {passwordValidation.hasDigit ? "✓" : "○"} Цифры
                    </li>
                    <li className={passwordValidation.notSimple ? "text-green-600 dark:text-green-400" : ""}>
                      {passwordValidation.notSimple ? "✓" : "○"} Не слишком простой пароль
                    </li>
                  </ul>
                ) : null}
              </AuthFormField>

              <AuthFormField id="confirmPassword" label="Подтверждение пароля">
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className={`${authInputClassName} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
                    title={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {password && confirmPassword && password !== confirmPassword ? (
                  <p className="mt-1 text-sm text-destructive">Пароли не совпадают</p>
                ) : null}
              </AuthFormField>

              <AuthPrimaryButton type="submit" disabled={!canContinueStep2}>
                Продолжить
                <ArrowRight size={18} aria-hidden />
              </AuthPrimaryButton>
            </form>
          </AuthCard>
        ) : (
          <AuthCard padded>
            <div className="space-y-4">
              {error ? (
                <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
              ) : null}

              <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs leading-relaxed text-foreground">
                <ShieldCheck className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                <p>
                  Ваши сообщения защищены сквозным шифрованием (E2E). Облачный пароль позволяет восстановить
                  доступ к переписке при входе с других устройств. Сервер не имеет доступа к вашему паролю
                  и сообщениям.
                </p>
              </div>

              <div className="space-y-3 pt-1">
                <label
                  onClick={() => setRecoveryMode("account")}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                    recoveryMode === "account"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="recoveryMode"
                    checked={recoveryMode === "account"}
                    onChange={() => setRecoveryMode("account")}
                    className="mt-1 text-primary focus:ring-primary"
                  />
                  <div className="flex-1 text-xs">
                    <span className="font-semibold text-foreground block">
                      Использовать пароль от аккаунта (рекомендуется)
                    </span>
                    <span className="text-muted-foreground mt-0.5 block">
                      Удобно — при входе с нового устройства сообщения расшифруются автоматически тем же паролем.
                    </span>
                  </div>
                </label>

                <label
                  onClick={() => setRecoveryMode("custom")}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                    recoveryMode === "custom"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="recoveryMode"
                    checked={recoveryMode === "custom"}
                    onChange={() => setRecoveryMode("custom")}
                    className="mt-1 text-primary focus:ring-primary"
                  />
                  <div className="flex-1 text-xs">
                    <span className="font-semibold text-foreground block">
                      Задать отдельный облачный пароль
                    </span>
                    <span className="text-muted-foreground mt-0.5 block">
                      Максимальная приватность: отдельный пароль только для расшифровки истории переписки.
                    </span>
                  </div>
                </label>
              </div>

              {recoveryMode === "custom" ? (
                <div className="space-y-3.5 pt-2 border-t border-border/60">
                  <AuthFormField id="customRecoveryPassword" label="Облачный пароль">
                    <div className="relative">
                      <input
                        id="customRecoveryPassword"
                        type={showCustomPassword ? "text" : "password"}
                        value={customRecoveryPassword}
                        onChange={(e) => setCustomRecoveryPassword(e.target.value)}
                        placeholder="Минимум 6 символов"
                        className={`${authInputClassName} pr-12`}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowCustomPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:text-foreground"
                        aria-label={showCustomPassword ? "Скрыть пароль" : "Показать пароль"}
                      >
                        {showCustomPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </AuthFormField>

                  <AuthFormField
                    id="confirmCustomRecoveryPassword"
                    label="Подтверждение облачного пароля"
                  >
                    <div className="relative">
                      <input
                        id="confirmCustomRecoveryPassword"
                        type={showConfirmCustomPassword ? "text" : "password"}
                        value={confirmCustomRecoveryPassword}
                        onChange={(e) => setConfirmCustomRecoveryPassword(e.target.value)}
                        placeholder="Повторите пароль"
                        className={`${authInputClassName} pr-12`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmCustomPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:text-foreground"
                        aria-label={showConfirmCustomPassword ? "Скрыть пароль" : "Показать пароль"}
                      >
                        {showConfirmCustomPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {customRecoveryPassword &&
                    confirmCustomRecoveryPassword &&
                    customRecoveryPassword !== confirmCustomRecoveryPassword ? (
                      <p className="mt-1 text-sm text-destructive">Пароли не совпадают</p>
                    ) : null}
                  </AuthFormField>
                </div>
              ) : null}

              <div className="pt-2 space-y-2.5">
                <AuthPrimaryButton
                  type="button"
                  disabled={!canSubmitStep3 || isLoading}
                  loading={isLoading}
                  loadingLabel="Регистрация..."
                  onClick={() => void handleFinishRegister(false)}
                >
                  <KeyRound size={18} className="mr-1.5" />
                  Завершить регистрацию
                </AuthPrimaryButton>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => void handleFinishRegister(true)}
                  className="w-full py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors text-center"
                >
                  Пропустить (настроить позже в профиле)
                </button>
              </div>
            </div>
          </AuthCard>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Уже есть аккаунт?{" "}
          <Link href="/auth/login/" className="font-medium text-primary hover:underline">
            Войти
          </Link>
        </p>
      </AuthShellBody>
    </AuthShell>
  );
}
