"use client";

import { useState, useEffect } from "react";

interface Shortcut {
  keys: string[];
  description: string;
  action: () => void;
}

interface KeyboardShortcutsProps {
  shortcuts: Shortcut[];
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
}

export default function KeyboardShortcuts({
  shortcuts,
  onExpandAll,
  onCollapseAll,
}: KeyboardShortcutsProps) {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Show help with ? key
      if (e.key === "?" && !showHelp) {
        e.preventDefault();
        setShowHelp(true);
        return;
      }

      // Close help with Escape
      if (e.key === "Escape" && showHelp) {
        e.preventDefault();
        setShowHelp(false);
        return;
      }

      // Don't trigger shortcuts if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      // Check for registered shortcuts
      for (const shortcut of shortcuts) {
        const isMatch = shortcut.keys.every((key) => {
          if (key === "Cmd") return e.metaKey;
          if (key === "Ctrl") return e.ctrlKey;
          if (key === "Alt") return e.altKey;
          if (key === "Shift") return e.shiftKey;
          return e.key.toLowerCase() === key.toLowerCase();
        });

        if (isMatch) {
          e.preventDefault();
          shortcut.action();
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts, showHelp]);

  if (!showHelp) {
    return (
      <button
        onClick={() => setShowHelp(true)}
        title="Press ? for keyboard shortcuts"
        className="fixed bottom-24 right-4 z-40 rounded-full bg-slate-800 dark:bg-slate-700 text-white p-2.5 shadow-lg transition hover:bg-slate-700 dark:hover:bg-slate-600"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.921v.003m0 5.042a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-10 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Keyboard Shortcuts</h2>
          <button
            onClick={() => setShowHelp(false)}
            title="Close (Esc)"
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6 max-h-96 overflow-y-auto">
          {/* Navigation */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">
              Navigation
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-300">Show help</span>
                <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  ?
                </kbd>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-300">Close</span>
                <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  Esc
                </kbd>
              </div>
            </div>
          </div>

          {/* Card Controls */}
          {(onExpandAll || onCollapseAll) && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">
                Card Controls
              </h3>
              <div className="space-y-2">
                {onExpandAll && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-300">Expand all</span>
                    <div className="flex gap-1">
                      <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}
                      </kbd>
                      <span className="text-slate-400">+</span>
                      <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        E
                      </kbd>
                    </div>
                  </div>
                )}
                {onCollapseAll && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-300">Collapse all</span>
                    <div className="flex gap-1">
                      <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}
                      </kbd>
                      <span className="text-slate-400">+</span>
                      <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        C
                      </kbd>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Custom Shortcuts */}
          {shortcuts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">
                Actions
              </h3>
              <div className="space-y-2">
                {shortcuts.map((shortcut, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{shortcut.description}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key, i) => (
                        <div key={`${idx}-${i}`}>
                          <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {key === "Cmd" || key === "Ctrl"
                              ? navigator.platform.includes("Mac")
                                ? "⌘"
                                : "Ctrl"
                              : key === "Alt"
                              ? "Alt"
                              : key === "Shift"
                              ? "Shift"
                              : key.toUpperCase()}
                          </kbd>
                          {i < shortcut.keys.length - 1 && (
                            <span className="text-slate-400 ml-1">+</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 p-3">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              💡 <strong>Tip:</strong> Press and hold shortcuts to quickly collapse and expand cards to focus on what matters.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-end">
          <button
            onClick={() => setShowHelp(false)}
            className="rounded-lg bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
