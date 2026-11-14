import styles from "./ui.module.css";

export function Brand() {
  return (
    <a className={styles.brand} href="#top" aria-label="Khonsu home">
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M31 5.5a19.5 19.5 0 1 0 9.4 29.1A17.3 17.3 0 0 1 31 5.5Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13 35.5 34.5 14" stroke="var(--ivory)" strokeWidth="1.6" />
        <circle cx="18" cy="30.5" r="2.5" fill="var(--ivory)" />
        <circle cx="32.5" cy="16" r="2.5" fill="currentColor" />
      </svg>
      <span>KHONSU<span className={styles.brandCaption}>FIND WHAT TIME REVEALS</span></span>
    </a>
  );
}
