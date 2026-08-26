import React from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import styles from './LanguageSwitcher.module.css';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage || i18n.language;

  const handleLanguageChange = (langCode) => {
    i18n.changeLanguage(langCode);
  };

  return (
    <div className={styles.switcher} role="group" aria-label="Language selector">
      {SUPPORTED_LANGUAGES.map(({ code, label, name }) => (
        <button
          key={code}
          className={`${styles.btn} ${current.startsWith(code) ? styles.active : ''}`}
          onClick={() => handleLanguageChange(code)}
          aria-pressed={current.startsWith(code)}
          aria-label={`Switch language to ${name}`}
          title={name}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
