"use client";

import { useFormStatus } from "react-dom";

/**
 * Every control that waits says so. A round trip with no feedback looks frozen,
 * and the natural response is to press it again -- which queues a second write.
 */
export default function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant = "primary",
  className = "",
  disabled = false,
  ...rest
}) {
  const { pending } = useFormStatus();
  const base = variant === "danger" ? "btn-danger" : variant === "plain" ? "btn" : "btn-primary";

  return (
    <button type="submit" disabled={pending || disabled} className={`${base} ${className}`.trim()} {...rest}>
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
