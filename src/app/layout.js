export const metadata = {
  title: 'Drift Arena — Rezervācijas',
  viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({ children }) {
  return (
    <html lang="lv">
      <body style={{ margin: 0, padding: 0, background: '#0d0d1a', fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
