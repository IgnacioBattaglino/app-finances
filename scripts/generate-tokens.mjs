// Genera ios/EnCuenta/Core/Design/Tokens.swift desde design/tokens.json.
// Uso: node scripts/generate-tokens.mjs   (con --check falla si está viejo)
import { readFileSync, writeFileSync } from 'node:fs'

const tokens = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url)))
const out = new URL('../ios/EnCuenta/Core/Design/Tokens.swift', import.meta.url)
const hex = (h) => `0x${h.slice(1).toUpperCase()}`

const swift = `// GENERADO desde design/tokens.json por scripts/generate-tokens.mjs. No editar.
import SwiftUI
import UIKit

extension Color {
${Object.entries(tokens.color)
  .map(([name, { light, dark }]) => `    static let ${name} = Color(light: ${hex(light)}, dark: ${hex(dark)})`)
  .join('\n')}

    private init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { traits in
            let v = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((v >> 16) & 0xFF) / 255,
                green: CGFloat((v >> 8) & 0xFF) / 255,
                blue: CGFloat(v & 0xFF) / 255,
                alpha: 1
            )
        })
    }
}

enum Radius {
${Object.entries(tokens.radius).map(([k, v]) => `    static let ${k}: CGFloat = ${v}`).join('\n')}
}

enum Space {
${Object.entries(tokens.space).map(([k, v]) => `    static let ${k}: CGFloat = ${v}`).join('\n')}
}
`

if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== swift) {
    console.error('Tokens.swift está desactualizado: corré node scripts/generate-tokens.mjs')
    process.exit(1)
  }
} else {
  writeFileSync(out, swift)
}
