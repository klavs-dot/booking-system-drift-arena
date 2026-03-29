export const metadata = {
  title: 'Drift Arena — Rezervācijas',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="lv">
      <body style={{ margin: 0, padding: 0, background: '#0d0d1a' }}>
        {children}
      </body>
    </html>
  )
}
