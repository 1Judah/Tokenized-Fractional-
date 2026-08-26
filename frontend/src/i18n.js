import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import { isRTLLanguage, getLanguageDirection } from './utils/i18nFormatters';

// Language configuration
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', name: 'English' },
  { code: 'es', label: 'Español', name: 'Spanish' },
  { code: 'fr', label: 'Français', name: 'French' },
  { code: 'de', label: 'Deutsch', name: 'German' },
];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      de: { translation: de },
    },
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

// Update document attributes when language changes
i18n.on('languageChanged', (lng) => {
  // Set lang attribute for accessibility
  document.documentElement.lang = lng;
  
  // Set dir attribute for RTL support
  const direction = getLanguageDirection(lng);
  document.documentElement.dir = direction;
  document.body.dir = direction;
  
  // Add RTL class for CSS styling
  if (isRTLLanguage(lng)) {
    document.documentElement.classList.add('rtl');
    document.body.classList.add('rtl');
  } else {
    document.documentElement.classList.remove('rtl');
    document.body.classList.remove('rtl');
  }
});

// Set initial language attributes
const initialLng = i18n.language || 'en';
document.documentElement.lang = initialLng;
const initialDir = getLanguageDirection(initialLng);
document.documentElement.dir = initialDir;
document.body.dir = initialDir;

export default i18n;
