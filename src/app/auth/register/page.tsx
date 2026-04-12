"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Loader2, ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

type Step = 1 | 2;

const MIN_PASSWORD_LENGTH = 8;
const SIMPLE_PASSWORDS = ["password", "password1", "12345678", "qwerty123", "qwerty", "abc12345", "admin123"];

function validatePassword(p: string): { valid: boolean; hasLength: boolean; hasUpper: boolean; hasLower: boolean; hasDigit: boolean; notSimple: boolean } {
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
  const { isAuthenticated, register, isLoading, error, clearError, initialize } = useAuthStore();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>(1);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

  // After registration we redirect to login (no auto-login)

  useEffect(() => {
    clearError();
  }, [step, clearError]);

  const canContinueStep1 = firstName.trim() && lastName.trim() && birthDate;

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canContinueStep1) return;
    setStep(2);
  };

  const passwordValidation = validatePassword(password);
  const canSubmitStep2 =
    username.trim() &&
    password.trim() &&
    password === confirmPassword &&
    passwordValidation.valid;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitStep2) return;
    try {
      await register({
        username: username.trim(),
        password: password.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        middle_name: middleName.trim(),
        birth_date: birthDate,
      });
      router.push("/auth/login/");
    } catch {
      // error in store
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="shrink-0 p-4">
        {step === 1 ? (
          <Link
            href="/auth/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={18} />
            Назад
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={18} />
            Назад
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-primary/15 text-primary items-center justify-center mb-4">
            <MessageCircle size={32} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Регистрация</h1>
          <p className="mt-2 text-muted-foreground">
            {step === 1 ? "Шаг 1 из 2 — Ваши данные" : "Шаг 2 из 2 — Логин и пароль"}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleContinue} className="space-y-4">
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-foreground mb-1">
                Фамилия
              </label>
              <input
                id="lastName"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Иванов"
                required
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-foreground mb-1">
                Имя
              </label>
              <input
                id="firstName"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Иван"
                required
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="middleName" className="block text-sm font-medium text-foreground mb-1">
                Отчество
              </label>
              <input
                id="middleName"
                type="text"
                autoComplete="additional-name"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                placeholder="Иванович"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="birthDate" className="block text-sm font-medium text-foreground mb-1">
                Дата рождения
              </label>
              <input
                id="birthDate"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              disabled={!canContinueStep1}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 px-4 font-medium disabled:opacity-50 hover:enabled:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Продолжить
              <ArrowRight size={20} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-foreground mb-1">
                Имя пользователя (логин)
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Введите логин"
                required
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
                Пароль
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl border border-border bg-background px-4 pr-12 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  title={showPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {password && (
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
              )}
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-1">
                Подтверждение пароля
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl border border-border bg-background px-4 pr-12 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
                  title={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {password && confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-sm text-destructive">Пароли не совпадают</p>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoading || !canSubmitStep2}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 px-4 font-medium disabled:opacity-50 hover:enabled:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Регистрация...
                </>
              ) : (
                "Зарегистрироваться"
              )}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Уже есть аккаунт?{" "}
          <Link href="/auth/login/" className="text-primary font-medium hover:underline">
            Войти
          </Link>
        </p>
        </div>
      </div>
    </div>
  );
}
