import { Head, Html, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html className="dark antialiased [font-feature-settings:'ss01'] scroll-smooth" lang="en">
      <Head/>
      <body className="bg-[#1D1D1D] overflow-x-hidden ">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
