import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './Input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  /**
   * When `showCounter` is true and `maxLength` is set, renders a character
   * counter below the field in the format "32/100" (MIN-008).
   */
  showCounter?: boolean;
}

function cls(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
}

// eslint-disable-next-line complexity -- form input naturally has many optional slots
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    hint,
    leftIcon,
    rightIcon,
    fullWidth = false,
    showCounter = false,
    className,
    id,
    ...rest
  },
  ref,
) {
  const currentLength =
    showCounter && rest.maxLength != null
      ? String(rest.value ?? '').length
      : null;
  const reactId = useId();
  const inputId = id ?? `in-${reactId}`;
  const hintId = hint ? `${inputId}-hint` : '';
  const errorId = error ? `${inputId}-error` : '';
  const describedBy = cls(hintId, errorId) || undefined;

  const wrapperCls = cls(
    styles.wrapper,
    fullWidth ? styles.fullWidth : '',
    className ?? '',
  );

  const fieldCls = cls(
    styles.field,
    error ? styles.fieldError : '',
    leftIcon ? styles.hasLeft : '',
    rightIcon ? styles.hasRight : '',
  );

  return (
    <div className={wrapperCls}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className={styles.fieldWrap}>
        {leftIcon && <span className={styles.iconLeft} aria-hidden="true">{leftIcon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={fieldCls}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {rightIcon && <span className={styles.iconRight} aria-hidden="true">{rightIcon}</span>}
      </div>
      {hint && !error && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} role="alert" className={styles.errorMsg}>
          {error}
        </span>
      )}
      {currentLength !== null && !error && (
        <span
          className={cls(
            styles.counter,
            currentLength >= (rest.maxLength ?? 0) ? styles.counterLimit : '',
          )}
          aria-live="polite"
        >
          {currentLength}/{rest.maxLength}
        </span>
      )}
    </div>
  );
});

export default Input;
