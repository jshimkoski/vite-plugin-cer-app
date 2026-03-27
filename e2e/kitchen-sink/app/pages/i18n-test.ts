component('page-i18n-test', () => {
  const { locale, locales, defaultLocale, switchLocalePath } = useLocale()

  return html`
    <div>
      <h1 data-cy="i18n-heading">i18n Test Page</h1>
      <p data-cy="current-locale">${locale}</p>
      <p data-cy="default-locale">${defaultLocale}</p>
      <p data-cy="locales">${locales.join(',')}</p>
      <a data-cy="switch-to-fr" href="${switchLocalePath('fr')}">Switch to FR</a>
      <a data-cy="switch-to-en" href="${switchLocalePath('en')}">Switch to EN</a>
    </div>
  `
})
