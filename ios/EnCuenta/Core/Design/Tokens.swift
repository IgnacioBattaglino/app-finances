// GENERADO desde design/tokens.json por scripts/generate-tokens.mjs. No editar.
import SwiftUI
import UIKit

extension Color {
    static let paper = Color(light: 0xF1F2F6, dark: 0x0B0C10)
    static let card = Color(light: 0xFFFFFF, dark: 0x16181E)
    static let ink = Color(light: 0x14161B, dark: 0xF3F4F8)
    static let inkSoft = Color(light: 0x6B7180, dark: 0x9AA0AE)
    static let inkFaint = Color(light: 0x99A0AD, dark: 0x6C7280)
    static let line = Color(light: 0xE3E5EC, dark: 0x262A33)
    static let mist = Color(light: 0xE9EBF1, dark: 0x1E212A)
    static let lift = Color(light: 0xFFFFFF, dark: 0x363C4A)
    static let accent = Color(light: 0x0A7A55, dark: 0x0A7A55)
    static let accentInk = Color(light: 0x0A7A55, dark: 0x3ED598)
    static let gain = Color(light: 0x0E7A4E, dark: 0x35C783)
    static let clay = Color(light: 0xC3372B, dark: 0xFF6B5E)

    fileprivate init(light: UInt32, dark: UInt32) {
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

/// Los colores de una tarjeta física (los mismos ids que payment_cards.color).
enum CardColor: String, CaseIterable, Identifiable {
    case blue, red, black, white, gold

    var id: String { rawValue }

    var name: String {
        switch self {
        case .blue: "Azul"
        case .red: "Roja"
        case .black: "Negra"
        case .white: "Blanca"
        case .gold: "Dorada"
        }
    }

    var background: Color {
        switch self {
        case .blue: Color(light: 0x1D3A8A, dark: 0x1D3A8A)
        case .red: Color(light: 0x7A1F2B, dark: 0x7A1F2B)
        case .black: Color(light: 0x17181C, dark: 0x17181C)
        case .white: Color(light: 0xF5F5F0, dark: 0xF5F5F0)
        case .gold: Color(light: 0x7D5F1C, dark: 0x7D5F1C)
        }
    }

    var text: Color {
        switch self {
        case .blue: Color(light: 0xFFFFFF, dark: 0xFFFFFF)
        case .red: Color(light: 0xFFFFFF, dark: 0xFFFFFF)
        case .black: Color(light: 0xF2F2F2, dark: 0xF2F2F2)
        case .white: Color(light: 0x1A1A1E, dark: 0x1A1A1E)
        case .gold: Color(light: 0xFFFFFF, dark: 0xFFFFFF)
        }
    }
}

enum Radius {
    static let surface: CGFloat = 18
    static let control: CGFloat = 14
}

enum Space {
    static let xs: CGFloat = 4
    static let s: CGFloat = 8
    static let m: CGFloat = 12
    static let l: CGFloat = 16
    static let xl: CGFloat = 24
}
