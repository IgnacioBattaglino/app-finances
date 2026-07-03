# ADR-001: Supabase como backend en lugar de Google Sheets

**Estado:** Aceptada — Julio 2026

## Contexto
El sistema de finanzas personales existía como planilla de Google Sheets, con la lógica de cálculo en fórmulas. Al construir la app se evaluó mantener la planilla como base de datos (la app como capa de presentación sobre la Google Sheets API) o migrar a una base de datos relacional.

## Decisión
Migrar a Supabase (PostgreSQL). La planilla se usó como especificación de requisitos y se rediseñó como modelo relacional (ver ARCHITECTURE.md).

## Consecuencias
- (+) Modelo de datos relacional con integridad referencial, restricciones y tipos correctos.
- (+) No requiere capa serverless intermedia para autenticar contra Google.
- (+) Sincronización nativa entre dispositivos y camino directo a features futuras (auth, realtime).
- (+) Mayor valor como pieza de portfolio: diseño de base de datos propio.
- (−) La lógica de cálculo de la planilla debe reimplementarse en la app.
- (−) La planilla original deja de ser la fuente de verdad.
