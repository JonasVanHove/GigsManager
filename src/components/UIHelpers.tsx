"use client";

import { ReactNode } from "react";

interface HelpTextProps {
  children: ReactNode;
  variant?: "default" | "error" | "success" | "warning";
}

export default function HelpText({ children, variant = "default" }: HelpTextProps) {
  const styles = {
    default: "text-slate-500 dark:text-slate-400",
    error: "text-red-600 dark:text-red-400",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
  };

  return (
    <p className={`mt-1 text-xs ${styles[variant]}`}>
      {children}
    </p>
  );
}

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  helpText?: string;
  children: ReactNode;
  id?: string;
}

export function FormField({ label, required, error, helpText, children, id }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
        {required && <span className="ml-1 text-red-500" aria-label="required">*</span>}
      </label>
      {children}
      {error && (
        <div className="mt-1 flex items-center gap-1 text-xs text-red-600 dark:text-red-400" role="alert">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}
      {helpText && !error && <HelpText>{helpText}</HelpText>}
    </div>
  );
}

interface KeyboardShortcutProps {
  keys: string[];
  description: string;
}

export function KeyboardShortcut({ keys, description }: KeyboardShortcutProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
      <span className="text-sm text-slate-600 dark:text-slate-400">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, index) => (
          <span key={index}>
            <kbd className="rounded bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 shadow dark:bg-slate-700 dark:text-slate-300">
              {key}
            </kbd>
            {index < keys.length - 1 && <span className="mx-1 text-slate-400">+</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
