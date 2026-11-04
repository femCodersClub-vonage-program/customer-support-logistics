import styles from './TopBar.module.css';

export function TopBar() {
  return (
    <header className={styles.bar}>
      <p className={styles.brand}>
        CSL <span className={styles.accent}>Support</span>
      </p>
    </header>
  );
}
